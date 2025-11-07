import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useDrivers = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("drivers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => queryClient.invalidateQueries({ queryKey: ["drivers"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        () => queryClient.invalidateQueries({ queryKey: ["drivers"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => queryClient.invalidateQueries({ queryKey: ["drivers"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      console.log('👤 Fetching drivers with relationships...');
      
      return queryWithTimeout(async () => {
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
          
          console.log(`✅ Fetched ${data.length} drivers (batch ${from / batchSize + 1})`);
          allDrivers = [...allDrivers, ...data];
          
          if (data.length < batchSize) break;
          
          from += batchSize;
        }
        
        console.log(`✅ Total drivers fetched: ${allDrivers.length}`);
        
        // Fetch trucks separately to avoid RLS issues with reverse joins
        const { data: trucksData, error: trucksError } = await supabase
          .from('trucks')
          .select(`
            id, 
            truck_number, 
            driver1_id, 
            driver2_id,
            trailer:trailers!trailer_id(trailer_number)
          `);
        
        if (trucksError) {
          console.error('❌ Error fetching trucks for drivers:', trucksError);
        }
        
        console.log(`✅ Fetched ${trucksData?.length || 0} trucks for driver mapping`);
        
        // Fetch dispatcher info
        const { data: dispatchers, error: dispatchersError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email');
        
        if (dispatchersError) {
          console.error('❌ Error fetching dispatchers:', dispatchersError);
        }
        
        console.log(`✅ Fetched ${dispatchers?.length || 0} dispatchers`);
        
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
        const transformedData = allDrivers.map(driver => {
          const truck = trucksByDriverId.get(driver.id);
          const dispatcher = dispatchers?.find(d => d.user_id === driver.dispatcher_id);
          
          return {
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
        });
        
        console.log('Sample transformed driver:', transformedData?.[0]);
        return transformedData;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: "always", // Always fetch fresh data when component mounts
    staleTime: 0, // Consider data stale immediately to ensure fresh data is fetched
    gcTime: 600000, // Keep in memory for 10 minutes
    placeholderData: (previousData) => previousData,
  });
};