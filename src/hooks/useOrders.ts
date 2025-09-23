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
      
        const transformedOrders = data.map((order: any) => {
          const pickupLocation = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
          const deliveryLocation = order.pickup_drops?.find((pd: any) => pd.type === 'delivery');
          
          // Format date ranges
          const formatDateRange = (startDate: string, endDate: string) => {
            if (!startDate) return 'N/A';
            const start = new Date(startDate).toLocaleDateString();
            if (!endDate || startDate === endDate) return start;
            const end = new Date(endDate).toLocaleDateString();
            return `${start} - ${end}`;
          };
          
          return {
            id: order.id,
            truckNumber: order.truck?.truck_number || 'N/A',
            internalLoadNumber: order.internal_load_number?.toString() || 'N/A',
            pickupDate: formatDateRange(order.pickup_datetime, order.pickup_end_datetime),
            pickupCity: pickupLocation.city,
            pickupState: pickupLocation.state,
            deliveryDate: formatDateRange(order.delivery_datetime, order.delivery_end_datetime),
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
        });

        return transformedOrders;
    },
  });
};