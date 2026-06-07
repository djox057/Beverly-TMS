import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { enrichOrdersWithRelations } from "@/utils/ordersFlatBatchFetch";
import { transformOrders } from "@/utils/ordersTransform";
import {
  injectOrdersIntoGlobalStore,
  removeOrdersFromGlobalStore,
} from "./useReportsDateWindow";

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

    const pendingChangedIds = new Set<string>();
    const pendingDeletedIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFlushing = false;

    const flush = async () => {
      if (isFlushing) return;
      isFlushing = true;
      const deleteIds = [...pendingDeletedIds];
      pendingDeletedIds.clear();
      const fetchIds = [...pendingChangedIds].filter((id) => !deleteIds.includes(id));
      pendingChangedIds.clear();

      try {
        if (deleteIds.length > 0) {
          removeOrdersFromGlobalStore(deleteIds);
        }

        if (fetchIds.length > 0) {
          const { data: flatOrders, error } = await supabase
            .from("orders")
            .select("*")
            .in("id", fetchIds);
          if (error) {
            console.error("[ReportsRealtime] Fetch error:", error);
          } else if (flatOrders && flatOrders.length > 0) {
            const fetchedIds = new Set(flatOrders.map((o: any) => o.id));
            const missing = fetchIds.filter((id) => !fetchedIds.has(id));
            if (missing.length > 0) {
              // Orders no longer accessible (deleted or RLS) — remove from store
              removeOrdersFromGlobalStore(missing);
            }
            const enriched = await enrichOrdersWithRelations(flatOrders);
            const transformed = transformOrders(enriched);
            injectOrdersIntoGlobalStore(transformed);
          }
        }

        // Keep legacy consumers (useReports.ts mutations / drug tests) fresh
        queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
      } catch (err) {
        console.error("[ReportsRealtime] Flush error:", err);
      } finally {
        isFlushing = false;
        if (pendingChangedIds.size > 0 || pendingDeletedIds.size > 0) {
          scheduleFlush();
        }
      }
    };

    const scheduleFlush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 1000);
    };

    const handleOrderChange = (payload: any) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const orderId = newRec?.id || oldRec?.id;
      if (!orderId) return;
      if (payload.eventType === "DELETE") {
        pendingDeletedIds.add(orderId);
      } else {
        pendingChangedIds.add(orderId);
      }
      scheduleFlush();
    };

    const handleRelatedChange = (payload: any) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const orderId = newRec?.order_id || oldRec?.order_id;
      if (!orderId) return;
      pendingChangedIds.add(orderId);
      scheduleFlush();
    };

    const channel = supabase
      .channel("reports-realtime-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handleOrderChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, handleRelatedChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_transfers" }, handleRelatedChange)
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
