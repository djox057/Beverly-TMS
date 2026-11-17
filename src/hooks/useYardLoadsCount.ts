import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useYardLoadsCount = () => {
  return useQuery({
    queryKey: ["yard-loads-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .or("driver1_id.is.null,is_recovery.eq.true")
        .is("truck_id", null)
        .eq("prebook", false);

      if (error) {
        console.error("Error fetching yard loads count:", error);
        throw error;
      }

      return count || 0;
    },
    staleTime: 300000,
    refetchInterval: 300000,
    retry: false,
  });
};
