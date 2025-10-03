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
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(1000);
      
      if (error) throw error;
      
      // Get all profiles to check which drivers have accounts
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, role');
      
      const driverEmails = new Set(
        profiles?.filter((p: any) => p.role === 'driver').map((p: any) => p.email.toLowerCase()) || []
      );
      
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