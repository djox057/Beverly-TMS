import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useNextInternalLoadNumber = (companyId?: string, companyName?: string) => {
  return useQuery({
    queryKey: ['nextInternalLoadNumber', companyId],
    queryFn: async () => {
      if (!companyId) return "1";
      
      const { data, error } = await supabase.rpc("preview_next_internal_load_number", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return data;

    },
    enabled: !!companyId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
