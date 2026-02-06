import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Hook that subscribes to real-time changes on trucks and related tables.
 * Uses setQueryData to patch cache directly - no full refetch needed.
 * All fetches use flat+batch pattern (no joins) to avoid RLS amplification.
 */
export function useTrucksRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["trucks", "v2"];

    // Flat+batch single truck fetch (no joins)
    const fetchSingleTruck = async (truckId: string) => {
      const { data: truck, error } = await supabase
        .from("trucks")
        .select("*")
        .eq("id", truckId)
        .maybeSingle();

      if (error || !truck) return null;

      // Parallel batch fetch for related entities
      const driverIds = [truck.driver1_id, truck.driver2_id].filter(Boolean) as string[];

      const [driversRes, trailerRes, companyRes] = await Promise.all([
        driverIds.length > 0
          ? supabase.from("drivers").select("id, name, dispatcher_id, company_id").in("id", driverIds)
          : { data: [] },
        truck.trailer_id
          ? supabase.from("trailers").select("id, trailer_number, trailer_type").eq("id", truck.trailer_id).maybeSingle()
          : { data: null },
        truck.company_id
          ? supabase.from("companies").select("id, name").eq("id", truck.company_id).maybeSingle()
          : { data: null },
      ]);

      const drivers = driversRes.data || [];
      const driver1 = drivers.find(d => d.id === truck.driver1_id) || null;
      const driver2 = drivers.find(d => d.id === truck.driver2_id) || null;

      // Fetch dispatcher if driver1 has one
      let dispatcher = null;
      if (driver1?.dispatcher_id) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("user_id", driver1.dispatcher_id)
          .maybeSingle();
        dispatcher = data;
      }

      // Fetch driver companies
      const driverCompanyIds = [...new Set(drivers.map(d => d.company_id).filter(Boolean))] as string[];
      const driverCompaniesRes = driverCompanyIds.length > 0
        ? await supabase.from("companies").select("id, name").in("id", driverCompanyIds)
        : { data: [] };
      const companyMap = new Map((driverCompaniesRes.data || []).map(c => [c.id, c]));

      const driver1WithCompany = driver1 ? { ...driver1, company: companyMap.get(driver1.company_id) || null } : null;
      const driver2WithCompany = driver2 ? { ...driver2, company: companyMap.get(driver2.company_id) || null } : null;

      return {
        ...truck,
        trailer: trailerRes.data || null,
        driver1: driver1WithCompany,
        driver2: driver2WithCompany,
        company: driver1WithCompany?.company || companyRes.data || null,
        dispatcher: dispatcher
          ? { id: dispatcher.user_id, full_name: dispatcher.full_name, email: dispatcher.email }
          : null,
      };
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

    const handleTruckChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const truckId = newRec?.id || oldRec?.id;
      if (payload.eventType === "DELETE") { updateCache(oldRec.id, null, true); return; }
      if (!truckId) return;
      const full = await fetchSingleTruck(truckId);
      if (full) updateCache(truckId, full);
    };

    const handleRelatedTableChange = async (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const recordId = newRec?.id || oldRec?.id;
      const tableName = (payload as any).table || "";
      const cached = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cached) return;

      let affected: string[] = [];
      if (tableName === "trailers") {
        affected = cached.filter(t => t.trailer?.id === recordId || t.trailer_id === recordId).map(t => t.id);
      } else if (tableName === "drivers") {
        affected = cached.filter(t => t.driver1?.id === recordId || t.driver2?.id === recordId || t.driver1_id === recordId || t.driver2_id === recordId).map(t => t.id);
      } else if (tableName === "companies") {
        affected = cached.filter(t => t.company?.id === recordId || t.driver1?.company_id === recordId || t.driver2?.company_id === recordId).map(t => t.id);
      }

      for (const id of affected) {
        const full = await fetchSingleTruck(id);
        if (full) updateCache(id, full);
      }
    };

    const channel = supabase
      .channel("trucks-realtime-advanced")
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, handleTruckChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, handleRelatedTableChange)
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
