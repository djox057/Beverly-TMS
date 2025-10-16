import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useCompanies = () => {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      console.log('🏢 Fetching companies...');
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
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
};