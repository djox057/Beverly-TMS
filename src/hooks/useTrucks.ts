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
    queryKey: ['trucks', 'v2'], // Added version to force cache invalidation
    queryFn: async () => {
      
      
      return queryWithTimeout(async () => {
        let allTrucks: any[] = [];
        let from = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('trucks')
            .select(`
              *,
              trailer:trailers(id, trailer_number, trailer_type),
              driver1:drivers!trucks_driver1_id_fkey(id, name, dispatcher_id, company_id),
              driver2:drivers!trucks_driver2_id_fkey(id, name, dispatcher_id, company_id),
              company:companies(id, name)
            `)
            .order('truck_number')
            .range(from, from + batchSize - 1);
          
          if (error) {
            console.error('❌ Error fetching trucks:', error);
            console.error('❌ Full error details:', JSON.stringify(error, null, 2));
            throw error;
          }
          
          
          
          if (!data || data.length === 0) break;
          
          
          allTrucks = [...allTrucks, ...data];
          
          if (data.length < batchSize) break;
          
          from += batchSize;
        }
        
        // Fetch all dispatchers to map to trucks
        const { data: dispatchers, error: dispatcherError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email');
        
        if (dispatcherError) {
          console.error('❌ Error fetching dispatchers:', dispatcherError);
          throw dispatcherError;
        }
        
        // Fetch companies for drivers
        const driverCompanyIds = new Set(
          allTrucks
            .flatMap(truck => [truck.driver1?.dispatcher_id, truck.driver2?.dispatcher_id])
            .filter(Boolean)
        );
        
        const { data: companies, error: companiesError } = await supabase
          .from('companies')
          .select('id, name');
        
        if (companiesError) {
          console.error('❌ Error fetching companies:', companiesError);
        }
        
        // Map dispatcher info and company info to trucks
        const trucksWithDispatchers = allTrucks.map(truck => {
          const dispatcherId = truck.driver1?.dispatcher_id;
          const dispatcher = dispatcherId 
            ? dispatchers?.find(d => d.user_id === dispatcherId)
            : null;
          
          // Get company info for driver1
          let driver1WithCompany = truck.driver1;
          if (truck.driver1 && companies) {
            const driverCompany = companies.find(c => c.id === truck.driver1.company_id);
            if (driverCompany) {
              driver1WithCompany = {
                ...truck.driver1,
                company: driverCompany
              };
            }
          }
          
          // Get company info for driver2
          let driver2WithCompany = truck.driver2;
          if (truck.driver2 && companies) {
            const driverCompany = companies.find(c => c.id === truck.driver2.company_id);
            if (driverCompany) {
              driver2WithCompany = {
                ...truck.driver2,
                company: driverCompany
              };
            }
          }
          
          return {
            ...truck,
            driver1: driver1WithCompany,
            driver2: driver2WithCompany,
            dispatcher: dispatcher ? {
              id: dispatcher.user_id,
              full_name: dispatcher.full_name,
              email: dispatcher.email
            } : null,
            // Use driver's company for display if available, otherwise truck's company
            company: driver1WithCompany?.company || truck.company
          };
        });
        
        return trucksWithDispatchers;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 120000, // 2 minutes - reduce DB load from navigation refetches
    gcTime: 300000, // 5 minutes cache retention
    structuralSharing: false, // Prevent React Query from merging old/new data structures
  });
};