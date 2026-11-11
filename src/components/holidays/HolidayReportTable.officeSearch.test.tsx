import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HolidayReportTable } from './HolidayReportTable';

vi.mock('@/hooks/useHolidayTrucks', () => ({ useHolidayTrucks: () => ({ data: [{ number: '03212', driverName: 'Zero Driver', dispatcherName: 'Zero Dispatch', dispatcherOffice: 'Čačak', dispatcherCreatedAt: '2021-01-01' }, { number: '3212', driverName: 'Other Driver', dispatcherName: 'Other Dispatch', dispatcherOffice: 'BG 1st FLOOR', dispatcherCreatedAt: '2020-01-01' }], isLoading: false, isError: false, refetch: vi.fn() }) }));
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
it('switches office tabs to a searched truck and orders dispatcher groups oldest first', async () => {
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  await screen.findByRole('textbox', { name: 'Note for truck 03212' });
  expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Other Dispatch');
  fireEvent.click(screen.getByRole('button', { name: 'Čačak' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search holiday notes' }), { target: { value: '3212' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'BG 1st FLOOR' })).toHaveAttribute('aria-pressed', 'true'));
});
