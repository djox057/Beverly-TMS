import { useEffect } from "react";
import { subscribeTable } from "@/hooks/realtimeBus";
import { useQueryClient } from "@tanstack/react-query";
import { setTruckOosOverride } from "@/hooks/useTruckOosOverrides";

/**
 * Live-updates OOS (out of service) truck flags across pages.
 * Subscribes to UPDATE events on public.trucks and refreshes the
 * reports/trucks caches when the `oos` value changes.
 */
export const useTruckOosRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeTable("trucks", (payload) => {
      if (payload.eventType !== "UPDATE") return;
      const oldOos = (payload.old as any)?.oos;
      const newOos = (payload.new as any)?.oos;
      const truckId = (payload.new as any)?.id;
      if (oldOos === newOos) return;
      if (truckId) setTruckOosOverride(truckId, !!newOos);
      queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["trucks"], exact: false });
    });
  }, [queryClient]);
};
