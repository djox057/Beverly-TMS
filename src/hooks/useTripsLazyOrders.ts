import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { transformOrders } from "@/utils/ordersTransform";
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { useDebounce } from "@/hooks/useDebounce";

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
 */
export const useTripsLazyOrders = (searchState?: SearchState) => {
  const queryClient = useQueryClient();
  const [searchedOrders, setSearchedOrders] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const lastSearchKeyRef = useRef<string>("");
  
  // CRITICAL: Maintain last valid data to prevent flickering during transitions
  const lastValidDataRef = useRef<any[]>([]);

  // Check if global orders are already cached
  const globalOrdersCache = queryClient.getQueryData<any[]>(["orders"]);
  const hasGlobalOrders = !!globalOrdersCache && globalOrdersCache.length > 0;

  // Debounce search inputs to prevent rapid state changes
  const debouncedTruckDriverSearch = useDebounce(searchState?.truckDriverSearch?.trim() || "", 500);
  const debouncedLoadNumberSearch = useDebounce(searchState?.loadNumberSearch?.trim() || "", 500);

  // Memoized search function to prevent flickering
  const performSearch = useCallback(async (truckDriverSearch: string, loadNumberSearch: string) => {
    const searchKey = `${truckDriverSearch}|${loadNumberSearch}`;
    
    // Skip if same search or if we have global orders
    if (searchKey === lastSearchKeyRef.current || hasGlobalOrders) {
      return;
    }

    // If no search terms, clear results without flickering
    if (!truckDriverSearch && !loadNumberSearch) {
      lastSearchKeyRef.current = "";
      // Only clear if we actually have results to clear
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

      // Priority: truck/driver search first
      if (truckDriverSearch && truckDriverSearch.length >= 2) {
        results = await searchByTruckOrDriver(truckDriverSearch);
      }
      // Then load number search
      else if (loadNumberSearch && loadNumberSearch.length >= 2) {
        results = await searchByLoadNumber(loadNumberSearch);
      }

      // Only update if this is still the current search (stale response protection)
      if (lastSearchKeyRef.current === searchKey) {
        setSearchedOrders(results);
        if (results.length > 0) {
          lastValidDataRef.current = results;
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      // On error, keep showing last valid data
    } finally {
      // Only clear loading if this is still the current search
      if (lastSearchKeyRef.current === searchKey) {
        setIsSearching(false);
      }
    }
  }, [hasGlobalOrders, searchedOrders.length]);

  // Effect to trigger search when debounced values change
  useEffect(() => {
    if (hasGlobalOrders) {
      // Clear any lazy-loaded results when global orders are available
      if (searchedOrders.length > 0) {
        setSearchedOrders([]);
      }
      return;
    }

    performSearch(debouncedTruckDriverSearch, debouncedLoadNumberSearch);
  }, [debouncedTruckDriverSearch, debouncedLoadNumberSearch, hasGlobalOrders, performSearch]);

  // Determine which orders to return
  const rawOrders = hasGlobalOrders ? globalOrdersCache : searchedOrders;
  const isLoading = isSearching;
  const isLazyMode = !hasGlobalOrders;

  // CRITICAL: Use stable data pattern to prevent flickering
  // Only update lastValidDataRef when we have actual data
  const stableOrders = useMemo(() => {
    if (rawOrders && rawOrders.length > 0) {
      lastValidDataRef.current = rawOrders;
      return rawOrders;
    }
    // During loading transitions, keep showing the last valid data
    // But if we're not loading and search is cleared, return empty
    if (!isLoading && lastSearchKeyRef.current === "") {
      lastValidDataRef.current = [];
      return [];
    }
    return lastValidDataRef.current;
  }, [rawOrders, isLoading]);

  return {
    data: stableOrders,
    isLoading,
    isLazyMode,
    hasGlobalOrders,
  };
};

// Helper function to search by truck or driver - returns results directly
async function searchByTruckOrDriver(searchTerm: string): Promise<any[]> {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  const searchLower = searchTerm.toLowerCase().trim();

  // First, find matching trucks and drivers
  const [trucksResult, driversResult] = await Promise.all([
    supabase
      .from("trucks")
      .select("id, truck_number")
      .ilike("truck_number", `%${searchLower}%`)
      .limit(10),
    supabase
      .from("drivers")
      .select("id, name")
      .ilike("name", `%${searchLower}%`)
      .limit(10),
  ]);

  const truckIds = (trucksResult.data || []).map((t) => t.id);
  const driverIds = (driversResult.data || []).map((d) => d.id);

  if (truckIds.length === 0 && driverIds.length === 0) {
    return [];
  }

  // Build the filter conditions
  const conditions: string[] = [];
  if (truckIds.length > 0) {
    conditions.push(`truck_id.in.(${truckIds.join(",")})`);
  }
  if (driverIds.length > 0) {
    conditions.push(`driver1_id.in.(${driverIds.join(",")})`);
    conditions.push(`driver2_id.in.(${driverIds.join(",")})`);
  }
  const orFilter = conditions.join(",");

  // Fetch orders
  const { data: orders, error } = await supabase
    .from("orders")
    .select(getOrderSelectQuery())
    .or(orFilter)
    .order("delivery_datetime", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching orders by truck/driver:", error);
    return [];
  }

  return transformOrders(orders || []);
}

// Helper function to search by load number - returns results directly
async function searchByLoadNumber(loadNumber: string): Promise<any[]> {
  if (!loadNumber || loadNumber.length < 2) {
    return [];
  }

  const searchLower = loadNumber.toLowerCase().trim();
  const parsedNumber = parseInternalLoadNumber(searchLower);

  let query = supabase
    .from("orders")
    .select(getOrderSelectQuery())
    .limit(50);

  // Try both internal_load_number (exact) and broker_load_number (ilike)
  if (parsedNumber !== null) {
    query = query.or(
      `internal_load_number.eq.${parsedNumber},broker_load_number.ilike.%${searchLower}%`
    );
  } else {
    query = query.ilike("broker_load_number", `%${searchLower}%`);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("Error fetching order by load number:", error);
    return [];
  }

  return transformOrders(orders || []);
}

function getOrderSelectQuery() {
  return `
    *,
    pickup_drops (
      id, type, address, city, state, zip_code, datetime, end_datetime,
      sequence_number, arrived_at, checked_out_at, going_to_at,
      company_name, contact_name, contact_phone, special_instructions
    ),
    order_files (id, file_category, file_name, file_path),
    order_transfers (
      id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id,
      miles, driver_price, manual_driver_name, manual_truck_number,
      manual_trailer_number, transfer_date, transfer_city, transfer_state,
      transfer_address, transfer_datetime, transfer_latitude, transfer_longitude,
      driver1:drivers!order_transfers_driver1_id_fkey (id, name),
      driver2:drivers!order_transfers_driver2_id_fkey (id, name),
      truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
      trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)
    ),
    recovery_history (
      id, recovery_driver1_id, recovery_driver2_id, recovery_truck_id, recovery_trailer_id,
      recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name),
      recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name),
      recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number),
      recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)
    ),
    broker:brokers (id, name, mc_number, address),
    company:companies!orders_company_id_fkey (id, name),
    booked_by_company:companies!orders_booked_by_company_id_fkey (id, name),
    truck:trucks!orders_truck_id_fkey (id, truck_number, company:companies (id, name)),
    trailer:trailers!orders_trailer_id_fkey (id, trailer_number),
    driver1:drivers!orders_driver1_id_fkey (id, name, company_id, company:companies (id, name)),
    driver2:drivers!orders_driver2_id_fkey (id, name, company_id, company:companies (id, name)),
    original_driver1:drivers!orders_original_driver1_id_fkey (id, name),
    original_driver2:drivers!orders_original_driver2_id_fkey (id, name),
    original_truck:trucks!orders_original_truck_id_fkey (id, truck_number),
    original_trailer:trailers!orders_original_trailer_id_fkey (id, trailer_number)
  `;
}
