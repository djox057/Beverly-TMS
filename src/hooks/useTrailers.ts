import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrailers = () => {
  return useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      let allTrailers: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('trailers')
          .select(`
            *,
            trucks!trucks_trailer_id_fkey(truck_number)
          `)
          .order('trailer_number', { ascending: true })
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        
        if (data) {
          allTrailers = [...allTrailers, ...data];
          hasMore = data.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }
      
      return allTrailers;
    },
  });
};