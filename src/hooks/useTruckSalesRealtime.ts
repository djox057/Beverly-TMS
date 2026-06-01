import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * App-level realtime subscription that invalidates the ["truck-sales"] query
 * whenever trucks / drivers / companies change.
 *
 * Mounted once in <AppContent /> so it runs for the entire authenticated
 * session — Truck Sales stays fresh even when the page isn't open.
 */
export function useTruckSalesRealtime() {
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
        queryClient.invalidateQueries({ queryKey: ["truck-sales"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["truck-sales-yard-actions"], exact: false });
      }, 1000);
    };

    const channel = supabase
      .channel("truck-sales-realtime-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, scheduleInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, scheduleInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, scheduleInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_yard_actions" }, scheduleInvalidate)
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