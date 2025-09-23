import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useBrokers = () => {
  return useQuery({
    queryKey: ['brokers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brokers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });
};