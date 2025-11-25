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

      // Get current/recent orders from orders table with joins
      const { data: ordersRaw, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          pickup_drops (
            id,
            type,
            address,
            city,
            state,
            zip_code,
            datetime,
            end_datetime,
            sequence_number
          ),
          order_files (
            id,
            file_category
          ),
          broker:brokers (
            name
          ),
          company:companies!orders_company_id_fkey (
            name
          ),
          truck:trucks (
            truck_number
          ),
          driver1:drivers!orders_driver1_id_fkey (
            name
          ),
          driver2:drivers!orders_driver2_id_fkey (
            name
          )
        `)
        .or(`driver1_id.eq.${driverData.id},driver2_id.eq.${driverData.id}`)
        .order('pickup_datetime', { ascending: false })
        .limit(10);

      if (ordersError) throw ordersError;

      // Transform orders data to match expected structure with flattened joins
      const ordersData = ordersRaw?.map((row: any) => {
        const pickup_drops = row.pickup_drops || [];
        
        return {
          ...row,
          broker_name: row.broker?.name || null,
          company_name: row.company?.name || null,
          truck_number: row.truck?.truck_number || null,
          driver1_name: row.driver1?.name || null,
          driver2_name: row.driver2?.name || null,
          broker: row.broker,
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
