import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Live-updates OOS (out of service) truck flags across pages.
 * Subscribes to UPDATE events on public.trucks and refreshes the
 * reports/trucks caches when the `oos` value changes.
 */
export const useTruckOosRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`truck-oos-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trucks" },
        (payload) => {
          const oldOos = (payload.old as any)?.oos;
          const newOos = (payload.new as any)?.oos;
          if (oldOos === newOos) return;
          queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["trucks"], exact: false });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
