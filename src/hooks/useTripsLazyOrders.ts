import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { useDebounce } from "@/hooks/useDebounce";
import { enrichOrdersWithRelations } from "@/utils/ordersFlatBatchFetch";

interface SearchState {
  truckDriverSearch: string;
  loadNumberSearch: string;
}

/**
 * Hook for lazy-loading orders in Trips page.
 * - If global orders are already loaded, returns them filtered
 * - If not loaded and no search, returns empty
 * - When searching by truck#/driver name, fetches all their orders
 * - When searching by load#, fetches that specific order
 *
 * Uses lastValidDataRef pattern to prevent flickering during data transitions.
 * Phase 3E: All queries use flat+batch pattern to eliminate RLS amplification.
 */
export const useTripsLazyOrders = (searchState?: SearchState) => {
  const queryClient = useQueryClient();
  const [searchedOrders, setSearchedOrders] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const lastSearchKeyRef = useRef<string>("");
  // Counter to force re-reads of the query cache after optimistic updates
  const [cacheVersion, setCacheVersion] = useState(0);

  // CRITICAL: Maintain last valid data to prevent flickering during transitions
  const lastValidDataRef = useRef<any[]>([]);

  // Check if global orders are already cached (cacheVersion dependency forces re-read)
  const globalOrdersCache = cacheVersion >= 0 ? queryClient.getQueryData<any[]>(["orders"]) : null;
  const hasGlobalOrders = !!globalOrdersCache && globalOrdersCache.length > 0;

  // Debounce search inputs to prevent rapid state changes
  const debouncedTruckDriverSearch = useDebounce(searchState?.truckDriverSearch?.trim() || "", 500);
  const debouncedLoadNumberSearch = useDebounce(searchState?.loadNumberSearch?.trim() || "", 500);

  // Memoized search function to prevent flickering
  const performSearch = useCallback(
    async (truckDriverSearch: string, loadNumberSearch: string) => {
      const searchKey = `${truckDriverSearch}|${loadNumberSearch}`;

      // Skip if same search or if we have global orders
      if (searchKey === lastSearchKeyRef.current || hasGlobalOrders) {
        return;
      }

      // If no search terms, clear results without flickering
      if (!truckDriverSearch && !loadNumberSearch) {
        lastSearchKeyRef.current = "";
        if (searchedOrders.length > 0) {
          setSearchedOrders([]);
          lastValidDataRef.current = [];
        }
        return;
      }

      lastSearchKeyRef.current = searchKey;
      setIsSearching(true);

      try {
        let results: any[] = [];

        if (truckDriverSearch && truckDriverSearch.length >= 2) {
          results = await searchByTruckOrDriver(truckDriverSearch);
        } else if (loadNumberSearch && loadNumberSearch.length >= 2) {
          results = await searchByLoadNumber(loadNumberSearch);
        }

        if (lastSearchKeyRef.current === searchKey) {
          setSearchedOrders(results);
          if (results.length > 0) {
            lastValidDataRef.current = results;
          }
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        if (lastSearchKeyRef.current === searchKey) {
          setIsSearching(false);
        }
      }
    },
    [hasGlobalOrders, searchedOrders.length]
  );

  useEffect(() => {
    if (hasGlobalOrders) {
      if (searchedOrders.length > 0) {
        setSearchedOrders([]);
      }
      return;
    }
    performSearch(debouncedTruckDriverSearch, debouncedLoadNumberSearch);
  }, [debouncedTruckDriverSearch, debouncedLoadNumberSearch, hasGlobalOrders, performSearch]);

  const rawOrders = hasGlobalOrders ? globalOrdersCache : searchedOrders;
  const isLoading = isSearching;
  const isLazyMode = !hasGlobalOrders;

  const stableOrders = useMemo(() => {
    if (rawOrders && rawOrders.length > 0) {
      lastValidDataRef.current = rawOrders;
      return rawOrders;
    }
    if (!isLoading && lastSearchKeyRef.current === "") {
      lastValidDataRef.current = [];
      return [];
    }
    return lastValidDataRef.current;
  }, [rawOrders, isLoading]);

  // Allow callers to optimistically update a single order in the local dataset
  const updateOrderLocally = useCallback((orderId: string, patch: Record<string, any>) => {
    if (hasGlobalOrders) {
      // Bump cache version to force re-read of patched query cache
      setCacheVersion(v => v + 1);
    } else {
      // Lazy mode: update local searchedOrders state directly
      setSearchedOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...patch } : o));
    }
  }, [hasGlobalOrders]);

  return {
    data: stableOrders,
    isLoading,
    isLazyMode,
    hasGlobalOrders,
    updateOrderLocally,
  };
};

// Search by truck or driver - flat+batch pattern
async function searchByTruckOrDriver(searchTerm: string): Promise<any[]> {
  if (!searchTerm || searchTerm.length < 2) return [];

  const searchLower = searchTerm.toLowerCase().trim();

  const [trucksResult, driversResult] = await Promise.all([
    supabase.from("trucks").select("id, truck_number").ilike("truck_number", `%${searchLower}%`).limit(10),
    supabase.from("drivers").select("id, name").ilike("name", `%${searchLower}%`).limit(10),
  ]);

  const truckIds = (trucksResult.data || []).map((t) => t.id);
  const driverIds = (driversResult.data || []).map((d) => d.id);

  if (truckIds.length === 0 && driverIds.length === 0) return [];

  const conditions: string[] = [];
  if (truckIds.length > 0) {
    conditions.push(`truck_id.in.(${truckIds.join(",")})`);
    conditions.push(`original_truck_id.in.(${truckIds.join(",")})`);
  }
  if (driverIds.length > 0) {
    conditions.push(`driver1_id.in.(${driverIds.join(",")})`);
    conditions.push(`driver2_id.in.(${driverIds.join(",")})`);
    conditions.push(`original_driver1_id.in.(${driverIds.join(",")})`);
    conditions.push(`original_driver2_id.in.(${driverIds.join(",")})`);
  }

  // Also check order_transfers for matching truck/driver
  const transferConditions: string[] = [];
  if (truckIds.length > 0) transferConditions.push(`truck_id.in.(${truckIds.join(",")})`);
  if (driverIds.length > 0) {
    transferConditions.push(`driver1_id.in.(${driverIds.join(",")})`);
    transferConditions.push(`driver2_id.in.(${driverIds.join(",")})`);
  }

  const [mainResult, transferResult] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .or(conditions.join(","))
      .order("delivery_datetime", { ascending: false, nullsFirst: false })
      .limit(1000),
    transferConditions.length > 0
      ? supabase
          .from("order_transfers")
          .select("order_id")
          .or(transferConditions.join(","))
          .limit(500)
      : Promise.resolve({ data: [] as { order_id: string }[], error: null }),
  ]);

  const { data: orders, error } = mainResult;

  // Fetch any additional orders found via transfers
  const transferOrderIds = (transferResult.data || []).map((t) => t.order_id);
  const existingOrderIds = new Set((orders || []).map((o) => o.id));
  const missingTransferIds = transferOrderIds.filter((id) => !existingOrderIds.has(id));

  let allOrders = orders || [];
  if (missingTransferIds.length > 0) {
    const { data: extraOrders } = await supabase
      .from("orders")
      .select("*")
      .in("id", missingTransferIds);
    if (extraOrders) allOrders = [...allOrders, ...extraOrders];
  }

  if (error) {
    console.error("Error fetching orders by truck/driver:", error);
    return [];
  }

  // Batch-fetch all relations
  const enriched = await enrichOrdersWithRelations(allOrders);
  return transformOrders(enriched);
}

// Search by load number - flat+batch pattern (matches searchByTruckOrDriver)
async function searchByLoadNumber(loadNumber: string): Promise<any[]> {
  if (!loadNumber || loadNumber.length < 2) return [];

  const searchLower = loadNumber.toLowerCase().trim();
  const parsedNumber = parseInternalLoadNumber(searchLower);

  const [internalResult, brokerResult] = await Promise.all([
    parsedNumber !== null
      ? supabase.from("orders").select("*").eq("internal_load_number", parsedNumber).limit(50)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("orders").select("*").ilike("broker_load_number", `${searchLower}%`).limit(50),
  ]);

  if (internalResult.error) console.error("Error fetching by internal load#:", internalResult.error);
  if (brokerResult.error) console.error("Error fetching by broker load#:", brokerResult.error);

  const allOrders = [...(internalResult.data || []), ...(brokerResult.data || [])];
  const seen = new Set<string>();
  const unique = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  if (unique.length === 0) return [];

  const enriched = await enrichOrdersWithRelations(unique);
  return transformOrders(enriched);
}
