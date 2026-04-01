import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySuffix } from "@/utils/formatInternalLoadNumber";

export const useNextInternalLoadNumber = (companyId?: string, companyName?: string) => {
  return useQuery({
    queryKey: ['nextInternalLoadNumber', companyId],
    queryFn: async () => {
      if (!companyId) return "1";
      
      const { data, error } = await supabase
        .from('orders')
        .select('internal_load_number')
        .eq('company_id', companyId)
        .not('internal_load_number', 'is', null)
        .order('internal_load_number', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      // Extract max numeric part from text values like "7941-BF"
      let maxNum = 0;
      for (const row of data || []) {
        const num = parseInt((row.internal_load_number || "").split("-")[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
      
      const nextNum = maxNum + 1;
      const suffix = getCompanySuffix(companyName);
      return suffix ? `${nextNum}-${suffix}` : `${nextNum}`;
    },
    enabled: !!companyId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
