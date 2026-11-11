import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HolidayTruck {
  number: string;
  driverName: string;
  dispatcherName: string;
  dispatcherOffice?: string;
  dispatcherCreatedAt?: string;
  driverCreatedAt?: string;
}

export async function loadHolidayTrucks(): Promise<HolidayTruck[]> {
  const trucks: { truck_number: string; driver1_id: string | null; driver2_id: string | null; dispatcher_id: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('trucks')
      .select('truck_number,driver1_id,driver2_id,dispatcher_id')
      .eq('is_active', true).order('truck_number').order('id').range(offset, offset + 499);
    if (error) throw error;
    trucks.push(...data);
    if (data.length < 500) break;
  }
  const driverIds = [...new Set(trucks.flatMap(truck => [truck.driver1_id, truck.driver2_id]).filter((id): id is string => !!id))];
  const drivers: { id: string; name: string; dispatcher_id: string | null; created_at?: string }[] = [];
  for (let offset = 0; offset < driverIds.length; offset += 200) {
    const { data, error } = await supabase.from('drivers').select('id,name,dispatcher_id,created_at').in('id', driverIds.slice(offset, offset + 200));
    if (error) throw error;
    drivers.push(...data);
  }
  const dispatcherIds = [...new Set([...drivers.map(driver => driver.dispatcher_id), ...trucks.map(truck => truck.dispatcher_id)].filter((id): id is string => !!id))];
  const profiles: { user_id: string; full_name: string | null; office: string | null; created_at?: string }[] = [];
  for (let offset = 0; offset < dispatcherIds.length; offset += 200) {
    const { data, error } = await supabase.from('profiles').select('user_id,full_name,office,created_at').in('user_id', dispatcherIds.slice(offset, offset + 200));
    if (error) throw error;
    profiles.push(...data);
  }
  const driverMap = new Map(drivers.map(driver => [driver.id, driver]));
  const dispatcherMap = new Map(profiles.map(profile => [profile.user_id, profile.full_name ?? '']));
  return trucks.map(truck => {
    const assigned = [truck.driver1_id, truck.driver2_id].flatMap(id => id && driverMap.has(id) ? [driverMap.get(id)!] : []);
    const assignedDispatchers = assigned.map(driver => driver.dispatcher_id).filter((id): id is string => !!id);
    return {
      // Unit numbers are identifiers; "03212" and "3212" are different trucks.
      number: truck.truck_number.trim(),
      dispatcherCreatedAt: profiles.find(profile => profile.user_id === (assignedDispatchers[0] ?? truck.dispatcher_id))?.created_at,
      driverCreatedAt: assigned[0]?.created_at,
      dispatcherOffice: profiles.find(profile => profile.user_id === (assignedDispatchers[0] ?? truck.dispatcher_id))?.office ?? 'Other',
      driverName: [...new Set(assigned.map(driver => driver.name))].join(' / '),
      dispatcherName: [...new Set((assignedDispatchers.length ? assignedDispatchers : [truck.dispatcher_id]).flatMap(id => id && dispatcherMap.get(id) ? [dispatcherMap.get(id)!] : []))].join(' / '),
    };
  });
}

export function useHolidayTrucks() {
  return useQuery({ queryKey: ['holiday-truck-options'], queryFn: loadHolidayTrucks, staleTime: 60_000 });
}
