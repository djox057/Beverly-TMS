import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LastDelivery {
  orderId: string;
  deliveryAddress: string;
  deliveryDatetime: string;
}

export const useTruckLastDelivery = (truckId: string | null) => {
  return useQuery({
    queryKey: ['truck-last-delivery', truckId],
    queryFn: async (): Promise<LastDelivery | null> => {
      if (!truckId) return null;

      // Get the most recent completed order for this truck
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, delivery_datetime')
        .eq('truck_id', truckId)
        .not('delivery_datetime', 'is', null)
        .order('delivery_datetime', { ascending: false })
        .limit(1);

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return null;

      const lastOrder = orders[0];

      // Get the final delivery address (highest sequence_number with type = 'delivery')
      const { data: pickupDrops, error: pickupDropsError } = await supabase
        .from('pickup_drops')
        .select('address, sequence_number')
        .eq('order_id', lastOrder.id)
        .eq('type', 'delivery')
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (pickupDropsError) throw pickupDropsError;
      if (!pickupDrops || pickupDrops.length === 0) return null;

      return {
        orderId: lastOrder.id,
        deliveryAddress: pickupDrops[0].address,
        deliveryDatetime: lastOrder.delivery_datetime || ''
      };
    },
    enabled: !!truckId,
  });
};
