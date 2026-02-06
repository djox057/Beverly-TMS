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
    queryKey: ['drivers', 'v2'], // Added version to force cache invalidation
    queryFn: async () => {
      
      
      return queryWithTimeout(async () => {
        let allDrivers: any[] = [];
        let from = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('drivers')
            .select(`
              *,
              companies(id, name)
            `)
            .order('name', { ascending: true })
            .range(from, from + batchSize - 1);
          
          if (error) {
            console.error('❌ Error fetching drivers:', error);
            throw error;
          }
          
          if (!data || data.length === 0) break;
          
          // Transform companies from array to single object and clean up
          const transformedData = data.map(driver => {
            const company = Array.isArray(driver.companies) 
              ? (driver.companies.length > 0 ? driver.companies[0] : null)
              : driver.companies || null;
            
            // Remove the companies property to avoid redundancy
            const { companies, ...cleanDriver } = driver;
            
            return {
              ...cleanDriver,
              company
            };
          });
          
          allDrivers = [...allDrivers, ...transformedData];
          
          if (transformedData.length < batchSize) break;
          
          from += batchSize;
        }
        
        // Fetch trucks separately to avoid RLS issues with reverse joins
        const { data: trucksData, error: trucksError } = await supabase
          .from('trucks')
          .select(`
            id, 
            truck_number, 
            driver1_id, 
            driver2_id,
            trailer:trailers!trucks_trailer_id_fkey(id, trailer_number)
          `);
        
        if (trucksError) {
          console.error('❌ Error fetching trucks for drivers:', trucksError);
        }
        
        // Fetch dispatcher info
        const { data: dispatchers, error: dispatchersError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email');
        
        if (dispatchersError) {
          console.error('❌ Error fetching dispatchers:', dispatchersError);
        }
        
        // First, get all user_ids with driver role
        const { data: driverRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'driver');
        
        const driverUserIds = driverRoles?.map(r => r.user_id) || [];
        
        // Then get emails for those users if we have any
        let driverEmails = new Set<string>();
        if (driverUserIds.length > 0) {
          const { data: driverProfiles } = await supabase
            .from('profiles')
            .select('email')
            .in('user_id', driverUserIds);
          
          driverEmails = new Set(
            driverProfiles?.map((p: any) => p.email.toLowerCase()) || []
          );
        }
        
        // Create a Map for faster truck lookups
        const trucksByDriverId = new Map();
        if (trucksData) {
          trucksData.forEach(truck => {
            if (truck.driver1_id) trucksByDriverId.set(truck.driver1_id, truck);
            if (truck.driver2_id) trucksByDriverId.set(truck.driver2_id, truck);
          });
        }
        
        // Transform the data to flatten truck/trailer and dispatcher info
        const transformedData = allDrivers.map((driver, index) => {
          const truck = trucksByDriverId.get(driver.id);
          const dispatcher = dispatchers?.find(d => d.user_id === driver.dispatcher_id);
          
          const transformed = {
            ...driver,
            truck_info: truck ? {
              truck_number: truck.truck_number,
              trailer_number: truck.trailer?.trailer_number || null
            } : null,
            dispatcher_info: dispatcher ? {
              full_name: dispatcher.full_name,
              email: dispatcher.email
            } : null,
            has_account: driver.email ? driverEmails.has(driver.email.toLowerCase()) : false
          };
          
          
          return transformed;
        });
        
        return transformedData;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch only when stale (respects staleTime cache)
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    structuralSharing: false, // Prevent React Query from merging old/new data structures
  });
};