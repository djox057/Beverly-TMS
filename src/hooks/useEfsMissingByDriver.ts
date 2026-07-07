import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to get a set of driver IDs that have missing EFS fuel data (missing receipt or gallons)
 */
export function useEfsMissingByDriver() {
  const { data: driverIdsWithMissingData = new Set<string>(), isLoading } = useQuery({
    queryKey: ["efs-missing-by-driver"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("driver_id")
        .eq("purpose", "Fuel")
        .eq("receipt_bypassed", false)
        .or("receipt_path.is.null,quantity.is.null")
        .not("driver_id", "is", null);

      if (error) throw error;

      // Create a set of unique driver IDs
      const driverIds = new Set<string>();
      data?.forEach((row) => {
        if (row.driver_id) {
          driverIds.add(row.driver_id);
        }
      });
      return driverIds;
    },
    staleTime: 30 * 1000,
  });

  return {
    driverIdsWithMissingData,
    isLoading,
    hasDriverMissingData: (driverId: string | null | undefined) => {
      if (!driverId) return false;
      return driverIdsWithMissingData.has(driverId);
    },
  };
}
