import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useOrderDetails = (orderId: string | undefined) => {
  return useQuery({
    queryKey: ['order-details', orderId],
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID is required');
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          truck:trucks!orders_truck_id_fkey(truck_number, company:companies(name)),
          driver1:drivers!orders_driver1_id_fkey(name),
          driver2:drivers!orders_driver2_id_fkey(name),
          broker:brokers!orders_broker_id_fkey(name, address),
          company:companies!orders_company_id_fkey(name),
          booked_by_company:companies!orders_booked_by_company_id_fkey(name),
          trailer:trailers!orders_trailer_id_fkey(trailer_number),
          pickup_drops(id, type, city, state, datetime, address, zip_code, contact_name, contact_phone, special_instructions, company_name, sequence_number),
          order_files(id, file_name, file_path, file_size, content_type, file_category)
        `)
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
};
