import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useOrders = () => {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          truck:trucks!orders_truck_id_fkey(truck_number),
          driver1:drivers!orders_driver1_id_fkey(name),
          broker:brokers!orders_broker_id_fkey(name),
          pickup_drops(type, city, state, datetime, address)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform the data to match the expected format
      return data?.map(order => {
        const pickups = order.pickup_drops?.filter(pd => pd.type === 'pickup') || [];
        const deliveries = order.pickup_drops?.filter(pd => pd.type === 'delivery') || [];
        const firstPickup = pickups[0];
        const firstDelivery = deliveries[0];
        
        return {
          id: order.id,
          truckNumber: order.truck?.truck_number || 'N/A',
          loadNumber: order.load_number || order.broker_load_number || 'N/A',
          pickupDate: firstPickup?.datetime ? new Date(firstPickup.datetime).toISOString().split('T')[0] : 'N/A',
          pickupCity: firstPickup?.address || 'N/A',
          pickupState: '',
          deliveryDate: firstDelivery?.datetime ? new Date(firstDelivery.datetime).toISOString().split('T')[0] : 'N/A',
          deliveryCity: firstDelivery?.address || 'N/A',
          deliveryState: '',
          mileage: order.mileage || 0,
          driverPrice: order.driver_price || 0,
          driverName: order.driver1?.name || 'N/A',
          brokerName: order.broker?.name || 'N/A',
          brokerLoadNumber: order.broker_load_number || order.load_number || 'N/A',
          status: order.status || 'pending',
          freightAmount: order.freight_amount || 0,
          notes: order.notes || '',
          bookedBy: order.booked_by || 'N/A'
        };
      }) || [];
    },
  });
};