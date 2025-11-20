import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export const useDriverData = () => {
  const { profile } = useAuthContext();

  return useQuery({
    queryKey: ['driver-data', profile?.email],
    queryFn: async () => {
      if (!profile?.email) throw new Error('No profile email');

      // Get driver info by email
      const { data: driverData, error: driverError } = await supabase
        .from('drivers')
        .select('*, company:companies!company_id(id, name)')
        .eq('email', profile.email)
        .eq('is_active', true)
        .single();

      if (driverError) throw driverError;

      // Get truck info
      const { data: truckData, error: truckError } = await supabase
        .from('trucks')
        .select(`
          *,
          company:companies(name),
          trailer:trailers(trailer_number, trailer_type)
        `)
        .or(`driver1_id.eq.${driverData.id},driver2_id.eq.${driverData.id}`)
        .maybeSingle();

      if (truckError) throw truckError;

      // Get dispatcher info from driver's dispatcher_id
      let dispatcherData = null;
      if (driverData.dispatcher_id) {
        const { data: dispatcher, error: dispatcherError } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', driverData.dispatcher_id)
          .maybeSingle();
        
        if (!dispatcherError && dispatcher) {
          dispatcherData = dispatcher;
        }
      }

      // Get current/recent orders from materialized view
      const { data: ordersRaw, error: ordersError } = await supabase
        .from('orders_materialized_view')
        .select('*')
        .or(`driver1_id.eq.${driverData.id},driver2_id.eq.${driverData.id}`)
        .order('pickup_datetime', { ascending: false })
        .limit(10);

      if (ordersError) throw ordersError;

      // Transform materialized view data to match expected structure
      const ordersData = ordersRaw?.map((row: any) => {
        const pickup_drops = row.pickup_drops || [];
        
        return {
          ...row,
          broker: row.broker_name ? { name: row.broker_name } : null,
          pickup_drops,
        };
      }) || [];

      return {
        driver: driverData,
        truck: truckData ? {
          ...truckData,
          dispatcher: dispatcherData
        } : null,
        orders: ordersData || [],
      };
    },
    enabled: !!profile?.email,
  });
};
