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
          company:companies!orders_company_id_fkey(name),
          pickup_drops(type, city, state, datetime, address),
          order_files(id, file_name, file_path, file_size, content_type)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform the data to match the expected format
      return data?.map(order => {
        const pickups = order.pickup_drops?.filter(pd => pd.type === 'pickup').sort((a, b) => 
          new Date(a.datetime || 0).getTime() - new Date(b.datetime || 0).getTime()
        ) || [];
        const deliveries = order.pickup_drops?.filter(pd => pd.type === 'delivery').sort((a, b) => 
          new Date(b.datetime || 0).getTime() - new Date(a.datetime || 0).getTime()
        ) || [];
        
        // Get first pickup and last delivery
        const firstPickup = pickups[0];
        const lastDelivery = deliveries[0];
        
        // Extract city and state from address or use individual fields
        const getLocationFromAddress = (address: string, state: string) => {
          if (address && address.includes(',')) {
            const parts = address.split(',');
            // Extract city from the end of the first part (after street address)
            const firstPart = parts[0]?.trim() || '';
            const cityMatch = firstPart.match(/\b([A-Za-z\s]+)$/);
            const city = cityMatch ? cityMatch[1].trim() : firstPart;
            
            // Extract state code (first word) from second part, excluding zip
            const secondPart = parts[1]?.trim() || '';
            const stateMatch = secondPart.match(/^([A-Z]{2})/);
            const extractedState = stateMatch ? stateMatch[1] : secondPart.split(' ')[0];
            
            return {
              city: city || 'N/A',
              state: extractedState || state || 'N/A'
            };
          }
          return { city: address || 'N/A', state: state || 'N/A' };
        };
        
        const pickupLocation = getLocationFromAddress(firstPickup?.address || '', firstPickup?.state || '');
        const deliveryLocation = getLocationFromAddress(lastDelivery?.address || '', lastDelivery?.state || '');
        
        return {
          id: order.id,
          truckNumber: order.truck?.truck_number || 'N/A',
          internalLoadNumber: order.internal_load_number?.toString() || 'N/A',
          pickupDate: firstPickup?.datetime ? new Date(firstPickup.datetime).toLocaleDateString() : 'N/A',
          pickupCity: pickupLocation.city,
          pickupState: pickupLocation.state,
          deliveryDate: lastDelivery?.datetime ? new Date(lastDelivery.datetime).toLocaleDateString() : 'N/A',
          deliveryCity: deliveryLocation.city,
          deliveryState: deliveryLocation.state,
          mileage: order.mileage || 0,
          driverPrice: order.driver_price || 0,
          driverName: order.driver1?.name || 'N/A',
          brokerName: order.broker?.name || 'N/A',
          brokerLoadNumber: order.broker_load_number || 'N/A',
          invoiced: order.invoiced ? 'Done' : '',
          freightAmount: order.freight_amount || 0,
          notes: order.notes || '',
          bookedBy: order.booked_by || 'N/A',
          companyName: order.company?.name || 'N/A',
          files: order.order_files || []
        };
      }) || [];
    },
  });
};