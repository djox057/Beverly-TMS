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
  other_charges, other_charges_driver, other_charges_reason,
  other_additionals, other_additionals_driver, other_additionals_reason,
  additional_miles, booked_by, paid, invoiced,
  original_truck_id, original_trailer_id
`;

/**
 * Hook that subscribes to real-time changes on orders and related tables.
 * Uses DEBOUNCED batch processing to prevent query avalanches.
 * 
 * Phase 3G: Debounce 1s — collect changed order IDs, then batch-fetch once.
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    // ─── Debounce state ───
    const pendingOrderIds = new Set<string>();
    const pendingDeletes = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFlushing = false;

    /**
     * Batch-fetch multiple orders at once using flat + parallel batch pattern.
     * Much more efficient than fetching one order at a time.
     */
    const fetchOrdersBatch = async (orderIds: string[]) => {
      if (orderIds.length === 0) return [];

      // Stage 1: Flat orders fetch
      const { data: orders, error } = await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .in("id", orderIds);

      if (error || !orders || orders.length === 0) {
        console.error("[Realtime] Batch fetch error:", error);
        return [];
      }

      // Stage 2: Parallel relation fetches by order_id
      const ids = orders.map(o => o.id);
      const [pickupDropsRes, orderFilesRes, transfersRes] = await Promise.all([
        supabase.from("pickup_drops").select("*").in("order_id", ids),
        supabase.from("order_files").select("id, order_id, file_category, file_name, file_path").in("order_id", ids),
        supabase.from("order_transfers").select("*").in("order_id", ids),
      ]);

      // Group relations by order_id
      const groupBy = (arr: any[]) => {
        const map = new Map<string, any[]>();
        for (const item of arr) {
          const list = map.get(item.order_id);
          if (list) list.push(item); else map.set(item.order_id, [item]);
        }
        return map;
      };
      const pdMap = groupBy(pickupDropsRes.data || []);
      const ofMap = groupBy(orderFilesRes.data || []);
      const otMap = groupBy(transfersRes.data || []);

      // Stage 3: Collect unique entity IDs from ALL orders
      const collectIds = (...fields: string[]) => {
        const s = new Set<string>();
        for (const o of orders) for (const f of fields) if (o[f]) s.add(o[f]);
        return [...s];
      };

      const truckIds = collectIds("truck_id", "original_truck_id");
      const driverIds = collectIds("driver1_id", "driver2_id", "original_driver1_id", "original_driver2_id");
      const brokerIds = collectIds("broker_id");
      const companyIds = collectIds("company_id", "booked_by_company_id");
      const trailerIds = collectIds("trailer_id", "original_trailer_id");

      const [trucksRes, driversRes, brokersRes, companiesRes, trailersRes] = await Promise.all([
        truckIds.length > 0 ? supabase.from("trucks").select("id, truck_number, company_id").in("id", truckIds) : { data: [] },
        driverIds.length > 0 ? supabase.from("drivers").select("id, name, company_id").in("id", driverIds) : { data: [] },
        brokerIds.length > 0 ? supabase.from("brokers").select("id, name, mc_number, address").in("id", brokerIds) : { data: [] },
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        trailerIds.length > 0 ? supabase.from("trailers").select("id, trailer_number").in("id", trailerIds) : { data: [] },
      ]);

      const truckMap = new Map((trucksRes.data || []).map(t => [t.id, t]));
      const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));
      const brokerMap = new Map((brokersRes.data || []).map(b => [b.id, b]));
      const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
      const trailerMap = new Map((trailersRes.data || []).map(t => [t.id, t]));

      // Fetch driver/truck company IDs that aren't in the main company set
      const extraCompanyIds = new Set<string>();
      for (const [, d] of driverMap) if (d.company_id && !companyMap.has(d.company_id)) extraCompanyIds.add(d.company_id);
      for (const [, t] of truckMap) if (t.company_id && !companyMap.has(t.company_id)) extraCompanyIds.add(t.company_id);
      if (extraCompanyIds.size > 0) {
        const { data: extra } = await supabase.from("companies").select("id, name").in("id", [...extraCompanyIds]);
        for (const c of extra || []) companyMap.set(c.id, c);
      }

      // Enrich entities
      for (const [, t] of truckMap) t.company = companyMap.get(t.company_id) || null;
      for (const [, d] of driverMap) d.company = companyMap.get(d.company_id) || null;

      // Assemble full order objects
      return orders.map(order => ({
        ...order,
        pickup_drops: pdMap.get(order.id) || [],
        order_files: ofMap.get(order.id) || [],
        order_transfers: otMap.get(order.id) || [],
        truck: truckMap.get(order.truck_id) || null,
        trailer: trailerMap.get(order.trailer_id) || null,
        driver1: driverMap.get(order.driver1_id) || null,
        driver2: driverMap.get(order.driver2_id) || null,
        broker: brokerMap.get(order.broker_id) || null,
        company: companyMap.get(order.company_id) || null,
        booked_by_company: companyMap.get(order.booked_by_company_id) || null,
        original_driver1: driverMap.get(order.original_driver1_id) || null,
        original_driver2: driverMap.get(order.original_driver2_id) || null,
        original_truck: truckMap.get(order.original_truck_id) || null,
        original_trailer: trailerMap.get(order.original_trailer_id) || null,
      }));
    };

    // Update ALL orders caches
    const updateAllOrdersCaches = (
      orderId: string,
      transformedOrder: any | null,
      isDelete = false
    ) => {
      const cache = queryClient.getQueryCache();
      const orderQueries = cache.findAll({ queryKey: ["orders"], exact: false });

      orderQueries.forEach((query) => {
        queryClient.setQueryData(query.queryKey, (old: any[] | undefined) => {
          if (!old) return isDelete ? old : (transformedOrder ? [transformedOrder] : old);
          if (isDelete) return old.filter((o) => o.id !== orderId);
          if (!transformedOrder) return old;
          const idx = old.findIndex((o) => o.id === orderId);
          if (idx >= 0) { const u = [...old]; u[idx] = transformedOrder; return u; }
          // Only insert NEW orders into unfiltered caches
          const qk = query.queryKey as string[];
          const isFilteredOrSearch = qk.length > 1 && (qk[1] === 'filtered' || qk[1] === 'search' || qk[1] === 'page');
          if (isFilteredOrSearch) return old;
          return [transformedOrder, ...old];
        });
      });
    };

    /**
     * Flush all pending order changes in a single batch fetch.
     * This runs at most once per second, no matter how many events arrive.
     */
    const flushPending = async () => {
      if (isFlushing) return;
      isFlushing = true;

      // Snapshot and clear pending sets
      const deleteIds = [...pendingDeletes];
      pendingDeletes.clear();
      const fetchIds = [...pendingOrderIds].filter(id => !deleteIds.includes(id));
      pendingOrderIds.clear();

      try {
        // Process deletes
        for (const id of deleteIds) {
          updateAllOrdersCaches(id, null, true);
        }

        // Batch-fetch all changed orders at once
        if (fetchIds.length > 0) {
          console.log(`[Realtime] Batch-fetching ${fetchIds.length} changed orders`);
          const fullOrders = await fetchOrdersBatch(fetchIds);
          const transformed = transformOrders(fullOrders);
          for (const t of transformed) {
            updateAllOrdersCaches(t.id, t);
          }
        }
      } catch (err) {
        console.error("[Realtime] Flush error:", err);
      } finally {
        isFlushing = false;
      }
    };

    /**
     * Schedule a flush — debounced at 1 second.
     * Multiple events within 1s are coalesced into one batch fetch.
     */
    const scheduleFlush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushPending, 1000);
    };

    // Handle order changes — just queue, don't fetch
    const handleOrderChange = (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.id || oldRecord?.id;
      if (!orderId) return;

      if (payload.eventType === "DELETE") {
        pendingDeletes.add(orderId);
      } else {
        pendingOrderIds.add(orderId);
      }
      scheduleFlush();
    };

    // Handle related table changes — just queue the order_id
    const handleRelatedTableChange = (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.order_id || oldRecord?.order_id;
      if (!orderId) return;

      pendingOrderIds.add(orderId);
      scheduleFlush();
    };

    // Create channel and subscribe
    const channel = supabase
      .channel("orders-realtime-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handleOrderChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_transfers" }, handleRelatedTableChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_files" }, handleRelatedTableChange)
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
