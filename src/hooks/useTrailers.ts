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
          .select('*')
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
      
      // Fetch trucks separately to avoid RLS issues with reverse joins
      const { data: trucksData, error: trucksError } = await supabase
        .from('trucks')
        .select('id, truck_number, trailer_id');
      
      if (trucksError) {
        console.error('❌ Error fetching trucks for trailers:', trucksError);
      } else {
        console.log(`✅ Fetched ${trucksData?.length || 0} trucks for trailer mapping`);
        
        // Map trucks to trailers
        allTrailers = allTrailers.map(trailer => {
          const trucks = trucksData?.filter(truck => truck.trailer_id === trailer.id) || [];
          return {
            ...trailer,
            trucks: trucks
          };
        });
      }
      
      console.log('Sample trailer with trucks:', allTrailers[0]);
      return allTrailers;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};