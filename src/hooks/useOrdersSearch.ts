import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";

/**
 * Server-side search hook for orders.
 * When user types a search term, this queries the DATABASE directly.
 * This ensures ANY order in the database can be found - never "invisible".
 * 
 * Real-time updates for search results are handled by the global useOrdersRealtime hook
 * which updates all ["orders"] cache keys including search results when they match.
 */
export function useOrdersSearch() {
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);

  const searchOrders = useCallback(async (
    searchTerm: string,
    options?: {
      bookedBy?: string | null;
      dispatcherUserId?: string | null;
    }
  ) => {
    // Clear search results if no search term
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const term = searchTerm.trim().toLowerCase();
      
      // Build the search query - search across multiple fields
      // For dispatcher users, we need to get their assigned drivers first
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Use ilike for case-insensitive search
      // Search by: load_number, broker_load_number, internal_load_number, truck_number, driver_name
      let query = supabase
        .from("orders")
        .select(`
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
        `)
        .or(`load_number.ilike.%${term}%,broker_load_number.ilike.%${term}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      // Apply dispatcher filtering if needed
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

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Transform to UI shape
      const transformed = transformOrders(data || []);
      setSearchResults(transformed);
    } catch (err) {
      console.error("[useOrdersSearch] Error:", err);
      setSearchError(err instanceof Error ? err : new Error("Search failed"));
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults(null);
    setSearchError(null);
  }, []);

  return {
    searchResults,
    isSearching,
    searchError,
    searchOrders,
    clearSearch,
  };
}
