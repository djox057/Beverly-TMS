import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useNextInternalLoadNumber = () => {
  return useQuery({
    queryKey: ['nextInternalLoadNumber'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('internal_load_number')
        .not('internal_load_number', 'is', null)
        .order('internal_load_number', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      // If no orders exist or no internal_load_number is set, start from 1
      const lastNumber = data?.[0]?.internal_load_number || 0;
      return lastNumber + 1;
    },
  });
};

// Helper function to get next unique internal load number and create order atomically
export const createOrderWithUniqueLoadNumber = async (orderData: any) => {
  const { data, error } = await supabase.rpc('create_order_with_unique_load_number', {
    order_data: orderData
  });
  
  if (error) throw error;
  return data;
};