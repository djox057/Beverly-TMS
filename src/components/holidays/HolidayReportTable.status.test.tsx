vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ getPrimaryRole: () => 'admin' }) }));
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
it('filters driving statuses and updates the visible truck count with search', async () => {
  api.load.mockResolvedValue({ data: [{ id: 'a', truck: '03212', note: 'On road', color: 'driving' }, { id: 'b', truck: '3212', note: 'Home', color: 'not_driving' }], error: null });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  await screen.findByText('2 trucks');
  expect(screen.queryByRole('button', { name: 'BEOGRAD' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recovery' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Driving' }));
  expect(screen.getByText('1 trucks')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Note for truck 03212' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Note for truck 3212' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search holiday notes' }), { target: { value: 'missing' } });
  expect(screen.getByText('0 trucks')).toBeInTheDocument();
});
