import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";
import { transformOrders } from "@/utils/ordersTransform";
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";

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
 */
export const useTripsLazyOrders = (searchState?: SearchState) => {
  const queryClient = useQueryClient();
  const [searchedOrders, setSearchedOrders] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingSearch, setPendingSearch] = useState(false);
  const lastSearchRef = useRef<string>("");
  const lastCompletedSearchRef = useRef<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if global orders are already cached
  const globalOrdersCache = queryClient.getQueryData<any[]>(["orders"]);
  const hasGlobalOrders = !!globalOrdersCache && globalOrdersCache.length > 0;

  // Effect to handle search changes - simplified to avoid re-render loops
  useEffect(() => {
    // If we have global orders, don't do lazy loading
    if (hasGlobalOrders) {
      if (searchedOrders.length > 0) {
        setSearchedOrders([]);
      }
      setPendingSearch(false);
      return;
    }

    const truckDriverSearch = searchState?.truckDriverSearch?.trim() || "";
    const loadNumberSearch = searchState?.loadNumberSearch?.trim() || "";

    // Build a search key to track what we're searching for
    const searchKey = `${truckDriverSearch}|${loadNumberSearch}`;

    // If no search, clear results
    if (!truckDriverSearch && !loadNumberSearch) {
      if (searchedOrders.length > 0) {
        setSearchedOrders([]);
      }
      lastSearchRef.current = "";
      lastCompletedSearchRef.current = "";
      setPendingSearch(false);
      return;
    }

    // Skip if same search as already completed
    if (searchKey === lastCompletedSearchRef.current) {
      setPendingSearch(false);
      return;
    }

    // Mark as pending search - this will hide old results immediately
    if (searchKey !== lastSearchRef.current) {
      setPendingSearch(true);
      lastSearchRef.current = searchKey;
    }

    // Clear any pending timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce the search with 500ms delay
    searchTimeoutRef.current = setTimeout(async () => {
      // Priority: truck/driver search first
      if (truckDriverSearch && truckDriverSearch.length >= 2) {
        await searchByTruckOrDriver(truckDriverSearch, setSearchedOrders, setIsSearching);
        lastCompletedSearchRef.current = searchKey;
        setPendingSearch(false);
        return;
      }

      // Then load number search
      if (loadNumberSearch && loadNumberSearch.length >= 2) {
        await searchByLoadNumber(loadNumberSearch, setSearchedOrders, setIsSearching);
        lastCompletedSearchRef.current = searchKey;
        setPendingSearch(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchState?.truckDriverSearch, searchState?.loadNumberSearch, hasGlobalOrders]);

  // Determine which orders to return
  // If there's a pending search, return empty array to avoid flashing old results
  const orders = hasGlobalOrders 
    ? globalOrdersCache 
    : (pendingSearch ? [] : searchedOrders);
  const isLoading = isSearching || pendingSearch;
  const isLazyMode = !hasGlobalOrders;

  return {
    data: orders,
    isLoading,
    isLazyMode,
    hasGlobalOrders,
  };
};

// Moved outside component to avoid re-creation
async function searchByTruckOrDriver(
  searchTerm: string,
  setSearchedOrders: React.Dispatch<React.SetStateAction<any[]>>,
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>
) {
  if (!searchTerm || searchTerm.length < 2) {
    setSearchedOrders([]);
    return;
  }

  setIsSearching(true);

  try {
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
      setSearchedOrders([]);
      setIsSearching(false);
      return;
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
      setSearchedOrders([]);
    } else {
      setSearchedOrders(transformOrders(orders || []));
    }
  } catch (error) {
    console.error("Search error:", error);
    setSearchedOrders([]);
  } finally {
    setIsSearching(false);
  }
}

async function searchByLoadNumber(
  loadNumber: string,
  setSearchedOrders: React.Dispatch<React.SetStateAction<any[]>>,
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>
) {
  if (!loadNumber || loadNumber.length < 2) {
    return;
  }

  setIsSearching(true);

  try {
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
      setSearchedOrders([]);
    } else {
      setSearchedOrders(transformOrders(orders || []));
    }
  } catch (error) {
    console.error("Load number search error:", error);
    setSearchedOrders([]);
  } finally {
    setIsSearching(false);
  }
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
