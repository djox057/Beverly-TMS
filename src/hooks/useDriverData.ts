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
        .select('*')
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
          trailer:trailers(trailer_number, trailer_type),
          dispatcher:profiles!trucks_dispatcher_id_fkey(full_name, email)
        `)
        .or(`driver1_id.eq.${driverData.id},driver2_id.eq.${driverData.id}`)
        .maybeSingle();

      if (truckError) throw truckError;

      // Get current/recent orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          broker:brokers(name),
          pickup_drops:pickup_drops(*)
        `)
        .or(`driver1_id.eq.${driverData.id},driver2_id.eq.${driverData.id}`)
        .order('pickup_datetime', { ascending: false })
        .limit(10);

      if (ordersError) throw ordersError;

      return {
        driver: driverData,
        truck: truckData,
        orders: ordersData || [],
      };
    },
    enabled: !!profile?.email,
  });
};
