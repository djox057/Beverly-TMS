import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useCallback, useEffect, useRef } from "react";
import { transformOrders } from "@/utils/ordersTransform";
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";

interface UseTripsLazyOrdersOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

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
export const useTripsLazyOrders = (
  options?: UseTripsLazyOrdersOptions,
  searchState?: SearchState
) => {
  const queryClient = useQueryClient();
  const [searchedOrders, setSearchedOrders] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Check if global orders are already cached
  const globalOrdersCache = queryClient.getQueryData<any[]>(["orders"]);
  const hasGlobalOrders = !!globalOrdersCache && globalOrdersCache.length > 0;

  // Get dispatcher driver IDs if filtering by dispatcher
  const { data: dispatcherDriverIds = [] } = useQuery({
    queryKey: ["dispatcher-driver-ids", options?.dispatcherUserId],
    queryFn: async () => {
      if (!options?.dispatcherUserId) return [];
      const { data: assignedDrivers } = await supabase
        .from("drivers")
        .select("id")
        .eq("dispatcher_id", options.dispatcherUserId);
      return (assignedDrivers || []).map((d) => d.id);
    },
    enabled: !!options?.dispatcherUserId,
    staleTime: 5 * 60 * 1000,
  });

  // Search function for truck#/driver name
  const searchByTruckOrDriver = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm || searchTerm.length < 2) {
        setSearchedOrders([]);
        return;
      }

      // Abort any previous search
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      searchAbortRef.current = new AbortController();

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

        // Fetch all orders for these trucks/drivers
        let allOrders: any[] = [];
        const batchSize = 1000;

        // Build the filter conditions
        const buildOrFilter = () => {
          const conditions: string[] = [];
          if (truckIds.length > 0) {
            conditions.push(`truck_id.in.(${truckIds.join(",")})`);
          }
          if (driverIds.length > 0) {
            conditions.push(`driver1_id.in.(${driverIds.join(",")})`);
            conditions.push(`driver2_id.in.(${driverIds.join(",")})`);
          }
          return conditions.join(",");
        };

        const orFilter = buildOrFilter();

        // Fetch orders in batches
        let offset = 0;
        while (true) {
          let query = supabase
            .from("orders")
            .select(
              `
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
            `
            )
            .or(orFilter)
            .order("delivery_datetime", { ascending: false, nullsFirst: false })
            .range(offset, offset + batchSize - 1);

          // Apply dispatcher filtering if needed
          if (options?.dispatcherUserId && dispatcherDriverIds.length > 0) {
            query = query.or(
              `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
            );
          }

          const { data: batch, error } = await query;

          if (error) {
            console.error("Error fetching orders by truck/driver:", error);
            break;
          }

          if (!batch || batch.length === 0) break;

          allOrders = [...allOrders, ...batch];

          if (batch.length < batchSize) break;
          offset += batchSize;
        }

        // Transform orders
        const transformed = transformOrders(allOrders);
        setSearchedOrders(transformed);
      } catch (error) {
        console.error("Search error:", error);
        setSearchedOrders([]);
      } finally {
        setIsSearching(false);
      }
    },
    [options?.bookedBy, options?.dispatcherUserId, dispatcherDriverIds]
  );

  // Search function for load number (internal or broker)
  const searchByLoadNumber = useCallback(
    async (loadNumber: string) => {
      if (!loadNumber || loadNumber.length < 2) {
        return null;
      }

      setIsSearching(true);

      try {
        const searchLower = loadNumber.toLowerCase().trim();
        const parsedNumber = parseInternalLoadNumber(searchLower);

        // Build query for internal or broker load number
        let query = supabase
          .from("orders")
          .select(
            `
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
          `
          )
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
          return null;
        }

        return orders ? transformOrders(orders) : null;
      } catch (error) {
        console.error("Load number search error:", error);
        return null;
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Effect to handle search changes
  useEffect(() => {
    const truckDriverSearch = searchState?.truckDriverSearch?.trim() || "";
    const loadNumberSearch = searchState?.loadNumberSearch?.trim() || "";

    // If we have global orders, don't do lazy loading
    if (hasGlobalOrders) {
      setSearchedOrders([]);
      return;
    }

    // If no search, clear results
    if (!truckDriverSearch && !loadNumberSearch) {
      setSearchedOrders([]);
      return;
    }

    // Priority: truck/driver search first
    if (truckDriverSearch && truckDriverSearch.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchByTruckOrDriver(truckDriverSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    }

    // Then load number search
    if (loadNumberSearch && loadNumberSearch.length >= 2) {
      const timeoutId = setTimeout(async () => {
        const results = await searchByLoadNumber(loadNumberSearch);
        if (results) {
          setSearchedOrders(results);
        }
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [
    searchState?.truckDriverSearch,
    searchState?.loadNumberSearch,
    hasGlobalOrders,
    searchByTruckOrDriver,
    searchByLoadNumber,
  ]);

  // Determine which orders to return
  const orders = hasGlobalOrders ? globalOrdersCache : searchedOrders;
  const isLoading = isSearching;
  const isLazyMode = !hasGlobalOrders;

  return {
    data: orders,
    isLoading,
    isLazyMode,
    hasGlobalOrders,
  };
};
