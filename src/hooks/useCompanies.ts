import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useCompanies = () => {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      console.log('🏢 Fetching companies...');
      
      return queryWithTimeout(async () => {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .order('name');
        
        console.log('🏢 Companies query result:', { data, error, count: data?.length });
        
        if (error) {
          console.error('🏢 Error fetching companies:', error);
          throw error;
        }
        return data;
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