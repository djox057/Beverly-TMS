import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { transformOrders } from "@/utils/ordersTransform";

// Flat column list - NO joins (matches edge function pattern)
const ORDER_COLUMNS = `
  id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
  created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
  canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
  is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
  deleted_truck_number, deleted_trailer_number, deleted_driver1_name, deleted_driver2_name,
  freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
  tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver,
  late_fee, late_fee_driver, no_tracking_fee, no_tracking_fee_driver,
  wrong_address_fee, wrong_address_fee_driver, escort_fee,
  other_charges, other_charges_driver, booked_by,
  original_truck_id, original_trailer_id
`;

/**
 * Hook that subscribes to real-time changes on orders and related tables.
 * Updates ALL matching React Query caches directly via setQueryData to avoid expensive refetches.
 * 
 * Phase 3C: Uses flat fetch + parallel batch queries instead of 14-join monster query.
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Only subscribe once globally
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    /**
     * Fetch a single order using flat + parallel batch pattern.
     * Each query is a trivial index lookup — no lateral joins, no RLS subquery storm.
     */
    const fetchSingleOrder = async (orderId: string) => {
      // Stage 1: Flat order fetch
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("[Realtime] Error fetching order:", orderError);
        return null;
      }

      // Stage 2: Parallel relation fetches (all by order_id — trivial index lookups)
      const [pickupDropsRes, orderFilesRes, transfersRes, recoveryRes] = await Promise.all([
        supabase.from("pickup_drops").select("*").eq("order_id", orderId),
        supabase.from("order_files").select("id, file_category, file_name, file_path").eq("order_id", orderId),
        supabase.from("order_transfers").select("*").eq("order_id", orderId),
        supabase.from("recovery_history").select("*").eq("order_id", orderId),
      ]);

      // Stage 3: Parallel entity fetches (by primary key — instant)
      const entityPromises: Promise<any>[] = [];
      const entityKeys: string[] = [];

      const addEntityFetch = (table: string, id: string | null, columns: string, key: string) => {
        if (id) {
          entityPromises.push(supabase.from(table as any).select(columns).eq("id", id).maybeSingle() as any);
          entityKeys.push(key);
        }
      };

      addEntityFetch("trucks", order.truck_id, "id, truck_number, company_id", "truck");
      addEntityFetch("trailers", order.trailer_id, "id, trailer_number", "trailer");
      addEntityFetch("drivers", order.driver1_id, "id, name, company_id", "driver1");
      addEntityFetch("drivers", order.driver2_id, "id, name, company_id", "driver2");
      addEntityFetch("brokers", order.broker_id, "id, name, mc_number, address", "broker");
      addEntityFetch("companies", order.company_id, "id, name", "company");
      addEntityFetch("companies", order.booked_by_company_id, "id, name", "booked_by_company");
      addEntityFetch("drivers", order.original_driver1_id, "id, name", "original_driver1");
      addEntityFetch("drivers", order.original_driver2_id, "id, name", "original_driver2");
      addEntityFetch("trucks", order.original_truck_id, "id, truck_number", "original_truck");
      addEntityFetch("trailers", order.original_trailer_id, "id, trailer_number", "original_trailer");

      const entityResults = await Promise.all(entityPromises);
      const entities: Record<string, any> = {};
      entityKeys.forEach((key, i) => {
        entities[key] = entityResults[i]?.data || null;
      });

      // Enrich truck and drivers with company info
      const companyIds = new Set<string>();
      if (entities.truck?.company_id) companyIds.add(entities.truck.company_id);
      if (entities.driver1?.company_id) companyIds.add(entities.driver1.company_id);
      if (entities.driver2?.company_id) companyIds.add(entities.driver2.company_id);
      // Remove already-fetched company IDs
      if (order.company_id) companyIds.delete(order.company_id);
      if (order.booked_by_company_id) companyIds.delete(order.booked_by_company_id);

      let extraCompanies: Record<string, any> = {};
      if (companyIds.size > 0) {
        const { data: cos } = await supabase.from("companies").select("id, name").in("id", Array.from(companyIds));
        if (cos) cos.forEach(c => { extraCompanies[c.id] = c; });
      }

      // Also merge already-fetched companies
      if (entities.company) extraCompanies[entities.company.id] = entities.company;
      if (entities.booked_by_company) extraCompanies[entities.booked_by_company.id] = entities.booked_by_company;

      // Attach company to truck and drivers
      if (entities.truck) entities.truck.company = extraCompanies[entities.truck.company_id] || null;
      if (entities.driver1) entities.driver1.company = extraCompanies[entities.driver1.company_id] || null;
      if (entities.driver2) entities.driver2.company = extraCompanies[entities.driver2.company_id] || null;

      // Enrich transfer records with driver/truck/trailer names
      const transfers = transfersRes.data || [];
      if (transfers.length > 0) {
        const tDriverIds = new Set<string>();
        const tTruckIds = new Set<string>();
        const tTrailerIds = new Set<string>();
        for (const t of transfers) {
          if (t.driver1_id) tDriverIds.add(t.driver1_id);
          if (t.driver2_id) tDriverIds.add(t.driver2_id);
          if (t.truck_id) tTruckIds.add(t.truck_id);
          if (t.trailer_id) tTrailerIds.add(t.trailer_id);
        }
        const [tDrivers, tTrucks, tTrailers] = await Promise.all([
          tDriverIds.size > 0 ? supabase.from("drivers").select("id, name").in("id", Array.from(tDriverIds)) : { data: [] },
          tTruckIds.size > 0 ? supabase.from("trucks").select("id, truck_number").in("id", Array.from(tTruckIds)) : { data: [] },
          tTrailerIds.size > 0 ? supabase.from("trailers").select("id, trailer_number").in("id", Array.from(tTrailerIds)) : { data: [] },
        ]);
        const dMap = new Map(((tDrivers as any).data || []).map((d: any) => [d.id, d]));
        const tkMap = new Map(((tTrucks as any).data || []).map((t: any) => [t.id, t]));
        const tlMap = new Map(((tTrailers as any).data || []).map((t: any) => [t.id, t]));
        for (const t of transfers) {
          (t as any).driver1 = dMap.get(t.driver1_id) || null;
          (t as any).driver2 = dMap.get(t.driver2_id) || null;
          (t as any).truck = tkMap.get(t.truck_id) || null;
          (t as any).trailer = tlMap.get(t.trailer_id) || null;
        }
      }

      // Enrich recovery_history
      const recoveries = recoveryRes.data || [];
      if (recoveries.length > 0) {
        const rDriverIds = new Set<string>();
        const rTruckIds = new Set<string>();
        const rTrailerIds = new Set<string>();
        for (const r of recoveries) {
          if (r.recovery_driver1_id) rDriverIds.add(r.recovery_driver1_id);
          if (r.recovery_driver2_id) rDriverIds.add(r.recovery_driver2_id);
          if (r.recovery_truck_id) rTruckIds.add(r.recovery_truck_id);
          if (r.recovery_trailer_id) rTrailerIds.add(r.recovery_trailer_id);
        }
        const [rDrivers, rTrucks, rTrailers] = await Promise.all([
          rDriverIds.size > 0 ? supabase.from("drivers").select("id, name").in("id", Array.from(rDriverIds)) : { data: [] },
          rTruckIds.size > 0 ? supabase.from("trucks").select("id, truck_number").in("id", Array.from(rTruckIds)) : { data: [] },
          rTrailerIds.size > 0 ? supabase.from("trailers").select("id, trailer_number").in("id", Array.from(rTrailerIds)) : { data: [] },
        ]);
        const dMap2 = new Map(((rDrivers as any).data || []).map((d: any) => [d.id, d]));
        const tkMap2 = new Map(((rTrucks as any).data || []).map((t: any) => [t.id, t]));
        const tlMap2 = new Map(((rTrailers as any).data || []).map((t: any) => [t.id, t]));
        for (const r of recoveries) {
          (r as any).recovery_driver1 = dMap2.get(r.recovery_driver1_id) || null;
          (r as any).recovery_driver2 = dMap2.get(r.recovery_driver2_id) || null;
          (r as any).recovery_truck = tkMap2.get(r.recovery_truck_id) || null;
          (r as any).recovery_trailer = tlMap2.get(r.recovery_trailer_id) || null;
        }
      }

      // Assemble the full order object matching the old join shape
      return {
        ...order,
        pickup_drops: pickupDropsRes.data || [],
        order_files: orderFilesRes.data || [],
        order_transfers: transfers,
        recovery_history: recoveries,
        broker: entities.broker,
        company: entities.company,
        booked_by_company: entities.booked_by_company,
        truck: entities.truck,
        trailer: entities.trailer,
        driver1: entities.driver1,
        driver2: entities.driver2,
        original_driver1: entities.original_driver1,
        original_driver2: entities.original_driver2,
        original_truck: entities.original_truck,
        original_trailer: entities.original_trailer,
      };
    };

    // Transform raw order to match the UI shape
    const transformOrder = (order: any) => transformOrders([order])[0];

    // Update ALL orders caches that start with ["orders"]
    const updateAllOrdersCaches = (
      orderId: string,
      transformedOrder: any | null,
      isDelete: boolean = false
    ) => {
      const cache = queryClient.getQueryCache();
      const orderQueries = cache.findAll({ queryKey: ["orders"], exact: false });

      console.log(`[Realtime] Updating ${orderQueries.length} orders caches for order ${orderId}`);

      orderQueries.forEach((query) => {
        queryClient.setQueryData(query.queryKey, (old: any[] | undefined) => {
          if (!old) return isDelete ? old : (transformedOrder ? [transformedOrder] : old);

          if (isDelete) {
            return old.filter((o) => o.id !== orderId);
          }

          if (!transformedOrder) return old;

          const existingIndex = old.findIndex((o) => o.id === orderId);
          if (existingIndex >= 0) {
            const updated = [...old];
            updated[existingIndex] = transformedOrder;
            return updated;
          } else {
            return [transformedOrder, ...old];
          }
        });
      });
    };

    // Handle order changes
    const handleOrderChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.id || oldRecord?.id;

      console.log(`[Realtime] Order ${eventType}:`, orderId);

      if (eventType === "DELETE") {
        updateAllOrdersCaches(oldRecord.id, null, true);
        return;
      }

      if (!orderId) return;

      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) {
        console.error("[Realtime] Could not fetch order:", orderId);
        return;
      }

      const transformedOrder = transformOrder(fullOrder);
      updateAllOrdersCaches(orderId, transformedOrder);
    };

    // Handle related table changes
    const handleRelatedTableChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.order_id || oldRecord?.order_id;
      const tableName = (payload as any).table || '';

      if (!orderId) return;

      console.log(`[Realtime] Related table change for order:`, orderId, `table:`, tableName);

      if (tableName === 'order_files') {
        queryClient.invalidateQueries({ 
          queryKey: ["adapter-order-files"],
          refetchType: 'active'
        });
      }

      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) return;

      const transformedOrder = transformOrder(fullOrder);
      updateAllOrdersCaches(orderId, transformedOrder);
    };

    // Create channel and subscribe
    const channel = supabase
      .channel("orders-realtime-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handleOrderChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_transfers" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_files" }, handleRelatedTableChange)
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[Realtime] Unsubscribing from orders channel");
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
