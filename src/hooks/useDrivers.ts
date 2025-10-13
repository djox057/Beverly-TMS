import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDrivers = () => {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select(`
          *,
          trucks_driver1:trucks!trucks_driver1_id_fkey(
            truck_number,
            trailer:trailers(trailer_number)
          )
        `)
        .order('name', { ascending: true })
        .limit(1000);
      
      if (error) throw error;
      
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
      return data?.map(driver => {
        const truck = driver.trucks_driver1?.[0];
        
        return {
          ...driver,
          truck_info: truck ? {
            truck_number: truck.truck_number,
            trailer_number: truck.trailer?.trailer_number || null
          } : null,
          has_account: driver.email ? driverEmails.has(driver.email.toLowerCase()) : false
        };
      });
    },
  });
};