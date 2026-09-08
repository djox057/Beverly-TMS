import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BATCH = 200;

/**
 * Resolves driver id -> display name for a bounded set of ids, in batches.
 * Used by dialogs that only need names (e.g. All Problems) so they never
 * download the full enriched driver list.
 */
export const useDriverNames = (driverIds: string[], enabled = true) => {
  const ids = Array.from(new Set(driverIds.filter(Boolean))).sort();

  return useQuery({
    queryKey: ["driver-names", ids],
    queryFn: async () => {
      const map = new Map<string, string>();
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("drivers")
          .select("id, name, first_name, last_name")
          .in("id", chunk);
        if (error) throw error;
        for (const d of data || []) {
          const name =
            (d as any).name ||
            `${(d as any).first_name || ""} ${(d as any).last_name || ""}`.trim() ||
            "Unknown";
          map.set(d.id, name);
        }
      }
      return map;
    },
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
