import { fetchActiveEfsRows } from "@/lib/activeEfsRequests";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEfsReceiptCutoff } from "@/lib/efsReceiptWindow";

/**
 * Returns fuel EFS requests for a driver that are still missing their receipt
 * (and have not been bypassed). Used to block new fuel EFS requests.
 */
export function useDriverMissingFuelReceipt(driverId?: string, enabled = true) {
  return useQuery({
    queryKey: ["driver-missing-fuel-receipts", driverId, "recovery-exempt"],
    enabled: !!driverId && enabled,
    staleTime: 30 * 1000,
    queryFn: async () => {
      // Apply the exemption at the data source too, so no consumer receives a
      // blocking receipt list for a recovery driver (including stale dialogs).
      const { data: driver, error: driverError } = await supabase.from("drivers")
        .select("is_recovery").eq("id", driverId!).maybeSingle();
      if (driverError) throw driverError;
      if (driver?.is_recovery === true) return [];

      const { data, error } = await fetchActiveEfsRows((activeOnly) => {
        const query = supabase
          .from("efs_other_requests")
          .select("id, amount, requested_at, city, state")
          .eq("driver_id", driverId!)
          .eq("purpose", "Fuel")
          .eq("receipt_bypassed", false)
          .gte("requested_at", getEfsReceiptCutoff())
          .is("receipt_path", null)
          .order("requested_at", { ascending: false });
        return activeOnly ? query.is("voided_at", null) : query;
      });

      if (error) throw error;
      return data ?? [];
    },
  });
}
