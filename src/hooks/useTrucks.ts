import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useTrucks = () => {
  return useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      console.log('🚛 Fetching trucks with relationships...');
      
      return queryWithTimeout(async () => {
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
            console.error('❌ Full error details:', JSON.stringify(error, null, 2));
            throw error;
          }
          
          console.log('✅ Raw truck data sample:', JSON.stringify(data?.[0], null, 2));
          
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
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 0, // Don't cache - always fetch fresh
    gcTime: 600000, // Keep in memory for 10 minutes
    placeholderData: (previousData) => previousData,
  });
};