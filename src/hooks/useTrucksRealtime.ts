import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { isValidUUID } from "@/utils/validation";

/**
 * Hook that subscribes to real-time changes on trucks and related tables.
 * Uses debounced batch processing to prevent query avalanches.
 * Phase 3G: Debounce 1s + batch fetch affected trucks instead of sequential loop.
 */
export function useTrucksRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["trucks", "v2"];

    // ─── Debounce state ───
    const pendingTruckIds = new Set<string>();
    const pendingDeletes = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFlushing = false;

    /**
     * Batch-fetch multiple trucks at once with all relations.
     */
    const fetchTrucksBatch = async (truckIds: string[]) => {
      if (truckIds.length === 0) return [];

      const { data: trucks, error } = await supabase
        .from("trucks")
        .select("*")
        .in("id", truckIds);

      if (error || !trucks || trucks.length === 0) return [];

      // Collect unique IDs
      const driverIds = [...new Set(trucks.flatMap(t => [t.driver1_id, t.driver2_id].filter(Boolean)))] as string[];
      const trailerIds = [...new Set(trucks.map(t => t.trailer_id).filter(Boolean))] as string[];
      const companyIds = [...new Set(trucks.map(t => t.company_id).filter(Boolean))] as string[];

      const [driversRes, trailersRes, companiesRes] = await Promise.all([
        driverIds.length > 0 ? supabase.from("drivers").select("id, name, dispatcher_id, company_id").in("id", driverIds) : { data: [] },
        trailerIds.length > 0 ? supabase.from("trailers").select("id, trailer_number, trailer_type").in("id", trailerIds) : { data: [] },
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
      ]);

      const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));
      const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));
      const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));

      // Fetch driver companies
      const driverCompanyIds = [...new Set((driversRes.data || []).map(d => d.company_id).filter(Boolean).filter(id => !companyMap.has(id)))] as string[];
      if (driverCompanyIds.length > 0) {
        const { data } = await supabase.from("companies").select("id, name").in("id", driverCompanyIds);
        for (const c of data || []) companyMap.set(c.id, c);
      }

      // Fetch dispatchers
      const dispatcherIds = [...new Set((driversRes.data || []).map(d => d.dispatcher_id).filter(Boolean))].filter(isValidUUID) as string[];
      const dispatcherMap = new Map<string, any>();
      if (dispatcherIds.length > 0) {
        const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", dispatcherIds);
        for (const p of data || []) dispatcherMap.set(p.user_id, p);
      }

      // Enrich drivers with company
      for (const [, d] of driverMap) d.company = companyMap.get(d.company_id) || null;

      return trucks.map(truck => {
        const driver1 = driverMap.get(truck.driver1_id) || null;
        const dispatcher = driver1?.dispatcher_id ? dispatcherMap.get(driver1.dispatcher_id) : null;
        return {
          ...truck,
          trailer: trailerMap.get(truck.trailer_id) || null,
          driver1,
          driver2: driverMap.get(truck.driver2_id) || null,
          company: driver1?.company || companyMap.get(truck.company_id) || null,
          dispatcher: dispatcher ? { id: dispatcher.user_id, full_name: dispatcher.full_name, email: dispatcher.email } : null,
        };
      });
    };

    const updateCache = (truckId: string, transformedTruck: any | null, isDelete = false) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformedTruck ? [transformedTruck] : old;
        if (isDelete) return old.filter((t) => t.id !== truckId);
        if (!transformedTruck) return old;
        const idx = old.findIndex((t) => t.id === truckId);
        if (idx >= 0) { const u = [...old]; u[idx] = transformedTruck; return u; }
        return [...old, transformedTruck];
      });
    };

    const flushPending = async () => {
      if (isFlushing) return;
      isFlushing = true;

      const deleteIds = [...pendingDeletes];
      pendingDeletes.clear();
      const fetchIds = [...pendingTruckIds].filter(id => !deleteIds.includes(id));
      pendingTruckIds.clear();

      try {
        for (const id of deleteIds) updateCache(id, null, true);
        if (fetchIds.length > 0) {
          console.log(`[TrucksRT] Batch-fetching ${fetchIds.length} changed trucks`);
          const trucks = await fetchTrucksBatch(fetchIds);
          for (const t of trucks) updateCache(t.id, t);
        }
      } catch (err) {
      console.error("[TrucksRT] Flush error:", err);
    } finally {
      isFlushing = false;
      // Re-check for events that arrived during the async flush
      if (pendingTruckIds.size > 0 || pendingDeletes.size > 0) {
        scheduleFlush();
      }
    }
  };

    const scheduleFlush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushPending, 1000);
    };

    const handleTruckChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const truckId = newRec?.id || oldRec?.id;
      if (!truckId) return;
      if (payload.eventType === "DELETE") pendingDeletes.add(truckId);
      else pendingTruckIds.add(truckId);
      scheduleFlush();
    };

    const handleRelatedTableChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const recordId = newRec?.id || oldRec?.id;
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached || !recordId) return;

      const tableName = (payload as any).table || "";
      let affected: string[] = [];
      if (tableName === "trailers") {
        affected = cached.filter(t => t.trailer?.id === recordId || t.trailer_id === recordId).map(t => t.id);
      } else if (tableName === "drivers") {
        affected = cached.filter(t => t.driver1?.id === recordId || t.driver2?.id === recordId || t.driver1_id === recordId || t.driver2_id === recordId).map(t => t.id);
      } else if (tableName === "companies") {
        affected = cached.filter(t => t.company?.id === recordId || t.driver1?.company_id === recordId || t.driver2?.company_id === recordId).map(t => t.id);
      }

      for (const id of affected) pendingTruckIds.add(id);
      if (affected.length > 0) scheduleFlush();
    };

    const channel = supabase
      .channel("trucks-realtime-advanced")
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, handleTruckChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, handleRelatedTableChange)
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
