import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { setTruckOosOverride } from "@/hooks/useTruckOosOverrides";

export const OOS_BROADCAST_CHANNEL = "truck-oos";
export const OOS_BROADCAST_EVENT = "oos-changed";

/**
 * Live-updates OOS (out of service) truck flags across sessions.
 *
 * Uses a lightweight broadcast channel instead of listening to row changes on
 * `trucks`: that table is rewritten by background jobs every few minutes, so
 * table-level realtime cost millions of messages a day. A broadcast costs one
 * message per actual click.
 */
export const useTruckOosRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(OOS_BROADCAST_CHANNEL)
      .on("broadcast", { event: OOS_BROADCAST_EVENT }, ({ payload }) => {
        const truckId = (payload as any)?.truckId as string | undefined;
        const oos = !!(payload as any)?.oos;
        if (!truckId) return;
        setTruckOosOverride(truckId, oos);
        queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["trucks"], exact: false });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
