import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useBrokers = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("brokers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brokers" },
        () => queryClient.invalidateQueries({ queryKey: ["brokers", "v2"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['brokers', 'v2'],
    queryFn: async () => {
      
      
      return queryWithTimeout(async () => {
        let allBrokers: any[] = [];
        let page = 0;
        const pageSize = 1000;
        
        // Keep fetching until we get less than a full page
        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          
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
            allBrokers = [...allBrokers, ...data];
            
            // If we got less than a full page, we're done
            if (data.length < pageSize) {
              break;
            }
            
            page++;
          } else {
            // No more data
            console.log('✅ No more data to fetch');
            break;
          }
        }
        
        return allBrokers;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes (brokers rarely change)
    gcTime: 60 * 60 * 1000, // Keep in memory for 60 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
};