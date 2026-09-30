import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { injectOrdersIntoGlobalStore } from "./useReportsDateWindow";
import { isValidUUID } from "@/utils/validation";
import { filterReportGroups, matchesReportLoad, reportOrderBelongsToDrivers, type ReportSearchFilters } from "@/lib/reportsSearch";

type Status = "idle" | "searching" | "found" | "not_found";
type Meta = { isLocked?: boolean; isCanceled?: boolean; pickupDate?: string };

// Use a normal ilike argument for user text; only validated UUIDs enter OR syntax.
export async function lookupCoverageLoads(term: string, driverIds: string[], today: string, signal: AbortSignal): Promise<any[]> {
  const ids = [...new Set(driverIds.filter(isValidUUID))].sort();
  if (!ids.length) return [];
  const pattern = `%${term.trim().replace(/[\\%_]/g, "\\$&")}%`;
  const matched = new Set<string>();
  for (let start = 0; start < ids.length; start += 25) {
    const list = ids.slice(start, start + 25).join(",");
    const directScope = `driver1_id.in.(${list}),driver2_id.in.(${list}),and(driver1_id.is.null,driver2_id.is.null,or(original_driver1_id.in.(${list}),original_driver2_id.in.(${list})))`;
    const transferScope = `driver1_id.in.(${list}),driver2_id.in.(${list})`;
    const results = await Promise.all(["broker_load_number", "internal_load_number"].flatMap(field => [
      supabase.from("orders").select("id").or(directScope).ilike(field, pattern).abortSignal(signal),
      supabase.from("orders").select("id,order_transfers!inner(driver1_id,driver2_id)")
        .eq("is_recovery", true).or(transferScope, { referencedTable: "order_transfers" })
        .ilike(field, pattern).abortSignal(signal),
    ]));
    for (const result of results) {
      if (result.error) throw result.error;
      for (const row of result.data ?? []) matched.add(row.id);
    }
  }
  if (signal.aborted || !matched.size) return [];
  const orders: any[] = [];
  const orderIds = [...matched];
  for (let start = 0; start < orderIds.length; start += 50) {
    const { data, error } = await supabase.from("orders").select("*,pickup_drops(*),order_transfers(*)")
      .in("id", orderIds.slice(start, start + 50)).abortSignal(signal);
    if (error) throw error;
    orders.push(...(data ?? []));
  }
  return orders.filter(order => reportOrderBelongsToDrivers(order, ids) && matchesReportLoad(order, term, today))
    .sort((a, b) => String(b.pickup_datetime ?? "").localeCompare(String(a.pickup_datetime ?? "")));
}

export function useCoverageReportsSearch({ enabled, groups, filters, loading }: {
  enabled: boolean;
  groups: any[] | null;
  filters: ReportSearchFilters;
  loading: boolean;
}) {
  const visible = useMemo(() => enabled ? filterReportGroups(groups, filters) : [], [enabled, groups, filters]);
  const eligible = enabled ? filterReportGroups(groups, { ...filters, load: "" }) : [];
  const driverIds = [...new Set(eligible.flatMap(group => group.trucks.map((truck: any) => truck.driverId)))].sort() as string[];
  const term = filters.load?.trim() ?? "";
  const key = JSON.stringify([enabled, term, filters.today, driverIds, [...(filters.driverIds ?? [])].sort()]);
  const localOrder = visible.flatMap(group => group.trucks).flatMap(truck => truck.allOrders ?? [])
    .find(order => matchesReportLoad(order, term, filters.today));
  const [remote, setRemote] = useState<{ key: string; done: boolean; meta: Meta | null; error?: boolean } | null>(null);
  const hasLocalOrder = !!localOrder;

  useEffect(() => {
    if (!enabled || term.length < 3 || hasLocalOrder || loading || !driverIds.length || (remote?.key === key && remote.done)) return;
    const controller = new AbortController();
    setRemote({ key, done: false, meta: null });
    void lookupCoverageLoads(term, driverIds, filters.today, controller.signal).then(orders => {
      if (controller.signal.aborted) return;
      const order = orders[0];
      const pickup = order?.pickup_drops?.filter((s: any) => s.type === "pickup")
        .sort((a: any, b: any) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))[0]?.datetime || order?.pickup_datetime;
      setRemote({ key, done: true, meta: order ? { isLocked: order.locked, isCanceled: order.canceled, pickupDate: pickup } : null });
      if (orders.length) injectOrdersIntoGlobalStore(orders);
    }).catch(error => {
      if (controller.signal.aborted) return;
      console.error("[CoverageSearch] Load lookup failed", error);
      // A failed request does not mean the load is absent from the assignment.
      setRemote({ key, done: true, meta: null, error: true });
    });
    return () => controller.abort();
    // The full key captures scope and every eligible row; data updates cannot reuse another assignment's result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, hasLocalOrder, loading]);

  const current = remote?.key === key ? remote : null;
  const status = (value?: string): Status => !value?.trim() ? "idle" : visible.length ? "found" : loading ? "searching" : "not_found";
  const loadStatus: Status = !term ? "idle" : hasLocalOrder ? "found" : loading || (term.length >= 3 && driverIds.length && !current?.done)
    ? "searching" : current?.error ? "idle" : "not_found";
  return {
    ambiguousMatch: null,
    searchStatus: { truck: status(filters.unit), dispatch: status(filters.dispatch), load: loadStatus },
    foundOrderMeta: enabled && term ? current?.meta ?? (localOrder ? {
      isLocked: localOrder.locked, isCanceled: localOrder.canceled,
      pickupDate: localOrder.pickupStops?.[0]?.datetime || localOrder.pickup_datetime,
    } : null) : null,
  };
}
