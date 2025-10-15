import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LastDelivery {
  orderId: string;
  deliveryAddress: string;
  deliveryDatetime: string;
}

export const useTruckLastDelivery = (truckId: string | null, pickupDatetime?: string | null) => {
  return useQuery({
    queryKey: ['truck-last-delivery', truckId, pickupDatetime],
    queryFn: async (): Promise<LastDelivery | null> => {
      if (!truckId) return null;

      console.log('🔍 Finding last delivery for truck:', truckId);
      console.log('🔍 Target pickup datetime:', pickupDatetime);

      // Get all completed orders for this truck
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, delivery_datetime')
        .eq('truck_id', truckId)
        .eq('canceled', false)
        .not('delivery_datetime', 'is', null)
        .order('delivery_datetime', { ascending: false });

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) {
        console.log('❌ No previous orders found for truck');
        return null;
      }

      let lastOrder = orders[0];

      // If pickup datetime is provided, try to find delivery on same date
      if (pickupDatetime) {
        const pickupDate = new Date(pickupDatetime);
        const pickupDateOnly = pickupDate.toISOString().split('T')[0];
        
        console.log('🔍 Looking for delivery on date:', pickupDateOnly);

        // Find order with delivery on the same date as pickup
        const sameDate = orders.find(order => {
          const deliveryDate = new Date(order.delivery_datetime!);
          const deliveryDateOnly = deliveryDate.toISOString().split('T')[0];
          return deliveryDateOnly === pickupDateOnly;
        });

        if (sameDate) {
          lastOrder = sameDate;
          console.log('✅ Found delivery on same date:', sameDate.id);
        } else {
          // Find the closest delivery date to the pickup date
          const pickupTime = pickupDate.getTime();
          let closestOrder = orders[0];
          let smallestDiff = Math.abs(new Date(orders[0].delivery_datetime!).getTime() - pickupTime);

          for (const order of orders) {
            const deliveryTime = new Date(order.delivery_datetime!).getTime();
            const diff = Math.abs(deliveryTime - pickupTime);
            if (diff < smallestDiff) {
              smallestDiff = diff;
              closestOrder = order;
            }
          }

          lastOrder = closestOrder;
          console.log('✅ Found closest delivery:', closestOrder.id, new Date(closestOrder.delivery_datetime!).toISOString());
        }
      } else {
        console.log('✅ Using most recent delivery:', lastOrder.id);
      }

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
      const fullAddress = `${pickup.address}, ${pickup.city}, ${pickup.state} ${pickup.zip_code}`;

      return {
        orderId: lastOrder.id,
        deliveryAddress: fullAddress,
        deliveryDatetime: lastOrder.delivery_datetime || ''
      };
    },
    enabled: !!truckId,
  });
};
