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
      console.log('🔍 Fetching all brokers...');
      
      return queryWithTimeout(async () => {
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .order('name');
        
        if (error) {
          console.error('❌ Error fetching brokers:', error);
          throw error;
        }
        
        console.log(`✅ TOTAL BROKERS FETCHED: ${data?.length || 0}`);
        return data || [];
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