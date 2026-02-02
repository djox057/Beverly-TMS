import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

const PAGE_SIZE = 100;

interface ProgressiveLoadingProgress {
  phase: 1 | "complete";
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: 0;
  lockedTotal: null;
  isLoadingLocked: false;
  percentComplete: number;
}

interface UseOrdersProgressiveOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

/**
 * Progressive loading hook for /orders page with cursor-based pagination.
 * Loads 100 orders at a time, automatically loads more as user navigates pages.
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const queryClient = useQueryClient();

  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", bookedBy, dispatcherUserId] 
    : ["orders"];
  
  // Subscribe to real-time updates
  useOrdersRealtime();

  // Track total count and pagination state
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const lastCursorRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Get dispatcher driver IDs if needed
  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!dispatcherUserId) return [];
    
    const { data: assignedDrivers, error } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", dispatcherUserId);

    if (error) throw error;
    
    return (assignedDrivers || []).map(d => d.id);
  }, [dispatcherUserId]);

  // Fetch total count
  const fetchTotalCount = useCallback(async (dispatcherDriverIds: string[]) => {
    let countQuery = supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("locked", false);

    if (bookedBy && dispatcherDriverIds.length > 0) {
      countQuery = countQuery.or(
        `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
      );
    } else if (bookedBy) {
      countQuery = countQuery.eq("booked_by", bookedBy);
    } else if (dispatcherDriverIds.length > 0) {
      countQuery = countQuery.in("driver1_id", dispatcherDriverIds);
    }

    const { count, error } = await countQuery;
    if (error) throw error;
    return count;
  }, [bookedBy]);

  // Initial query - loads first batch
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log("[useOrdersProgressive] Initial load starting...");
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // Fetch total count first
      const count = await fetchTotalCount(dispatcherDriverIds);
      if (isMountedRef.current) {
        setTotalCount(count);
        setHasMore((count ?? 0) > PAGE_SIZE);
      }

      // Build query for first page
      let ordersQuery = supabase
        .from("orders")
        .select(`
          *,
          pickup_drops (id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, company_name, contact_name, contact_phone, special_instructions),
          order_files (id, file_category, file_name, file_path),
          order_transfers (id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, manual_driver_name, manual_truck_number, manual_trailer_number, transfer_date, transfer_city, transfer_state, transfer_address, transfer_datetime, transfer_latitude, transfer_longitude, driver1:drivers!order_transfers_driver1_id_fkey (id, name), driver2:drivers!order_transfers_driver2_id_fkey (id, name), truck:trucks!order_transfers_truck_id_fkey (id, truck_number), trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)),
          recovery_history (id, recovery_driver1_id, recovery_driver2_id, recovery_truck_id, recovery_trailer_id, recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name), recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name), recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number), recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)),
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
        .eq("locked", false)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      // Apply dispatcher filtering
      if (bookedBy && dispatcherDriverIds.length > 0) {
        ordersQuery = ordersQuery.or(
          `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
        );
      } else if (bookedBy) {
        ordersQuery = ordersQuery.eq("booked_by", bookedBy);
      } else if (dispatcherDriverIds.length > 0) {
        ordersQuery = ordersQuery.in("driver1_id", dispatcherDriverIds);
      }

      const { data, error } = await ordersQuery;
      if (error) throw error;

      const transformed = transformOrders(data || []);
      console.log(`[useOrdersProgressive] Initial load: ${transformed.length} orders (total: ${count})`);
      
      // Reset cursor for fresh load
      lastCursorRef.current = null;
      
      return transformed;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  // Load more orders (called when approaching end of loaded data)
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore || query.isLoading) return;
    
    const currentOrders = query.data || [];
    if (currentOrders.length === 0) return;

    const lastOrder = currentOrders[currentOrders.length - 1];
    const cursor = lastOrder.createdAt;
    
    // Prevent duplicate loads with same cursor
    if (cursor === lastCursorRef.current) {
      console.log("[useOrdersProgressive] Skipping duplicate cursor");
      return;
    }

    isLoadingMoreRef.current = true;
    if (isMountedRef.current) setIsLoadingMore(true);

    try {
      console.log(`[useOrdersProgressive] Loading more after cursor: ${cursor}`);
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      let moreQuery = supabase
        .from("orders")
        .select(`
          *,
          pickup_drops (id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, company_name, contact_name, contact_phone, special_instructions),
          order_files (id, file_category, file_name, file_path),
          order_transfers (id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, manual_driver_name, manual_truck_number, manual_trailer_number, transfer_date, transfer_city, transfer_state, transfer_address, transfer_datetime, transfer_latitude, transfer_longitude, driver1:drivers!order_transfers_driver1_id_fkey (id, name), driver2:drivers!order_transfers_driver2_id_fkey (id, name), truck:trucks!order_transfers_truck_id_fkey (id, truck_number), trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)),
          recovery_history (id, recovery_driver1_id, recovery_driver2_id, recovery_truck_id, recovery_trailer_id, recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name), recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name), recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number), recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)),
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
        .eq("locked", false)
        .lt("created_at", cursor)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      // Apply dispatcher filtering
      if (bookedBy && dispatcherDriverIds.length > 0) {
        moreQuery = moreQuery.or(
          `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
        );
      } else if (bookedBy) {
        moreQuery = moreQuery.eq("booked_by", bookedBy);
      } else if (dispatcherDriverIds.length > 0) {
        moreQuery = moreQuery.in("driver1_id", dispatcherDriverIds);
      }

      const { data, error } = await moreQuery;
      if (error) throw error;

      const newOrders = transformOrders(data || []);
      const stillHasMore = newOrders.length === PAGE_SIZE;
      
      lastCursorRef.current = cursor;

      // Merge into cache
      queryClient.setQueryData<any[]>(queryKey, (old) => {
        if (!old) return newOrders;
        const existingIds = new Set(old.map(o => o.id));
        const uniqueNew = newOrders.filter(o => !existingIds.has(o.id));
        return [...old, ...uniqueNew];
      });

      if (isMountedRef.current) {
        setHasMore(stillHasMore);
      }

      console.log(`[useOrdersProgressive] Loaded ${newOrders.length} more orders`);
    } catch (error) {
      console.error("[useOrdersProgressive] Error loading more:", error);
    } finally {
      isLoadingMoreRef.current = false;
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [hasMore, query.isLoading, query.data, queryKey, queryClient, bookedBy, fetchDispatcherDriverIds]);

  const progress = useMemo<ProgressiveLoadingProgress>(() => {
    const unlockedLoaded = query.data?.length ?? 0;
    
    return {
      phase: query.isLoading ? 1 : "complete",
      unlockedLoaded,
      unlockedTotal: totalCount,
      lockedLoaded: 0,
      lockedTotal: null,
      isLoadingLocked: false,
      percentComplete: query.isLoading ? 0 : 100,
    };
  }, [query.data, query.isLoading, totalCount]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isLoadingLocked: false,
    isLoadingMore,
    hasMore,
    loadMore,
    progress,
    unlockedCount: progress.unlockedLoaded,
    lockedCount: 0,
    lockedTotal: null,
    totalCount,
    isPartialData: query.isLoading || hasMore,
    requestLockedOrders: () => {},
    lockedOrdersLoaded: true,
  };
}
