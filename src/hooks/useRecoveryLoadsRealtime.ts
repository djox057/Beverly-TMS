import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { busChannel, type BusPayload } from "@/hooks/realtimeBus";

/** Refresh recovery lists only for relevant orders, coalescing assignment bursts. */
export function useRecoveryLoadsRealtime(orders: Array<{ id: string }>) {
  const client = useQueryClient();
  const knownIds = useRef(new Set<string>());
  knownIds.current = new Set(orders.map(order => order.id));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["recovery-loads"] });
      void client.invalidateQueries({ queryKey: ["recovery-loads-count"] });
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, 300);
    };
    const relevant = (record: Record<string, unknown>) => record.retrieval === true || record.recovery_assigned === true || knownIds.current.has(String(record.id));
    const orderChanged = (payload: BusPayload) => {
      const next = payload.new as Record<string, unknown>;
      const previous = payload.old as Record<string, unknown>;
      if (relevant(next) || relevant(previous)) {
        // Remember newly entering rows before the refetch, so a quick removal
        // with only an old primary key cannot leave a stale row behind.
        if (next.id) knownIds.current.add(String(next.id));
        schedule();
      }
    };
    const relatedChanged = (payload: BusPayload) => {
      const next = payload.new as Record<string, unknown>;
      const previous = payload.old as Record<string, unknown>;
      if (knownIds.current.has(String(next.order_id)) || knownIds.current.has(String(previous.order_id))) schedule();
    };
    const channel = busChannel(refresh, "recovery-loads")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, orderChanged)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, relatedChanged)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); channel.unsubscribe(); };
  }, [client]);
}
