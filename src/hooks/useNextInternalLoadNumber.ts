import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useNextInternalLoadNumber = (companyId?: string) => {
  return useQuery({
    queryKey: ['nextInternalLoadNumber', companyId],
    queryFn: async () => {
      if (!companyId) return 1;
      
      const { data, error } = await supabase
        .from('orders')
        .select('internal_load_number')
        .eq('company_id', companyId)
        .not('internal_load_number', 'is', null)
        .order('internal_load_number', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      // If no orders exist for this company or no internal_load_number is set, start from 1
      const lastNumber = data?.[0]?.internal_load_number || 0;
      return lastNumber + 1;
    },
    enabled: !!companyId, // Only run query if companyId is provided
  });
};