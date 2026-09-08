import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Loads a SINGLE driver row on demand (e.g. when the Edit Driver dialog opens).
 *
 * Reports used to keep the whole enriched driver list (~430 KB - 680 KB
 * serialized) mounted just so a closed dialog could look one driver up. This
 * hook replaces that with one row fetched only while the dialog is open.
 */
export const useDriverById = (driverId: string | null | undefined) => {
  return useQuery({
    queryKey: ["driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId as string)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
