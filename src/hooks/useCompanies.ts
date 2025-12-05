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

export const useCompanies = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("companies-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies" },
        () => queryClient.invalidateQueries({ queryKey: ["companies"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      return queryWithTimeout(async () => {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .order('name');
        
        if (error) {
          console.error('Error fetching companies:', error);
          throw error;
        }
        
        return data || [];
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 600000, // Cache for 10 minutes (companies change rarely)
    gcTime: 600000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: true, // Always refetch on mount
    placeholderData: (previousData) => previousData,
  });
};
