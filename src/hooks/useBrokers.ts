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

      console.log('🔍 Starting to fetch all brokers...');

      // Fetch all brokers in batches to avoid Supabase limits
      while (hasMore) {
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .order('name')
          .range(from, from + limit - 1);
        
        if (error) {
          console.error('❌ Error fetching brokers:', error);
          throw error;
        }
        
        if (data && data.length > 0) {
          console.log(`✅ Fetched ${data.length} brokers (batch ${Math.floor(from / limit) + 1})`);
          allBrokers = [...allBrokers, ...data];
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
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