import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { previousDelivery } from "@/utils/previousDelivery";

interface LastDelivery {
  orderId: string;
  deliveryAddress: string;
  deliveryDatetime: string;
}

export const useTruckLastDelivery = (driverId: string | null, pickupDatetime?: string | null) => {
  return useQuery({
    queryKey: ['driver-last-delivery', driverId, pickupDatetime],
    queryFn: async (): Promise<LastDelivery | null> => {
      if (!driverId) return null;

      console.log('🔍 Finding last delivery for driver:', driverId);
      console.log('🔍 Target pickup datetime:', pickupDatetime);

      // Include pending/loaded bookings; POD and delivery completion do not select the origin.
      const cutoff = pickupDatetime || new Date().toISOString();
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, pickup_datetime, delivery_datetime, delivery_end_datetime, pickup_drops(type,datetime,address,city,state,zip_code,sequence_number)')
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
        .eq('canceled', false)
        .lte('pickup_datetime', cutoff)
        .order('pickup_datetime', { ascending: false })
        .limit(100);

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) {
        console.log('❌ No previous orders found for truck');
        return null;
      }

      const lastOrder = previousDelivery(orders, cutoff);
      if (!lastOrder) return null;
      console.log('✅ Using most recent delivery:', lastOrder.id);

      const pickup = [...(lastOrder.pickup_drops || [])]
        .filter(stop => stop.type === 'delivery')
        .sort((a, b) => b.sequence_number - a.sequence_number)[0];
      if (!pickup) return null;

      // Handle cases where address is already complete or fields are separated
      let fullAddress: string;
      if (!pickup.city && !pickup.state && !pickup.zip_code) {
        // Address field already contains complete address
        fullAddress = pickup.address;
      } else {
        // Build address from separate fields
        const parts = [pickup.address];
        if (pickup.city) parts.push(pickup.city);
        if (pickup.state) {
          const stateZip = pickup.zip_code 
            ? `${pickup.state} ${pickup.zip_code}` 
            : pickup.state;
          parts.push(stateZip);
        } else if (pickup.zip_code) {
          parts.push(pickup.zip_code);
        }
        fullAddress = parts.join(', ');
      }

      return {
        orderId: lastOrder.id,
        deliveryAddress: fullAddress,
        deliveryDatetime: pickup.datetime || lastOrder.delivery_datetime || ''
      };
    },
    enabled: !!driverId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};
