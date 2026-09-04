import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeTable } from "@/hooks/realtimeBus";

/**
 * App-level realtime subscription that invalidates the ["truck-sales"] query
 * whenever trucks / drivers / companies change.
 *
 * Mounted once in <AppContent /> so it runs for the entire authenticated
 * session — Truck Sales stays fresh even when the page isn't open.
 */
export function useTruckSalesRealtime() {
  const queryClient = useQueryClient();
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

    // Only `trucks` is published to realtime; drivers / companies /
    // driver_yard_actions bindings never delivered anything.
    const unsubscribe = subscribeTable("trucks", scheduleInvalidate, scheduleInvalidate);

    return () => {
      isSubscribedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [queryClient]);
}