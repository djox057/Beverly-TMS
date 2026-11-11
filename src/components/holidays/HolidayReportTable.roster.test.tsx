import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HolidayReportTable } from './HolidayReportTable';

vi.mock('@/hooks/useHolidayTrucks', () => ({ useHolidayTrucks: () => ({ data: [{ number: '03212', driverName: 'Zero Driver', dispatcherName: 'Zero Dispatch' }, { number: '3212', driverName: 'Other Driver', dispatcherName: 'Other Dispatch' }], isLoading: false, isError: false, refetch: vi.fn() }) }));
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
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  api.calls = []; api.load.mockResolvedValue({ data: [], error: null }); api.write.mockResolvedValue({ data: { id: 'row-1' }, error: null }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows one fixed row per truck with no add or delete controls', async () => {
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const trucks = await screen.findAllByRole('combobox', { name: 'Truck number' });
  expect(trucks).toHaveLength(2);
  trucks.forEach(truck => expect(truck).toBeDisabled());
  expect(screen.queryByRole('button', { name: 'Add row' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Delete row/ })).not.toBeInTheDocument();
  const note = screen.getByRole('textbox', { name: 'Note for truck 03212' });
  fireEvent.change(note, { target: { value: 'Home for Christmas' } }); fireEvent.blur(note);
  await waitFor(() => expect(api.calls.find(call => call.action === 'insert')?.payload).toMatchObject({ truck: '03212', note: 'Home for Christmas', year: 2026, holiday_slug: 'christmas' }));
});
it('keeps the roster at one row per truck even when older duplicate entries exist', async () => {
  api.load.mockResolvedValue({ data: [{ id: 'a', truck: '03212', note: 'First note', color: null }, { id: 'b', truck: '03212', note: 'Second note', color: null }], error: null });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  expect(await screen.findAllByRole('combobox', { name: 'Truck number' })).toHaveLength(2);
  expect(screen.getAllByRole('textbox', { name: 'Note for truck 03212' })).toHaveLength(1);
});
