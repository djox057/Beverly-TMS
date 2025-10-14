import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useBrokers = () => {
  return useQuery({
    queryKey: ['brokers'],
    queryFn: async () => {
      console.log('🔍 Starting to fetch all brokers...');
      
      let allBrokers: any[] = [];
      let page = 0;
      const pageSize = 1000;
      
      // Keep fetching until we get less than a full page
      while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        console.log(`🔍 Fetching batch ${page + 1}: range ${from}-${to}`);
        
        const { data, error, count } = await supabase
          .from('brokers')
          .select('*', { count: 'exact' })
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
          break;
        }
      }
      
      console.log(`✅ Total brokers fetched: ${allBrokers.length}`);
      
      // Check if the specific broker exists
      const testBroker = allBrokers.find(b => b.id === '1dda8956-e4c2-45b1-904c-d763a7d55f1b');
      console.log('🔍 Test broker (TRANSPORTATION ONE, LLC) found:', testBroker ? 'YES' : 'NO');
      if (testBroker) {
        console.log('📋 Test broker data:', testBroker);
      }
      
      return allBrokers;
    },
  });
};