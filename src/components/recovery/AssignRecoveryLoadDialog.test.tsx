import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssignRecoveryLoadDialog } from './AssignRecoveryLoadDialog';

const fixture = vi.hoisted(() => ({
  orderError: null as Error | null,
  bookingCompany: 'BF Prime LLC',
  invoke: vi.fn(),
  route: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/mapboxRouteCalculator', () => ({ calculateDhMiles: (...args: unknown[]) => fixture.route(...args), geocodeAddress: async () => ({ lat: 40, lon: -90 }) }));
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ options, value, onValueChange, placeholder, dropdownHeader }: any) => <>{dropdownHeader}<select aria-label={placeholder} value={value} onChange={e => onValueChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: (...args: unknown[]) => fixture.invoke(...args) },
  from: (table: string) => {
    let single = false;
    let latestLoads = false;
    const chain: any = {
      select: (columns: string) => { latestLoads = columns.includes('orders!'); fixture.query(table, 'select', columns); return chain; },
      eq: () => chain, neq: () => chain, not: () => chain, or: () => chain,
      lte: (...args: unknown[]) => { fixture.query(table, 'lte', ...args); return chain; },
      order: () => chain, limit: (...args: unknown[]) => { fixture.query(table, 'limit', ...args); return chain; },
      single: () => { single = true; return chain; },
      then: (resolve: any) => resolve({
        error: table === 'orders' && single ? fixture.orderError : null,
        data: table === 'trucks' && latestLoads ? [
          { id: 'truck-157', orders: [{ delivery_datetime: '2026-10-21T08:00:00+00:00', delivery_end_datetime: null, pickup_drops: [{type: 'delivery', sequence_number: 2, latitude: 41, longitude: -90}] }] },
          { id: 'truck-near', orders: [{ delivery_datetime: '2026-10-21T08:00:00+00:00', delivery_end_datetime: null, pickup_drops: [{type: 'delivery', sequence_number: 2, latitude: 40.5, longitude: -90}] }] },
          { id: 'empty-truck', orders: [] },
          { id: 'truck-bf', orders: [{ delivery_datetime: '2026-10-21T08:00:00+00:00', delivery_end_datetime: null, pickup_drops: [{type: 'delivery', sequence_number: 2, latitude: 40.25, longitude: -90}] }] },
        ] : table === 'trucks' ? [
          { id: 'truck-157', truck_number: '157', company: {name: 'BF Prime LLC'}, driver1_id: 'driver-1', driver2_id: 'driver-2', trailer_id: 'trailer-1' },
          { id: 'empty-truck', truck_number: '999', company: {name: 'BF Prime LLC'}, driver1_id: null, driver2_id: null, trailer_id: null },
          { id: 'truck-bf', truck_number: '777', company: {name: 'Beverly Freight Inc'}, driver1_id: 'driver-1', driver2_id: null, trailer_id: null },
          { id: 'truck-near', truck_number: '156', company: {name: 'AP Silver Trans LLC'}, driver1_id: 'driver-1', driver2_id: null, trailer_id: null },
        ] : table === 'drivers' ? [{ id: 'driver-1', name: 'Driver One' }, { id: 'driver-2', name: 'Driver Two' }]
          : table === 'trailers' ? [{ id: 'trailer-1', trailer_number: '456' }]
            : single ? { booked_by_company: {name:fixture.bookingCompany}, loaded_miles: 256, pickup_drops: [
              { type: 'delivery', datetime: '2026-10-22T12:30:00+00:00', sequence_number: 2 },
              { type: 'pickup', datetime: '2026-10-21T19:00:00+00:00', sequence_number: 1 },
            ] } : [],
      }),
    };
    return chain;
  },
} }));
beforeEach(() => {
  fixture.orderError = null;
  fixture.bookingCompany = 'BF Prime LLC';
  fixture.route.mockResolvedValue(120);
  fixture.invoke.mockResolvedValue({ data: { color: 'green', summary: 'HOS friendly', reasons: ['Forecast includes tomorrow’s pickup.'], assessedAt: '2026-10-20T12:00:00Z' }, error: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function openDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AssignRecoveryLoadDialog open onOpenChange={vi.fn()} orderId="prebook-1" isPrebook pickupAddress="Dallas, TX" /></QueryClientProvider>);
  return client;
}
it('shows both team names beside the truck and previews the selected driver with saved future stops', async () => {
  openDialog();
  await screen.findByRole('option', { name: /BFP 157 - Driver One/ });
  fireEvent.change(screen.getByRole('combobox', { name: 'Select truck' }), { target: { value: 'truck-157' } });
  expect(screen.getByRole('combobox', { name: 'Select driver' })).toHaveValue('driver-1');
  await waitFor(() => expect(fixture.invoke).toHaveBeenCalledWith('hos-load-check', { body: { mode: 'preview', draft: expect.objectContaining({
    orderId: 'prebook-1', driverId: 'driver-1', teamDriverId: 'driver-2', truckId: 'truck-157', loadedMiles: 256, dhMiles: 120,
    stops: [expect.objectContaining({ type: 'pickup', datetime: '2026-10-21T19:00:00+00:00' }), expect.objectContaining({ type: 'delivery' })],
  }) } }), { timeout: 2500 });
  fireEvent.click(await screen.findByRole('button', { name: 'HOS green: HOS friendly' }));
  expect(screen.getByText('Forecast includes tomorrow’s pickup.')).toBeInTheDocument();
});
it('clears the old driver, trailer and deadhead when switching to an unassigned truck', async () => {
  openDialog();
  fireEvent.click(screen.getByRole('switch', {name: 'Suggested trucks'}));
  await screen.findByRole('option', { name: /BFP 157 - Driver One/ });
  const trucks = screen.getByRole('combobox', { name: 'Select truck' });
  fireEvent.change(trucks, { target: { value: 'truck-157' } });
  await waitFor(() => expect(fixture.route).toHaveBeenCalled());
  fireEvent.change(trucks, { target: { value: 'empty-truck' } });
  expect(screen.getByRole('combobox', { name: 'Select driver' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Select trailer' })).toHaveValue('');
  expect(screen.getByPlaceholderText('0')).toHaveValue(null);
});
it('shows unavailable when the saved prebook cannot be loaded', async () => {
  fixture.orderError = new Error('Load not accessible');
  openDialog();
  expect(await screen.findByRole('button', { name: /HOS yellow: HOS check unavailable/ })).toBeInTheDocument();
  expect(fixture.invoke).not.toHaveBeenCalled();
});
it('defaults to date-specific suggestions, sorts by distance and allows viewing all trucks', async () => {
  openDialog();
  expect(screen.getByRole('switch', {name: 'Suggested trucks'})).toBeChecked();
  await screen.findByRole('option', {name: 'AP 156 - Driver One · ~45 mi'});
  const options = (screen.getByRole('combobox', {name: 'Select truck'}) as HTMLSelectElement).options;
  expect(Array.from(options).map(option => option.text)).toEqual(['Select truck', 'AP 156 - Driver One · ~45 mi', 'BFP 157 - Driver One / Driver Two · ~90 mi']);
  expect(fixture.query).toHaveBeenCalledWith('trucks', 'lte', 'orders.pickup_datetime', '2026-10-21T19:00:00+00:00');
  expect(fixture.query).toHaveBeenCalledWith('trucks', 'limit', 1, {referencedTable: 'orders'});
  fireEvent.click(screen.getByRole('switch', {name: 'Suggested trucks'}));
  expect(screen.getByRole('option', {name: 'BFP 999'})).toBeInTheDocument();
});
it('restricts Beverly Freight loads in both full and Suggested truck lists', async () => {
  fixture.bookingCompany = 'Beverly Freight Inc';
  openDialog();
  await screen.findByRole('option', {name: 'BF 777 - Driver One · ~22 mi'});
  expect(screen.queryByRole('option', {name: /BFP 157/})).not.toBeInTheDocument();
  expect(screen.queryByRole('option', {name: /AP 156/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', {name: 'Suggested trucks'}));
  await screen.findByRole('option', {name: 'BF 777 - Driver One'});
  const options = (screen.getByRole('combobox', {name: 'Select truck'}) as HTMLSelectElement).options;
  expect(options).toHaveLength(2);
});
it('blocks saving if the booking company changes after a truck was selected', async () => {
  const client = openDialog();
  await screen.findByRole('option', {name: /BFP 157 - Driver One/});
  fireEvent.change(screen.getByRole('combobox', {name: 'Select truck'}), {target:{value:'truck-157'}});
  expect(screen.getByRole('button', {name:'Assign'})).toBeEnabled();
  fixture.bookingCompany = 'Beverly Freight Inc';
  await act(async () => { await client.invalidateQueries({queryKey:['hos-prebook-order','prebook-1']}); });
  await waitFor(()=>expect(screen.getByRole('button', {name:'Assign'})).toBeDisabled());
});
