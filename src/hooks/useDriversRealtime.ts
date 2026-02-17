import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { isValidUUID } from "@/utils/validation";

/**
 * Hook that subscribes to real-time changes on drivers and related tables.
 * Uses debounced batch processing to prevent query avalanches.
 * Phase 3G: Debounce 1s + batch fetch affected drivers instead of sequential loop.
 */
export function useDriversRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["drivers", "v2"];

    // ─── Debounce state ───
    const pendingDriverIds = new Set<string>();
    const pendingDeletes = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFlushing = false;

    /**
     * Batch-fetch multiple drivers at once with all relations.
     */
    const fetchDriversBatch = async (driverIds: string[]) => {
      if (driverIds.length === 0) return [];

      const { data: drivers, error } = await supabase
        .from("drivers")
        .select("*")
        .in("id", driverIds);

      if (error || !drivers || drivers.length === 0) return [];

      // Remove legacy companies property
      const cleanDrivers = drivers.map(d => {
        const { companies, ...clean } = d as any;
        return clean;
      });

      // Collect unique IDs
      const companyIds = [...new Set(cleanDrivers.map(d => d.company_id).filter(Boolean))] as string[];
      const dispatcherIds = [...new Set(cleanDrivers.map(d => d.dispatcher_id).filter(Boolean))].filter(isValidUUID) as string[];

      // Parallel fetch: companies, dispatchers, trucks assigned to these drivers
      const [companiesRes, dispatchersRes, trucksRes] = await Promise.all([
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        dispatcherIds.length > 0 ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", dispatcherIds) : { data: [] },
        supabase.from("trucks").select("id, truck_number, trailer_id, driver1_id, driver2_id")
          .or(driverIds.map(id => `driver1_id.eq.${id},driver2_id.eq.${id}`).join(",")),
      ]);

      const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
      const dispatcherMap = new Map((dispatchersRes.data || []).map(d => [d.user_id, d]));

      // Fetch trailers for trucks
      const trailerIds = [...new Set((trucksRes.data || []).map(t => t.trailer_id).filter(Boolean))] as string[];
      const trailersRes = trailerIds.length > 0
        ? await supabase.from("trailers").select("id, trailer_number").in("id", trailerIds)
        : { data: [] };
      const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));

      // Build truck-by-driver map
      const truckByDriver = new Map<string, any>();
      for (const truck of trucksRes.data || []) {
        const truckWithTrailer = { ...truck, trailer: trailerMap.get(truck.trailer_id) || null };
        if (truck.driver1_id) truckByDriver.set(truck.driver1_id, truckWithTrailer);
        if (truck.driver2_id) truckByDriver.set(truck.driver2_id, truckWithTrailer);
      }

      // Use cached has_account values
      const cachedDrivers = queryClient.getQueryData<any[]>(QUERY_KEY);
      const cachedMap = new Map((cachedDrivers || []).map(d => [d.id, d]));

      return cleanDrivers.map(driver => {
        const truck = truckByDriver.get(driver.id);
        const dispatcher = dispatcherMap.get(driver.dispatcher_id);
        return {
          ...driver,
          company: companyMap.get(driver.company_id) || null,
          truck_info: truck ? { truck_number: truck.truck_number, trailer_number: truck.trailer?.trailer_number || null } : null,
          dispatcher_info: dispatcher ? { full_name: dispatcher.full_name, email: dispatcher.email } : null,
          has_account: cachedMap.get(driver.id)?.has_account ?? false,
        };
      });
    };

    const updateCache = (driverId: string, transformed: any | null, isDelete = false) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformed ? [transformed] : old;
        if (isDelete) return old.filter(d => d.id !== driverId);
        if (!transformed) return old;
        const idx = old.findIndex(d => d.id === driverId);
        if (idx >= 0) { const u = [...old]; u[idx] = transformed; return u; }
        return [...old, transformed];
      });
    };

    const flushPending = async () => {
      if (isFlushing) return;
      isFlushing = true;

      const deleteIds = [...pendingDeletes];
      pendingDeletes.clear();
      const fetchIds = [...pendingDriverIds].filter(id => !deleteIds.includes(id));
      pendingDriverIds.clear();

      try {
        for (const id of deleteIds) updateCache(id, null, true);
        if (fetchIds.length > 0) {
          console.log(`[DriversRT] Batch-fetching ${fetchIds.length} changed drivers`);
          const drivers = await fetchDriversBatch(fetchIds);
          for (const d of drivers) updateCache(d.id, d);
        }
      } catch (err) {
        console.error("[DriversRT] Flush error:", err);
      } finally {
        isFlushing = false;
      }
    };

    const scheduleFlush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushPending, 1000);
    };

    const handleDriverChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const driverId = newRec?.id || oldRec?.id;
      if (!driverId) return;
      if (payload.eventType === "DELETE") pendingDeletes.add(driverId);
      else pendingDriverIds.add(driverId);
      scheduleFlush();
    };

    const handleTruckChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const affectedIds = new Set<string>();
      if (newRec?.driver1_id) affectedIds.add(newRec.driver1_id);
      if (newRec?.driver2_id) affectedIds.add(newRec.driver2_id);
      if (oldRec?.driver1_id) affectedIds.add(oldRec.driver1_id);
      if (oldRec?.driver2_id) affectedIds.add(oldRec.driver2_id);
      for (const id of affectedIds) pendingDriverIds.add(id);
      if (affectedIds.size > 0) scheduleFlush();
    };

    const handleTrailerChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const trailerId = newRec?.id || oldRec?.id;
      if (!trailerId) return;
      // Find drivers whose trucks use this trailer
      const { data: affectedTrucks } = await supabase.from("trucks").select("driver1_id, driver2_id").eq("trailer_id", trailerId);
      for (const t of affectedTrucks || []) {
        if (t.driver1_id) pendingDriverIds.add(t.driver1_id);
        if (t.driver2_id) pendingDriverIds.add(t.driver2_id);
      }
      if (pendingDriverIds.size > 0) scheduleFlush();
    };

    const handleCompanyChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const companyId = newRec?.id || oldRec?.id;
      if (!companyId) return;
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached) return;
      const affected = cached.filter(d => d.company?.id === companyId || d.company_id === companyId).map(d => d.id);
      for (const id of affected) pendingDriverIds.add(id);
      if (affected.length > 0) scheduleFlush();
    };

    const handleProfileChange = (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const userId = newRec?.user_id || oldRec?.user_id;
      if (!userId) return;
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached) return;
      const affected = cached.filter(d => d.dispatcher_id === userId).map(d => d.id);
      for (const id of affected) pendingDriverIds.add(id);
      if (affected.length > 0) scheduleFlush();
    };

    const channel = supabase
      .channel("drivers-realtime-advanced")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, handleDriverChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, handleTruckChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, handleTrailerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, handleCompanyChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, handleProfileChange)
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
