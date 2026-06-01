import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * App-level realtime subscription that invalidates the ["reports"] query family
 * whenever orders / pickup_drops / order_transfers change.
 *
 * Mounted once in <AppContent /> so it runs for the entire authenticated
 * session — Reports stays fresh even when the page isn't currently open.
 *
 * Invalidations are debounced (1s) to coalesce bursts (e.g., creating an order
 * with multiple pickup_drops in quick succession).
 */
export function useReportsRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
      }, 1000);
    };

    const channel = supabase
      .channel("reports-realtime-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, scheduleInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_transfers" }, scheduleInvalidate)
      .subscribe();

    channelRef.current = channel;

    return () => {
      isSubscribedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
