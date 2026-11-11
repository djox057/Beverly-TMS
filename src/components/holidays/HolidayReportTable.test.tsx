import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HolidayReportTable } from './HolidayReportTable';

const api = vi.hoisted(() => ({ calls: [] as { action: string; payload?: unknown; filters: unknown[] }[], load: vi.fn(), write: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const call = { action: 'select', payload: undefined as unknown, filters: [] as unknown[] };
  const builder = {
    select: () => builder, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return builder; },
    order: () => builder, range: () => { api.calls.push(call); return api.load(); },
    insert: (payload: unknown) => { call.action = 'insert'; call.payload = payload; return builder; },
    update: (payload: unknown) => { call.action = 'update'; call.payload = payload; return builder; },
    delete: () => { call.action = 'delete'; return builder; },
    single: () => { api.calls.push(call); return api.write(); },
  }; return builder;
} } }));
beforeEach(() => { api.calls = []; api.load.mockResolvedValue({ data: [], error: null }); api.write.mockResolvedValue({ data: { id: 'row-1' }, error: null }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('loads a scoped two-column table and saves truck numbers without losing leading zeros', async () => {
  render(<HolidayReportTable year={2026} holidaySlug="thanksgiving" />);
  expect(await screen.findAllByRole('columnheader')).toHaveLength(2);
  expect(api.calls[0].filters).toEqual([['year', 2026], ['holiday_slug', 'thanksgiving']]);
  const truck = screen.getAllByRole('textbox', { name: 'Truck number' })[0];
  fireEvent.change(truck, { target: { value: '03212' } }); fireEvent.blur(truck);
  await waitFor(() => expect(api.calls.some(call => call.action === 'insert')).toBe(true));
  expect(api.calls.find(call => call.action === 'insert')!.payload).toMatchObject({ truck: '03212', year: 2026, holiday_slug: 'thanksgiving' });
});
it('keeps unsaved notes on a save error and allows retry', async () => {
  api.write.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const note = (await screen.findAllByRole('textbox', { name: 'Note' }))[0];
  fireEvent.change(note, { target: { value: 'Driver is home' } }); fireEvent.blur(note);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry save' }));
  await waitFor(() => expect(screen.queryByText('Could not save.')).not.toBeInTheDocument());
  expect(note).toHaveValue('Driver is home');
  expect(api.calls.filter(call => call.action === 'insert')).toHaveLength(2);
});
it('serializes quick cell edits and patches only the changed column', async () => {
  api.load.mockResolvedValue({ data: [{ id: 'row-1', truck: '03212', note: 'Original' }], error: null });
  let resolveFirst!: (value: unknown) => void;
  api.write.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const note = (await screen.findAllByRole('textbox', { name: 'Note for truck 03212' }))[0];
  fireEvent.change(note, { target: { value: 'First edit' } }); fireEvent.blur(note);
  await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
  fireEvent.change(note, { target: { value: 'Latest edit' } }); fireEvent.blur(note);
  expect(api.write).toHaveBeenCalledTimes(1);
  await act(async () => resolveFirst({ data: { id: 'row-1' }, error: null }));
  await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
  expect(api.calls.filter(call => call.action === 'update').map(call => call.payload)).toEqual([{ note: 'First edit' }, { note: 'Latest edit' }]);
  expect(note).toHaveValue('Latest edit');
});
it('does not offer editable blank rows when the saved report fails to load', async () => {
  api.load.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load holiday notes.');
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Add row' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByRole('textbox', { name: 'Truck number' })).toHaveLength(10);
});
