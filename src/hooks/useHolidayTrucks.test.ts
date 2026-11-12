import { beforeEach, expect, it, vi } from 'vitest';
import { loadHolidayTrucks } from './useHolidayTrucks';
const db = vi.hoisted(() => ({
  trucks: [
    { truck_number: '03212', driver1_id: 'zero', driver2_id: 'team', dispatcher_id: null },
    { truck_number: '3212', driver1_id: 'other', driver2_id: null, dispatcher_id: null },
    { truck_number: 'unassigned', driver1_id: null, driver2_id: null, dispatcher_id: null },
    { truck_number: 'truck-dispatcher', driver1_id: null, driver2_id: null, dispatcher_id: 'disp-other' },
  ],
  drivers: [
    { id: 'zero', name: 'Leading Zero Driver', dispatcher_id: 'disp-zero' },
    { id: 'team', name: 'Team Driver', dispatcher_id: 'disp-zero' },
    { id: 'other', name: 'Other Driver', dispatcher_id: 'disp-other' },
  ],
  profiles: [
    { user_id: 'disp-zero', full_name: 'Leading Zero Dispatcher' },
    { user_id: 'disp-other', full_name: 'Other Dispatcher' },
  ],
  error: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => Promise.resolve({ data: db.trucks.map(truck => truck.truck_number), error: null }), from: (table: 'trucks' | 'drivers' | 'profiles') => {
  const result = () => Promise.resolve({ data: db[table], error: db.error ? { message: 'offline' } : null });
  const builder = { select: () => builder, eq: () => builder, order: () => builder, range: result, in: () => table === 'trucks' ? builder : result() };
  return builder;
} } }));
beforeEach(() => { db.error = false; });
it('uses exact truck identifiers and resolves both drivers and their dispatcher', async () => {
  expect(await loadHolidayTrucks()).toEqual([
    { number: '03212', dispatcherOffice: 'Other', driverName: 'Leading Zero Driver / Team Driver', dispatcherName: 'Leading Zero Dispatcher' },
    { number: '3212', dispatcherOffice: 'Other', driverName: 'Other Driver', dispatcherName: 'Other Dispatcher' },
    { number: 'truck-dispatcher', dispatcherOffice: 'Other', driverName: '', dispatcherName: 'Other Dispatcher' },
  ]);
});
it('reports failed lookups so the picker can offer retry', async () => {
  db.error = true;
  await expect(loadHolidayTrucks()).rejects.toMatchObject({ message: 'offline' });
});
