import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrailers = () => {
  return useQuery({
    queryKey: ['trailers'],
    queryFn: async () => {
      console.log('🚛 Fetching trailers with relationships...');
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
        
        if (error) {
          console.error('❌ Error fetching trailers:', error);
          throw error;
        }
        
        if (data) {
          allTrailers = [...allTrailers, ...data];
          hasMore = data.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`✅ Total trailers fetched: ${allTrailers.length}`);
      console.log('Sample trailer:', allTrailers[0]);
      return allTrailers;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};