import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrucks = () => {
  return useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      console.log('🚛 Fetching trucks with relationships...');
      let allTrucks: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('trucks')
          .select(`
            *,
            trailer:trailers!trailer_id(id, trailer_number, trailer_type),
            driver1:drivers!trucks_driver1_id_fkey(id, name),
            driver2:drivers!trucks_driver2_id_fkey(id, name),
            dispatcher:profiles!dispatcher_id(id, full_name, email),
            company:companies!company_id(id, name)
          `)
          .order('truck_number')
          .range(from, from + batchSize - 1);
        
        if (error) {
          console.error('❌ Error fetching trucks:', error);
          throw error;
        }
        
        if (!data || data.length === 0) break;
        
        console.log(`✅ Fetched ${data.length} trucks (batch ${from / batchSize + 1})`);
        allTrucks = [...allTrucks, ...data];
        
        if (data.length < batchSize) break;
        
        from += batchSize;
      }
      
      console.log(`✅ Total trucks fetched: ${allTrucks.length}`);
      console.log('Sample truck:', allTrucks[0]);
      return allTrucks;
    },
    refetchOnWindowFocus: false,
    staleTime: 30000, // Cache for 30 seconds to reduce query frequency
    gcTime: 60000, // Keep in cache for 1 minute
  });
};