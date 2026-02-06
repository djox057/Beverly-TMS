import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Hook that subscribes to real-time changes on trucks and related tables.
 * Uses setQueryData to patch cache directly - no full refetch needed.
 */
export function useTrucksRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Only subscribe once globally
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["trucks", "v2"];

    // Fetch a single truck with all necessary joins (same shape as list query)
    const fetchSingleTruck = async (truckId: string) => {
      const { data: truck, error } = await supabase
        .from("trucks")
        .select(`
          *,
          trailer:trailers(id, trailer_number, trailer_type),
          driver1:drivers!trucks_driver1_id_fkey(id, name, dispatcher_id, company_id),
          driver2:drivers!trucks_driver2_id_fkey(id, name, dispatcher_id, company_id),
          company:companies(id, name)
        `)
        .eq("id", truckId)
        .maybeSingle();

      if (error) {
        console.error("[TrucksRealtime] Error fetching truck:", error);
        return null;
      }

      if (!truck) return null;

      // Fetch dispatcher info
      const dispatcherId = truck.driver1?.dispatcher_id;
      let dispatcher = null;
      if (dispatcherId) {
        const { data: dispatcherData } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("user_id", dispatcherId)
          .maybeSingle();
        dispatcher = dispatcherData;
      }

      // Fetch companies for drivers
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name");

      // Enrich driver1 with company
      let driver1WithCompany: any = truck.driver1;
      if (truck.driver1 && companies) {
        const driverCompany = companies.find((c) => c.id === truck.driver1.company_id);
        if (driverCompany) {
          driver1WithCompany = { ...truck.driver1, company: driverCompany };
        }
      }

      // Enrich driver2 with company
      let driver2WithCompany: any = truck.driver2;
      if (truck.driver2 && companies) {
        const driverCompany = companies.find((c) => c.id === truck.driver2.company_id);
        if (driverCompany) {
          driver2WithCompany = { ...truck.driver2, company: driverCompany };
        }
      }

      return {
        ...truck,
        driver1: driver1WithCompany,
        driver2: driver2WithCompany,
        dispatcher: dispatcher
          ? {
              id: dispatcher.user_id,
              full_name: dispatcher.full_name,
              email: dispatcher.email,
            }
          : null,
        company: driver1WithCompany?.company || truck.company,
      };
    };

    // Update cache with the transformed truck
    const updateCache = (
      truckId: string,
      transformedTruck: any | null,
      isDelete: boolean = false
    ) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformedTruck ? [transformedTruck] : old;

        if (isDelete) {
          console.log(`[TrucksRealtime] Removing truck ${truckId} from cache`);
          return old.filter((t) => t.id !== truckId);
        }

        if (!transformedTruck) return old;

        const existingIndex = old.findIndex((t) => t.id === truckId);
        if (existingIndex >= 0) {
          console.log(`[TrucksRealtime] Updating truck ${truckId} in cache`);
          const updated = [...old];
          updated[existingIndex] = transformedTruck;
          return updated;
        } else {
          console.log(`[TrucksRealtime] Inserting new truck ${truckId} into cache`);
          return [...old, transformedTruck];
        }
      });
    };

    // Handle truck changes
    const handleTruckChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const truckId = newRecord?.id || oldRecord?.id;

      console.log(`[TrucksRealtime] Truck ${eventType}:`, truckId);

      if (eventType === "DELETE") {
        updateCache(oldRecord.id, null, true);
        return;
      }

      if (!truckId) return;

      const fullTruck = await fetchSingleTruck(truckId);
      if (!fullTruck) {
        console.warn("[TrucksRealtime] Could not fetch truck, falling back to invalidation");
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        return;
      }

      updateCache(truckId, fullTruck);
    };

    // Handle related table changes (trailers, drivers, companies)
    const handleRelatedTableChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const recordId = newRecord?.id || oldRecord?.id;
      const tableName = (payload as any).table || "";

      console.log(`[TrucksRealtime] Related table change:`, tableName, recordId);

      // For related table changes, we need to find affected trucks and update them
      const cachedTrucks = queryClient.getQueryData<any[]>(QUERY_KEY);
      if (!cachedTrucks) return;

      let affectedTruckIds: string[] = [];

      if (tableName === "trailers") {
        affectedTruckIds = cachedTrucks
          .filter((t) => t.trailer?.id === recordId || t.trailer_id === recordId)
          .map((t) => t.id);
      } else if (tableName === "drivers") {
        affectedTruckIds = cachedTrucks
          .filter(
            (t) =>
              t.driver1?.id === recordId ||
              t.driver2?.id === recordId ||
              t.driver1_id === recordId ||
              t.driver2_id === recordId
          )
          .map((t) => t.id);
      } else if (tableName === "companies") {
        affectedTruckIds = cachedTrucks
          .filter(
            (t) =>
              t.company?.id === recordId ||
              t.driver1?.company_id === recordId ||
              t.driver2?.company_id === recordId
          )
          .map((t) => t.id);
      }

      // Update each affected truck
      for (const truckId of affectedTruckIds) {
        const fullTruck = await fetchSingleTruck(truckId);
        if (fullTruck) {
          updateCache(truckId, fullTruck);
        }
      }
    };

    // Create channel and subscribe
    const channel = supabase
      .channel("trucks-realtime-advanced")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        handleTruckChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trailers" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies" },
        handleRelatedTableChange
      )
      .subscribe((status) => {
        console.log("[TrucksRealtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[TrucksRealtime] Unsubscribing from trucks channel");
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
