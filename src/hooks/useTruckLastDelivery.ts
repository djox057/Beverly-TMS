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

      // If pickup datetime is provided, find deliveries on same date or before pickup
      if (pickupDatetime) {
        const pickupDate = new Date(pickupDatetime);
        const pickupDateOnly = pickupDate.toISOString().split('T')[0];
        const pickupTime = pickupDate.getTime();
        
        console.log('🔍 Looking for deliveries on or before:', pickupDatetime);

        // Filter orders to those on same date OR before pickup
        const validOrders = orders.filter(order => {
          const deliveryDate = new Date(order.delivery_datetime!);
          const deliveryDateOnly = deliveryDate.toISOString().split('T')[0];
          const deliveryTime = deliveryDate.getTime();
          
          // Include if same date OR before pickup datetime
          return deliveryDateOnly === pickupDateOnly || deliveryTime < pickupTime;
        });

        if (validOrders.length > 0) {
          // Use the most recent valid delivery
          lastOrder = validOrders[0];
          console.log('✅ Found valid delivery:', lastOrder.id, new Date(lastOrder.delivery_datetime!).toISOString());
        } else {
          // No valid deliveries, use the most recent one overall
          console.log('⚠️ No valid deliveries, using most recent:', lastOrder.id);
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
    enabled: !!truckId,
  });
};
