import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDrivers = () => {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      console.log('👤 Fetching drivers with relationships...');
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('name', { ascending: true })
        .limit(1000);
      
      if (error) {
        console.error('❌ Error fetching drivers:', error);
        throw error;
      }
      
      console.log(`✅ Fetched ${data?.length || 0} drivers`);
      
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
      
      // Transform the data to flatten truck/trailer info
      const transformedData = data?.map(driver => {
        // Find truck where this driver is driver1
        const truck = trucksData?.find(t => t.driver1_id === driver.id || t.driver2_id === driver.id);
        
        console.log(`Driver ${driver.name} truck:`, truck);
        
        return {
          ...driver,
          truck_info: truck ? {
            truck_number: truck.truck_number,
            trailer_number: truck.trailer?.trailer_number || null
          } : null,
          has_account: driver.email ? driverEmails.has(driver.email.toLowerCase()) : false
        };
      });
      
      console.log('Sample transformed driver:', transformedData?.[0]);
      return transformedData;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};