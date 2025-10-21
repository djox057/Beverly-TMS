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
            driver1:drivers!trucks_driver1_id_fkey(id, name, dispatcher_id),
            driver2:drivers!trucks_driver2_id_fkey(id, name, dispatcher_id),
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
      
      // Fetch all dispatchers to map to trucks
      const { data: dispatchers, error: dispatcherError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email');
      
      if (dispatcherError) {
        console.error('❌ Error fetching dispatchers:', dispatcherError);
        throw dispatcherError;
      }
      
      // Map dispatcher info to trucks based on driver1.dispatcher_id
      const trucksWithDispatchers = allTrucks.map(truck => {
        const dispatcherId = truck.driver1?.dispatcher_id;
        const dispatcher = dispatcherId 
          ? dispatchers?.find(d => d.user_id === dispatcherId)
          : null;
        
        return {
          ...truck,
          dispatcher: dispatcher ? {
            id: dispatcher.user_id,
            full_name: dispatcher.full_name,
            email: dispatcher.email
          } : null
        };
      });
      
      console.log(`✅ Total trucks fetched: ${trucksWithDispatchers.length}`);
      console.log('Sample truck:', trucksWithDispatchers[0]);
      return trucksWithDispatchers;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 60000,
  });
};