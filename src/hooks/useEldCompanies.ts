import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { EldCheck } from '@/lib/eld';

/** Resolve current company membership without changing saved daily checklists. */
export function useEldCompanies(checks: readonly EldCheck[]) {
  const { user } = useAuthContext();
  const driverIds = [...new Set(checks.map(row => row.driver_id).filter(Boolean))].sort();
  const truckNumbers = [...new Set(checks.map(row => row.truck_number).filter(Boolean))].sort();
  return useQuery({
    queryKey: ['eld-companies', user?.id, driverIds, truckNumbers],
    enabled: !!user && checks.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const drivers = new Map<string, string | null>();
      const trucks = new Map<string, string | null>();
      const names = new Map<string, string>();
      const { data: companies, error } = await supabase.from('companies').select('id, name').abortSignal(signal);
      if (error) throw error;
      companies?.forEach(company => names.set(company.id, company.name));
      for (let offset = 0; offset < driverIds.length; offset += 200) {
        const { data, error } = await supabase.from('drivers').select('id, company_id').in('id', driverIds.slice(offset, offset + 200)).abortSignal(signal);
        if (error) throw error;
        data?.forEach(driver => drivers.set(driver.id, driver.company_id));
      }
      for (let offset = 0; offset < truckNumbers.length; offset += 200) {
        const { data, error } = await supabase.from('trucks').select('truck_number, company_id').in('truck_number', truckNumbers.slice(offset, offset + 200)).order('id').abortSignal(signal);
        if (error) throw error;
        data?.forEach(truck => {
          // Duplicate unit numbers are ambiguous; fall back to the driver's company.
          if (trucks.has(truck.truck_number)) trucks.set(truck.truck_number, null);
          else trucks.set(truck.truck_number, truck.company_id);
        });
      }
      return { drivers, trucks, names };
    },
  });
}
