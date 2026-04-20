import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Map<driverId, number> of total non-canceled lifetime orders per driver.
 * Counts both driver1_id and driver2_id assignments so team drivers count for both.
 */
export const useDriverAllTimeLoadCounts = () => {
  const query = useQuery({
    queryKey: ["driver-all-time-load-counts"],
    queryFn: async () => {
      const counts = new Map<string, number>();
      const batchSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("driver1_id, driver2_id, status")
          .neq("status", "canceled")
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const row of data) {
          if (row.driver1_id) {
            counts.set(row.driver1_id, (counts.get(row.driver1_id) || 0) + 1);
          }
          if (row.driver2_id) {
            counts.set(row.driver2_id, (counts.get(row.driver2_id) || 0) + 1);
          }
        }

        if (data.length < batchSize) break;
        from += batchSize;
      }

      return counts;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const getDriverLoadCount = useCallback(
    (driverId: string | null | undefined) => {
      if (!driverId) return 0;
      return query.data?.get(driverId) ?? 0;
    },
    [query.data],
  );

  return {
    loadCounts: query.data,
    isLoading: query.isLoading,
    getDriverLoadCount,
  };
};