import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns all-time load counts per driver across BOTH driver1_id and driver2_id,
 * excluding placeholder GAME|OVER rows. Used to gate "new driver" UI (drug-test
 * cell + filter button) so a veteran driver with only 1 load in the visible
 * date window is not mistakenly treated as new.
 */
export const useDriverAllTimeLoadCounts = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["driver-all-time-load-counts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const counts = new Map<string, number>();
      const PAGE = 1000;

      const fetchAll = async (column: "driver1_id" | "driver2_id") => {
        let from = 0;
        // Loop until we've fetched everything
        while (true) {
          const { data: rows, error } = await supabase
            .from("orders")
            .select(`${column}`)
            .not(column, "is", null)
            .or("notes.is.null,notes.neq.GAME|OVER")
            .range(from, from + PAGE - 1);

          if (error) throw error;
          if (!rows || rows.length === 0) break;

          for (const r of rows as any[]) {
            const id = r[column];
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }

          if (rows.length < PAGE) break;
          from += PAGE;
        }
      };

      await Promise.all([fetchAll("driver1_id"), fetchAll("driver2_id")]);
      return counts;
    },
  });

  const getLoadCount = useCallback(
    (driverId: string | null | undefined) => {
      if (!driverId || !data) return 0;
      return data.get(driverId) ?? 0;
    },
    [data],
  );

  return useMemo(
    () => ({
      getLoadCount,
      isLoading,
    }),
    [getLoadCount, isLoading],
  );
};