import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useBrokers = () => {
  return useQuery({
    queryKey: ['brokers'],
    queryFn: async () => {
      let allBrokers: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      // Fetch all brokers in batches to avoid Supabase limits
      while (hasMore) {
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .order('name')
          .range(from, from + limit - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allBrokers = [...allBrokers, ...data];
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }
      
      return allBrokers;
    },
  });
};