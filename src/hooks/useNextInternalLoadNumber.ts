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