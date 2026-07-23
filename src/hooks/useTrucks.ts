import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrucksRealtime } from "./useTrucksRealtime";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useTrucks = () => {
  // Use advanced realtime hook (single-record fetch + cache patch, no full refetch)
  useTrucksRealtime();

  return useQuery({
    queryKey: ['trucks', 'v2'],
    queryFn: async () => {
      return queryWithTimeout(async () => {
        // Stage 1: Flat trucks fetch (no joins — single RLS evaluation per row)
        let allTrucks: any[] = [];
        let from = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('trucks')
            .select('*')
            .order('truck_number')
            .range(from, from + batchSize - 1);
          
          if (error) {
            console.error('❌ Error fetching trucks:', error);
            throw error;
          }
          
          if (!data || data.length === 0) break;
          allTrucks = [...allTrucks, ...data];
          if (data.length < batchSize) break;
          from += batchSize;
        }

        // Stage 2: Collect unique IDs for batch fetches
        const trailerIds = [...new Set(allTrucks.map(t => t.trailer_id).filter(Boolean))] as string[];
        const driverIds = [...new Set(allTrucks.flatMap(t => [t.driver1_id, t.driver2_id]).filter(Boolean))] as string[];
        const companyIds = [...new Set(allTrucks.map(t => t.company_id).filter(Boolean))] as string[];

        // Stage 3: Parallel batch fetches (each is a simple index lookup, no joins)
        const [trailersRes, driversRes, companiesRes, dispatchersRes] = await Promise.all([
          trailerIds.length > 0
            ? supabase.from('trailers').select('id, trailer_number, trailer_type').in('id', trailerIds)
            : { data: [], error: null },
          driverIds.length > 0
            ? supabase.from('drivers').select('id, name, dispatcher_id, company_id').in('id', driverIds)
            : { data: [], error: null },
          supabase.from('companies').select('id, name'),
          supabase.from('profiles').select('user_id, full_name, email'),
        ]);

        // Build lookup maps
        const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));
        const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));
        const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
        const dispatcherMap = new Map((dispatchersRes.data || []).map(d => [d.user_id, d]));

        // Stage 4: Assemble the nested object structure the UI expects
        return allTrucks.map(rawTruck => {
          // Trim truck_number to remove trailing whitespace from DB
          const truck = { ...rawTruck, truck_number: (rawTruck.truck_number || '').trim() };
          const trailer = trailerMap.get(truck.trailer_id) || null;
          const driver1Raw = driverMap.get(truck.driver1_id) || null;
          const driver2Raw = driverMap.get(truck.driver2_id) || null;
          const truckCompany = companyMap.get(truck.company_id) || null;

          // Attach company to drivers
          const driver1 = driver1Raw ? {
            ...driver1Raw,
            company: companyMap.get(driver1Raw.company_id) || null,
          } : null;
          const driver2 = driver2Raw ? {
            ...driver2Raw,
            company: companyMap.get(driver2Raw.company_id) || null,
          } : null;

          // Dispatcher from driver1
          const dispatcherId = driver1?.dispatcher_id;
          const dispatcherProfile = dispatcherId ? dispatcherMap.get(dispatcherId) : null;

          return {
            ...truck,
            trailer,
            driver1,
            driver2,
            dispatcher: dispatcherProfile ? {
              id: dispatcherProfile.user_id,
              full_name: dispatcherProfile.full_name,
              email: dispatcherProfile.email,
            } : null,
            company: driver1?.company || truckCompany,
          };
        });
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 120000,
    gcTime: 300000,
    structuralSharing: false,
  });
};
