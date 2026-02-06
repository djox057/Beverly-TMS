import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Hook that subscribes to real-time changes on drivers and related tables.
 * Uses setQueryData to patch cache directly - no full refetch needed.
 * All fetches use flat+batch pattern (no joins) to avoid RLS amplification.
 */
export function useDriversRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["drivers", "v2"];

    // Flat+batch single driver fetch (no joins)
    const fetchSingleDriver = async (driverId: string) => {
      const { data: driver, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .maybeSingle();

      if (error || !driver) return null;

      // Remove legacy companies property
      const { companies, ...cleanDriver } = driver as any;

      // Parallel fetch for related entities
      const [companyRes, truckRes, dispatcherRes] = await Promise.all([
        driver.company_id
          ? supabase.from("companies").select("id, name").eq("id", driver.company_id).maybeSingle()
          : { data: null },
        supabase.from("trucks").select("id, truck_number, trailer_id, driver1_id, driver2_id")
          .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
          .limit(1)
          .maybeSingle(),
        driver.dispatcher_id
          ? supabase.from("profiles").select("user_id, full_name, email").eq("user_id", driver.dispatcher_id).maybeSingle()
          : { data: null },
      ]);

      // Fetch trailer if truck has one
      let trailerNumber: string | null = null;
      if (truckRes.data?.trailer_id) {
        const { data: trailer } = await supabase
          .from("trailers")
          .select("trailer_number")
          .eq("id", truckRes.data.trailer_id)
          .maybeSingle();
        trailerNumber = trailer?.trailer_number || null;
      }

      // Check has_account from cached data instead of expensive user_roles query
      const cachedDrivers = queryClient.getQueryData<any[]>(QUERY_KEY);
      const cachedDriver = cachedDrivers?.find(d => d.id === driverId);
      const hasAccount = cachedDriver?.has_account ?? false;

      return {
        ...cleanDriver,
        company: companyRes.data || null,
        truck_info: truckRes.data
          ? { truck_number: truckRes.data.truck_number, trailer_number: trailerNumber }
          : null,
        dispatcher_info: dispatcherRes.data
          ? { full_name: dispatcherRes.data.full_name, email: dispatcherRes.data.email }
          : null,
        has_account: hasAccount,
      };
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

    const handleDriverChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const driverId = newRec?.id || oldRec?.id;
      if (payload.eventType === "DELETE") { updateCache(oldRec.id, null, true); return; }
      if (!driverId) return;
      const full = await fetchSingleDriver(driverId);
      if (full) updateCache(driverId, full);
    };

    const handleTruckChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const affectedIds = new Set<string>();
      if (newRec?.driver1_id) affectedIds.add(newRec.driver1_id);
      if (newRec?.driver2_id) affectedIds.add(newRec.driver2_id);
      if (oldRec?.driver1_id) affectedIds.add(oldRec.driver1_id);
      if (oldRec?.driver2_id) affectedIds.add(oldRec.driver2_id);
      for (const id of affectedIds) {
        const full = await fetchSingleDriver(id);
        if (full) updateCache(id, full);
      }
    };

    const handleTrailerChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const trailerId = newRec?.id || oldRec?.id;
      if (!trailerId) return;
      const { data: affectedTrucks } = await supabase.from("trucks").select("driver1_id, driver2_id").eq("trailer_id", trailerId);
      const ids = new Set<string>();
      affectedTrucks?.forEach(t => { if (t.driver1_id) ids.add(t.driver1_id); if (t.driver2_id) ids.add(t.driver2_id); });
      for (const id of ids) {
        const full = await fetchSingleDriver(id);
        if (full) updateCache(id, full);
      }
    };

    const handleCompanyChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const companyId = newRec?.id || oldRec?.id;
      if (!companyId) return;
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached) return;
      const affected = cached.filter(d => d.company?.id === companyId || d.company_id === companyId).map(d => d.id);
      for (const id of affected) {
        const full = await fetchSingleDriver(id);
        if (full) updateCache(id, full);
      }
    };

    const handleProfileChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const userId = newRec?.user_id || oldRec?.user_id;
      if (!userId) return;
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached) return;
      const affected = cached.filter(d => d.dispatcher_id === userId).map(d => d.id);
      for (const id of affected) {
        const full = await fetchSingleDriver(id);
        if (full) updateCache(id, full);
      }
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
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
