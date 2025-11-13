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
            .select('*, company:companies(id, name)')
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
        console.log('🔍 FETCHING TRUCKS DATA...');
        const { data: trucksData, error: trucksError } = await supabase
          .from('trucks')
          .select(`
            id, 
            truck_number, 
            driver1_id, 
            driver2_id,
            trailer:trailers!trucks_trailer_id_fkey(trailer_number)
          `);
        
        if (trucksError) {
          console.error('❌ Error fetching trucks for drivers:', trucksError);
        }
        
        console.log(`✅ Fetched ${trucksData?.length || 0} trucks for driver mapping`);
        console.log('🔍 RAW TRUCKS DATA SAMPLE (first 3):');
        console.log(JSON.stringify(trucksData?.slice(0, 3), null, 2));
        
        // Check how many trucks have trailer data
        const trucksWithTrailers = trucksData?.filter(t => t.trailer !== null) || [];
        const trucksWithoutTrailers = trucksData?.filter(t => t.trailer === null) || [];
        console.log(`🔍 TRUCKS WITH TRAILER DATA: ${trucksWithTrailers.length}`);
        console.log(`🔍 TRUCKS WITHOUT TRAILER DATA: ${trucksWithoutTrailers.length}`);
        if (trucksWithTrailers.length > 0) {
          console.log('🔍 SAMPLE TRUCK WITH TRAILER:');
          console.log(JSON.stringify(trucksWithTrailers[0], null, 2));
        }
        
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
        console.log('🔍 CREATING TRUCK MAP BY DRIVER ID...');
        const trucksByDriverId = new Map();
        if (trucksData) {
          trucksData.forEach(truck => {
            if (truck.driver1_id) trucksByDriverId.set(truck.driver1_id, truck);
            if (truck.driver2_id) trucksByDriverId.set(truck.driver2_id, truck);
          });
        }
        console.log(`🔍 TRUCK MAP SIZE: ${trucksByDriverId.size}`);
        
        // Transform the data to flatten truck/trailer and dispatcher info
        console.log('🔍 TRANSFORMING DRIVER DATA...');
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
          
          // Debug first driver with truck
          if (index < 5 && truck) {
            console.log(`🔍 DRIVER #${index} (${driver.name}):`);
            console.log('  - Driver ID:', driver.id);
            console.log('  - Truck found:', !!truck);
            console.log('  - Truck number:', truck?.truck_number);
            console.log('  - Trailer object:', truck?.trailer);
            console.log('  - Trailer number extracted:', truck?.trailer?.trailer_number);
            console.log('  - Final truck_info:', transformed.truck_info);
          }
          
          return transformed;
        });
        
        console.log('🔍 TRANSFORMATION COMPLETE');
        console.log('Sample transformed driver (first):', JSON.stringify(transformedData?.[0], null, 2));
        
        // Count drivers with complete data
        const driversWithTrucks = transformedData.filter(d => d.truck_info !== null).length;
        const driversWithTrailers = transformedData.filter(d => d.truck_info?.trailer_number !== null).length;
        const driversWithDispatchers = transformedData.filter(d => d.dispatcher_info !== null).length;
        console.log(`🔍 FINAL STATS:`);
        console.log(`  - Drivers with trucks: ${driversWithTrucks}/${transformedData.length}`);
        console.log(`  - Drivers with trailers: ${driversWithTrailers}/${transformedData.length}`);
        console.log(`  - Drivers with dispatchers: ${driversWithDispatchers}/${transformedData.length}`);
        
        return transformedData;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 0,
    gcTime: 0,
  });
};