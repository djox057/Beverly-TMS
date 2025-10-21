import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useBrokers = () => {
  return useQuery({
    queryKey: ['brokers', 'v2'],
    queryFn: async () => {
      console.log('🔍 Starting to fetch all brokers...');
      
      return queryWithTimeout(async () => {
        let allBrokers: any[] = [];
        let page = 0;
        const pageSize = 1000;
        
        // Keep fetching until we get less than a full page
        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          
          console.log(`🔍 Fetching batch ${page + 1}: range ${from}-${to}`);
          
          const { data, error } = await supabase
            .from('brokers')
            .select('*')
            .order('name')
            .range(from, to);
          
          if (error) {
            console.error('❌ Error fetching brokers:', error);
            throw error;
          }
          
          if (data && data.length > 0) {
            console.log(`✅ Fetched ${data.length} brokers in batch ${page + 1}`);
            allBrokers = [...allBrokers, ...data];
            
            // If we got less than a full page, we're done
            if (data.length < pageSize) {
              console.log(`✅ Last batch - got ${data.length} brokers`);
              break;
            }
            
            page++;
          } else {
            // No more data
            console.log('✅ No more data to fetch');
            break;
          }
        }
        
        console.log(`✅ TOTAL BROKERS FETCHED: ${allBrokers.length}`);
        return allBrokers;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 300000, // Cache for 5 minutes
    gcTime: 600000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
};