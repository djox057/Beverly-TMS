import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDriversRealtime } from "./useDriversRealtime";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useDrivers = () => {
  // Use advanced realtime hook (single-record fetch + cache patch, no full refetch)
  useDriversRealtime();

  return useQuery({
    queryKey: ['drivers', 'v2'],
    queryFn: async () => {
      return queryWithTimeout(async () => {
        // Stage 1: Flat drivers fetch (no joins)
        let allDrivers: any[] = [];
        let from = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .order('name', { ascending: true })
            .range(from, from + batchSize - 1);
          
          if (error) {
            console.error('❌ Error fetching drivers:', error);
            throw error;
          }
          
          if (!data || data.length === 0) break;
          allDrivers = [...allDrivers, ...data];
          if (data.length < batchSize) break;
          from += batchSize;
        }

        // Stage 2: Collect unique IDs
        const companyIds = [...new Set(allDrivers.map(d => d.company_id).filter(Boolean))] as string[];

        // Stage 3: Parallel batch fetches (no joins, simple index lookups)
        const [trucksRes, companiesRes, dispatchersRes, driverRolesRes] = await Promise.all([
          supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id, trailer_id'),
          companyIds.length > 0
            ? supabase.from('companies').select('id, name').in('id', companyIds)
            : { data: [], error: null },
          supabase.from('profiles').select('user_id, full_name, email'),
          supabase.from('user_roles').select('user_id').eq('role', 'driver'),
        ]);

        if (trucksRes.error) console.error('❌ Error fetching trucks for drivers:', trucksRes.error);
        if (dispatchersRes.error) console.error('❌ Error fetching dispatchers:', dispatchersRes.error);

        // Fetch trailer numbers for trucks that have trailers
        const trailerIds = [...new Set((trucksRes.data || []).map(t => t.trailer_id).filter(Boolean))] as string[];
        const trailersRes = trailerIds.length > 0
          ? await supabase.from('trailers').select('id, trailer_number').in('id', trailerIds)
          : { data: [], error: null };

        // Build lookup maps
        const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
        const dispatcherMap = new Map((dispatchersRes.data || []).map(d => [d.user_id, d]));
        const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));

        // Build truck-by-driver map
        const trucksByDriverId = new Map<string, any>();
        if (trucksRes.data) {
          for (const truck of trucksRes.data) {
            const trailer = trailerMap.get(truck.trailer_id) || null;
            const truckWithTrailer = { ...truck, trailer };
            if (truck.driver1_id) trucksByDriverId.set(truck.driver1_id, truckWithTrailer);
            if (truck.driver2_id) trucksByDriverId.set(truck.driver2_id, truckWithTrailer);
          }
        }

        // Build driver emails set for has_account check
        const driverUserIds = (driverRolesRes.data || []).map(r => r.user_id);
        let driverEmails = new Set<string>();
        if (driverUserIds.length > 0) {
          const { data: driverProfiles } = await supabase
            .from('profiles')
            .select('email')
            .in('user_id', driverUserIds);
          driverEmails = new Set(
            (driverProfiles || []).map((p: any) => p.email.toLowerCase())
          );
        }

        // Stage 4: Assemble
        return allDrivers.map(driver => {
          const truck = trucksByDriverId.get(driver.id);
          // Fallback: inherit company/dispatcher from assigned truck when driver has none.
          const effectiveCompanyId = driver.company_id || truck?.company_id || null;
          const effectiveDispatcherId = driver.dispatcher_id || truck?.dispatcher_id || null;
          const company = effectiveCompanyId ? companyMap.get(effectiveCompanyId) || null : null;
          const dispatcher = effectiveDispatcherId ? dispatcherMap.get(effectiveDispatcherId) || null : null;

          // Remove companies property if it leaked from old schema
          const { companies, ...cleanDriver } = driver;

          return {
            ...cleanDriver,
            company,
            truck_info: truck ? {
              truck_number: truck.truck_number,
              trailer_number: truck.trailer?.trailer_number || null,
            } : null,
            dispatcher_info: dispatcher ? {
              full_name: dispatcher.full_name,
              email: dispatcher.email,
            } : null,
            has_account: driver.email ? driverEmails.has(driver.email.toLowerCase()) : false,
          };
        });
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    structuralSharing: false,
  });
};
