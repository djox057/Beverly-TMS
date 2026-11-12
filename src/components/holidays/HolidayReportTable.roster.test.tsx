const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ getPrimaryRole: () => auth.role }) }));
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
  auth.role = 'admin';
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

it.each(['admin', 'manager', 'dispatch', 'supervisor', 'accounting'])('enforces bonus editing for %s', async role => {
  auth.role = role;
  api.load.mockResolvedValue({ data: [{ id: 'a', truck: '03212', note: 'Saved note', color: 'driving', bonus: true }], error: null });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const bonus = await screen.findByRole('combobox', { name: 'Bonus for truck 03212' });
  expect(bonus).toHaveValue('yes');
  if (role === 'admin' || role === 'manager') {
    expect(bonus).toBeEnabled();
    fireEvent.change(bonus, { target: { value: 'no' } });
    await waitFor(() => expect(api.calls.find(call => call.action === 'update')?.payload).toEqual({ bonus: false }));
  } else {
    expect(bonus).toBeDisabled();
    expect(api.calls.filter(call => call.action !== 'select')).toHaveLength(0);
  }
  const note = screen.getByRole('textbox', { name: 'Note for truck 03212' });
  if (role === 'accounting') {
    expect(note).toBeDisabled();
    screen.getAllByRole('button', { name: 'Driving status' }).forEach(button => expect(button).toBeDisabled());
    fireEvent.click(screen.getAllByRole('button', { name: 'Expand Note' })[0]);
    expect(screen.getByRole('textbox', { name: 'Expanded note' })).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  } else expect(note).toBeEnabled();
});
it('persists a new bonus and keeps it when the row is filtered out and back', async () => {
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const bonus = await screen.findByRole('combobox', { name: 'Bonus for truck 03212' });
  fireEvent.change(bonus, { target: { value: 'yes' } });
  expect(api.calls.filter(call => call.action !== 'select')).toHaveLength(0);
  fireEvent.change(screen.getByRole('textbox', { name: 'Bonus amount', exact: true }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(api.calls.find(call => call.action === 'insert')?.payload).toMatchObject({ bonus: true, bonus_amount: 100 }));
  const search = screen.getByRole('textbox', { name: 'Search holiday notes' });
  fireEvent.change(search, { target: { value: 'missing' } });
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByRole('combobox', { name: 'Bonus for truck 03212' })).toHaveValue('yes');
});

it.each(['admin', 'manager', 'accounting', 'supervisor', 'dispatch'])('limits amount editing for %s and disables amounts for No', async role => {
  auth.role = role;
  api.load.mockResolvedValue({ data: [{ id: 'a', truck: '03212', note: '', bonus: true, bonus_amount: 100 }], error: null });
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const amount = await screen.findByRole('button', { name: 'Bonus amount for truck 03212' });
  expect(amount).toHaveTextContent('$100');
  expect(screen.getByRole('button', { name: 'Bonus amount for truck 3212' })).toBeDisabled();
  if (['admin', 'manager', 'accounting'].includes(role)) {
    expect(amount).toBeEnabled();
    fireEvent.click(amount);
    fireEvent.change(screen.getByRole('textbox', { name: 'Bonus amount', exact: true }), { target: { value: '125.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(api.calls.find(call => call.action === 'update')?.payload).toEqual({ bonus_amount: 125.5 }));
  } else expect(amount).toBeDisabled();
});
it('cancels a new bonus, validates the amount, and clears the amount when set to No', async () => {
  render(<HolidayReportTable year={2026} holidaySlug="christmas" />);
  const bonus = await screen.findByRole('combobox', { name: 'Bonus for truck 03212' });
  fireEvent.change(bonus, { target: { value: 'yes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(bonus).toHaveValue('no');
  expect(api.calls.filter(call => call.action !== 'select')).toHaveLength(0);
  fireEvent.change(bonus, { target: { value: 'yes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a positive amount');
  fireEvent.change(screen.getByRole('textbox', { name: 'Bonus amount', exact: true }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(api.calls.find(call => call.action === 'insert')?.payload).toMatchObject({ bonus: true, bonus_amount: 100 }));
  fireEvent.change(bonus, { target: { value: 'no' } });
  await waitFor(() => expect(api.calls.find(call => call.action === 'update')?.payload).toEqual({ bonus: false, bonus_amount: null }));
  expect(screen.getByRole('button', { name: 'Bonus amount for truck 03212' })).toBeDisabled();
});
