import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns fuel EFS requests for a driver that are still missing their receipt
 * (and have not been bypassed). Used to block new fuel EFS requests.
 */
export function useDriverMissingFuelReceipt(driverId?: string, enabled = true) {
  return useQuery({
    queryKey: ["driver-missing-fuel-receipts", driverId],
    enabled: !!driverId && enabled,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("id, amount, requested_at, city, state")
        .eq("driver_id", driverId!)
        .eq("purpose", "Fuel")
        .eq("receipt_bypassed", false)
        .is("receipt_path", null)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
