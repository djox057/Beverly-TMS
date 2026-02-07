import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
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
 * Generate a stable query key for search results.
 */
function getSearchQueryKey(searchTerm: string, bookedBy?: string | null, dispatcherUserId?: string | null): (string | null | undefined)[] {
  return ["orders", "search", searchTerm, bookedBy, dispatcherUserId];
}

/** Collect unique non-null values from a field across orders */
function collectIds(orders: any[], ...fields: string[]): string[] {
  const ids = new Set<string>();
  for (const o of orders) {
    for (const f of fields) {
      if (o[f]) ids.add(o[f]);
    }
  }
  return Array.from(ids);
}

/** Batch fetch rows by ID and return a Map */
async function batchFetchMap(table: string, ids: string[], columns: string): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  const { data } = await (supabase.from(table as any).select(columns) as any).in("id", ids);
  const map = new Map<string, any>();
  if (data) (data as any[]).forEach((r: any) => map.set(r.id, r));
  return map;
}

/**
 * Server-side search hook for orders.
 * Phase 3C: Uses flat fetch + batch pattern instead of 14-join query.
 * Fixed: Removed circular queryKey dependency that caused infinite render loops.
 */
export function useOrdersSearch() {
  const queryClient = useQueryClient();
  
  const [activeSearchTerm, setActiveSearchTerm] = useState<string | null>(null);
  const [activeOptions, setActiveOptions] = useState<{ bookedBy?: string | null; dispatcherUserId?: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);
  const latestSearchKeyRef = useRef<string>("");
  
  // Refs to break the circular dependency: searchOrders no longer depends on reactive queryKey
  const activeQueryKeyRef = useRef<(string | null | undefined)[] | null>(null);
  const failedTermsRef = useRef<Set<string>>(new Set());
  const activeSearchTermRef = useRef<string | null>(null);

  const searchOrders = useCallback(async (
    searchTerm: string,
    options?: {
      bookedBy?: string | null;
      dispatcherUserId?: string | null;
    }
  ) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      if (activeQueryKeyRef.current) {
        queryClient.removeQueries({ queryKey: activeQueryKeyRef.current });
        activeQueryKeyRef.current = null;
      }
      activeSearchTermRef.current = null;
      setActiveSearchTerm(null);
      setActiveOptions(null);
      latestSearchKeyRef.current = "";
      return;
    }

    const term = searchTerm.trim().toLowerCase();
    const searchKey = `${term}|${options?.bookedBy || ''}|${options?.dispatcherUserId || ''}`;
    
    // Clear failed terms when user types a different term
    if (term !== activeSearchTermRef.current) {
      failedTermsRef.current.clear();
    }
    
    // Block retry on previously failed (timed-out) term
    if (failedTermsRef.current.has(term)) {
      console.warn(`[useOrdersSearch] Skipping search for "${term}" - previous timeout`);
      return;
    }
    
    latestSearchKeyRef.current = searchKey;
    activeSearchTermRef.current = term;
    
    setActiveSearchTerm(term);
    setActiveOptions(options || null);
    const newQueryKey = getSearchQueryKey(term, options?.bookedBy, options?.dispatcherUserId);
    activeQueryKeyRef.current = newQueryKey;
    
    console.log("[useOrdersSearch] Starting search for:", term);
    
    setIsSearching(true);
    setSearchError(null);

    try {
      // Cancel any in-flight search queries to reduce backend load
      queryClient.cancelQueries({ queryKey: ["orders", "search"] });
      
      // Get dispatcher driver IDs if needed
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // === STAGE 1: Flat order search (fast, index-friendly) ===
      const isNumericTerm = /^\d+$/.test(term);
      const numericValue = isNumericTerm ? parseInt(term, 10) : null;
      const isValidInternalLoadNumber = numericValue !== null && numericValue <= 2147483647;
      const parsedInternalLoadNumber = parseInternalLoadNumber(term);
      const hasValidInternalLoadNumber = parsedInternalLoadNumber !== null && parsedInternalLoadNumber <= 2147483647;

      let searchFilter: string;
      if (isNumericTerm && isValidInternalLoadNumber) {
        searchFilter = `broker_load_number.ilike.%${term}%,internal_load_number.eq.${term}`;
      } else if (hasValidInternalLoadNumber) {
        searchFilter = `broker_load_number.ilike.%${term}%,internal_load_number.eq.${parsedInternalLoadNumber}`;
      } else {
        searchFilter = `broker_load_number.ilike.%${term}%`;
      }

      let query = supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .or(searchFilter)
        .order("created_at", { ascending: false })
        .limit(100);

      // Apply dispatcher filtering
      if (options?.dispatcherUserId) {
        if (options?.bookedBy && dispatcherDriverIds.length > 0) {
          query = query.or(
            `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
          );
        } else if (options?.bookedBy) {
          query = query.eq("booked_by", options.bookedBy);
        } else if (dispatcherDriverIds.length > 0) {
          query = query.in("driver1_id", dispatcherDriverIds);
        }
      }

      const { data: flatOrders, error } = await query;

      // Stale response check
      if (latestSearchKeyRef.current !== searchKey) {
        console.log("[useOrdersSearch] Discarding stale response for:", searchKey);
        return;
      }

      if (error) {
        console.error("[useOrdersSearch] Query error:", error);
        throw error;
      }

      if (!flatOrders || flatOrders.length === 0) {
        console.log("[useOrdersSearch] No results");
        queryClient.setQueryData(newQueryKey, []);
        return;
      }

      // === STAGE 2: Batch fetch relations ===
      const orderIds = flatOrders.map(o => o.id);
      const [pickupDropsRes, orderFilesRes, transfersRes, recoveryRes] = await Promise.all([
        supabase.from("pickup_drops").select("*").in("order_id", orderIds),
        supabase.from("order_files").select("id, file_category, file_name, file_path, order_id").in("order_id", orderIds),
        supabase.from("order_transfers").select("*").in("order_id", orderIds),
        supabase.from("recovery_history").select("*").in("order_id", orderIds),
      ]);

      // Build lookup maps
      const groupByOrderId = (rows: any[]) => {
        const map = new Map<string, any[]>();
        for (const r of rows) {
          const arr = map.get(r.order_id) || [];
          arr.push(r);
          map.set(r.order_id, arr);
        }
        return map;
      };

      const pickupDropsMap = groupByOrderId(pickupDropsRes.data || []);
      const orderFilesMap = groupByOrderId(orderFilesRes.data || []);
      const transfersMap = groupByOrderId(transfersRes.data || []);
      const recoveryMap = groupByOrderId(recoveryRes.data || []);

      // === STAGE 3: Batch fetch entities ===
      const truckIds = collectIds(flatOrders, "truck_id", "original_truck_id");
      const driverIds = collectIds(flatOrders, "driver1_id", "driver2_id", "original_driver1_id", "original_driver2_id");
      const brokerIds = collectIds(flatOrders, "broker_id");
      const companyIds = collectIds(flatOrders, "company_id", "booked_by_company_id");
      const trailerIds = collectIds(flatOrders, "trailer_id", "original_trailer_id");

      // Also collect entity IDs from transfers and recoveries
      for (const transfers of transfersMap.values()) {
        for (const t of transfers) {
          if (t.driver1_id) driverIds.push(t.driver1_id);
          if (t.driver2_id) driverIds.push(t.driver2_id);
          if (t.truck_id) truckIds.push(t.truck_id);
          if (t.trailer_id) trailerIds.push(t.trailer_id);
        }
      }
      for (const recs of recoveryMap.values()) {
        for (const r of recs) {
          if (r.recovery_driver1_id) driverIds.push(r.recovery_driver1_id);
          if (r.recovery_driver2_id) driverIds.push(r.recovery_driver2_id);
          if (r.recovery_truck_id) truckIds.push(r.recovery_truck_id);
          if (r.recovery_trailer_id) trailerIds.push(r.recovery_trailer_id);
        }
      }

      const [trucksMap, driversMap, brokersMap, companiesMap, trailersMap] = await Promise.all([
        batchFetchMap("trucks", [...new Set(truckIds)], "id, truck_number, company_id"),
        batchFetchMap("drivers", [...new Set(driverIds)], "id, name, company_id"),
        batchFetchMap("brokers", [...new Set(brokerIds)], "id, name, mc_number, address"),
        batchFetchMap("companies", [...new Set(companyIds)], "id, name"),
        batchFetchMap("trailers", [...new Set(trailerIds)], "id, trailer_number"),
      ]);

      // Fetch extra companies for truck/driver enrichment
      const extraCompanyIds = new Set<string>();
      for (const t of trucksMap.values()) { if (t.company_id && !companiesMap.has(t.company_id)) extraCompanyIds.add(t.company_id); }
      for (const d of driversMap.values()) { if (d.company_id && !companiesMap.has(d.company_id)) extraCompanyIds.add(d.company_id); }
      if (extraCompanyIds.size > 0) {
        const extra = await batchFetchMap("companies", Array.from(extraCompanyIds), "id, name");
        extra.forEach((v, k) => companiesMap.set(k, v));
      }

      // Enrich trucks and drivers with company
      for (const t of trucksMap.values()) { t.company = companiesMap.get(t.company_id) || null; }
      for (const d of driversMap.values()) { d.company = companiesMap.get(d.company_id) || null; }

      // Enrich transfers
      for (const transfers of transfersMap.values()) {
        for (const t of transfers) {
          t.driver1 = driversMap.get(t.driver1_id) || null;
          t.driver2 = driversMap.get(t.driver2_id) || null;
          t.truck = trucksMap.get(t.truck_id) || null;
          t.trailer = trailersMap.get(t.trailer_id) || null;
        }
      }

      // Enrich recovery_history
      for (const recs of recoveryMap.values()) {
        for (const r of recs) {
          r.recovery_driver1 = driversMap.get(r.recovery_driver1_id) || null;
          r.recovery_driver2 = driversMap.get(r.recovery_driver2_id) || null;
          r.recovery_truck = trucksMap.get(r.recovery_truck_id) || null;
          r.recovery_trailer = trailersMap.get(r.recovery_trailer_id) || null;
        }
      }

      // Assemble full orders
      const assembledOrders = flatOrders.map(order => ({
        ...order,
        pickup_drops: pickupDropsMap.get(order.id) || [],
        order_files: orderFilesMap.get(order.id) || [],
        order_transfers: transfersMap.get(order.id) || [],
        recovery_history: recoveryMap.get(order.id) || [],
        broker: brokersMap.get(order.broker_id) || null,
        company: companiesMap.get(order.company_id) || null,
        booked_by_company: companiesMap.get(order.booked_by_company_id) || null,
        truck: trucksMap.get(order.truck_id) || null,
        trailer: trailersMap.get(order.trailer_id) || null,
        driver1: driversMap.get(order.driver1_id) || null,
        driver2: driversMap.get(order.driver2_id) || null,
        original_driver1: driversMap.get(order.original_driver1_id) || null,
        original_driver2: driversMap.get(order.original_driver2_id) || null,
        original_truck: trucksMap.get(order.original_truck_id) || null,
        original_trailer: trailersMap.get(order.original_trailer_id) || null,
      }));

      console.log("[useOrdersSearch] Results count:", assembledOrders.length);

      const transformed = transformOrders(assembledOrders);
      queryClient.setQueryData(newQueryKey, transformed);
    } catch (err: any) {
      if (latestSearchKeyRef.current === searchKey) {
        console.error("[useOrdersSearch] Error:", err);
        
        // Track timed-out terms to prevent infinite retry loops
        if (err?.code === '57014' || err?.message?.includes('statement timeout')) {
          failedTermsRef.current.add(term);
          console.warn(`[useOrdersSearch] Term "${term}" timed out - blocking retries`);
        }
        
        setSearchError(err instanceof Error ? err : new Error("Search failed"));
        queryClient.setQueryData(newQueryKey, null);
      }
    } finally {
      if (latestSearchKeyRef.current === searchKey) {
        setIsSearching(false);
      }
    }
  }, [queryClient]); // Stable deps - no queryKey!

  const clearSearch = useCallback(() => {
    if (activeQueryKeyRef.current) {
      queryClient.removeQueries({ queryKey: activeQueryKeyRef.current });
      activeQueryKeyRef.current = null;
    }
    latestSearchKeyRef.current = "";
    activeSearchTermRef.current = null;
    setActiveSearchTerm(null);
    setActiveOptions(null);
    setIsSearching(false);
    setSearchError(null);
  }, [queryClient]); // Stable deps - no queryKey!

  // Use ref-based query key for reading results (avoids reactive dependency)
  const searchResults = activeQueryKeyRef.current 
    ? (queryClient.getQueryData<any[] | null>(activeQueryKeyRef.current) ?? null)
    : null;

  return {
    searchResults,
    isSearching,
    searchError,
    searchOrders,
    clearSearch,
  };
}
