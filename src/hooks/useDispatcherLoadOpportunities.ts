import { isDispatcherRole } from "@/lib/dispatchAccess";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { busChannel, type BusPayload } from "@/hooks/realtimeBus";
import type { UserRole } from "@/hooks/useAuth";

export interface DispatcherLoadOpportunities {
  prebookCount: number;
  recoveryCount: number;
  truckIds: string[];
  orderIds: string[];
  matchedOrderIds?: string[];
}

export const dispatcherOpportunitiesKey = (userId: string | undefined) =>
  ["dispatcher-load-opportunities", userId] as const;

export function normalizeOpportunities(data: unknown): DispatcherLoadOpportunities {
  const row = (Array.isArray(data) ? data[0] : data) as {
    prebook_count: number; recovery_count: number; truck_ids: string[]; order_ids: string[]; matched_order_ids?: string[];
  } | undefined;
  if (!row || !Number.isInteger(row.prebook_count) || !Number.isInteger(row.recovery_count)
    || row.prebook_count < 0 || row.recovery_count < 0
    || !Array.isArray(row.truck_ids) || !Array.isArray(row.order_ids)) {
    // A missing/failed response is not an authoritative zero.
    throw new Error("Load opportunity counts are unavailable");
  }
  return {
    prebookCount: row.prebook_count, recoveryCount: row.recovery_count,
    truckIds: row.truck_ids, orderIds: row.order_ids,
    ...(Array.isArray(row.matched_order_ids) ? { matchedOrderIds: row.matched_order_ids } : {}),
  };
}

/** Dispatcher and supervisor, independent of Individual mode and the currently open page. */
export function useDispatcherLoadOpportunities(userId: string | undefined, role: UserRole | null) {
  const client = useQueryClient();
  const enabled = !!userId && isDispatcherRole(role);
  const key = dispatcherOpportunitiesKey(userId);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("get_dispatcher_load_opportunities_v2").abortSignal(signal);
      if (error) throw error;
      return normalizeOpportunities(data);
    },
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    if (!enabled) return;
    const queryKey = dispatcherOpportunitiesKey(userId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const enteringOrderIds = new Set<string>();
    const refresh = () => {
      if (document.hidden) {
        void client.invalidateQueries({ queryKey, refetchType: "none" });
        return;
      }
      // Cancel a response started before the change, so it cannot overwrite a
      // newer calculation (also covers events during the initial request).
      void client.cancelQueries({ queryKey }).then(() => client.invalidateQueries({ queryKey }));
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, 300);
    };
    const scope = () => client.getQueryData<DispatcherLoadOpportunities>(queryKey);
    const orderChanged = (payload: BusPayload) => {
      const current = scope();
      const relevant = (row: Record<string, unknown>) => row.prebook === true || row.retrieval === true
        || row.recovery_assigned === true || current?.truckIds.includes(String(row.truck_id))
        || current?.orderIds.includes(String(row.id)) || enteringOrderIds.has(String(row.id));
      const next = payload.new as Record<string, unknown>;
      const old = payload.old as Record<string, unknown>;
      if (!current || payload.eventType === "DELETE" || relevant(next) || relevant(old)) {
        if (next.id) enteringOrderIds.add(String(next.id));
        schedule();
      }
    };
    const stopChanged = (payload: BusPayload) => {
      const current = scope();
      const ids = [payload.new, payload.old].map(row => String((row as Record<string, unknown>).order_id));
      // DELETE may contain only the stop PK under default replica identity.
      if (!current || payload.eventType === "DELETE"
        || ids.some(id => current.orderIds.includes(id) || enteringOrderIds.has(id))) schedule();
    };
    const channel = busChannel(schedule, `dispatcher-load-opportunities:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, orderChanged)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, stopChanged)
      // These tables intentionally do not broadcast fleet/GPS updates. The bus
      // supplies one shared 60s fallback, not one request per binding.
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_files" }, stopChanged)
      .subscribe();

    // Same-tab edits refresh immediately, including unpublished assignment and
    // document tables. Remote load changes arrive through the shared bus.
    const unsubscribeCache = client.getQueryCache().subscribe(event => {
      if (event.type !== "updated" || event.action.type !== "invalidate") return;
      const root = event.query.queryKey[0];
      if (typeof root === "string" && /^(trucks|drivers|companies|recovery-loads|order-files|adapter-order-files)(-|$)/.test(root)) schedule();
    });
    const onVisible = () => { if (!document.hidden) schedule(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      channel.unsubscribe();
      unsubscribeCache();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", schedule);
    };
  }, [client, enabled, userId]);

  return query;
}
