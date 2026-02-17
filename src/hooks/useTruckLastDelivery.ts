import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

      // Get all completed orders for this driver (as driver1 or driver2)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, delivery_datetime')
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
        .eq('canceled', false)
        .not('delivery_datetime', 'is', null)
        .order('delivery_datetime', { ascending: false });

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) {
        console.log('❌ No previous orders found for truck');
        return null;
      }

      const lastOrder = orders[0];
      console.log('✅ Using most recent delivery:', lastOrder.id);

      // Get the final delivery address (highest sequence_number with type = 'delivery')
      const { data: pickupDrops, error: pickupDropsError } = await supabase
        .from('pickup_drops')
        .select('address, city, state, zip_code, sequence_number')
        .eq('order_id', lastOrder.id)
        .eq('type', 'delivery')
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (pickupDropsError) throw pickupDropsError;
      if (!pickupDrops || pickupDrops.length === 0) return null;

      const pickup = pickupDrops[0];
      
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
        deliveryDatetime: lastOrder.delivery_datetime || ''
      };
    },
    enabled: !!driverId,
  });
};
