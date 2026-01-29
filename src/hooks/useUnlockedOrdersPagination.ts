import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";

const PAGE_SIZE = 100;

interface PaginationState {
  hasMore: boolean;
  isLoadingMore: boolean;
  totalUnlockedCount: number | null;
  loadedCount: number;
}

/**
 * Hook to handle cursor-based pagination for unlocked orders.
 * Supports both manual "Load More" and automatic background loading.
 * Uses isMountedRef to prevent "Should have a queue" React errors.
 */
export function useUnlockedOrdersPagination(options?: {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [paginationState, setPaginationState] = useState<PaginationState>({
    hasMore: true,
    isLoadingMore: false,
    totalUnlockedCount: null,
    loadedCount: 0,
  });
  
  // CRITICAL: Track mount state to prevent "Should have a queue" React error
  const isMountedRef = useRef(true);
  
  // Use ref to track loading state to prevent race conditions
  const isLoadingRef = useRef(false);
  // Track the last cursor to prevent duplicate loads
  const lastCursorRef = useRef<string | null>(null);
  
  // Setup mount/unmount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch total count of unlocked orders (for UI display)
  const fetchTotalCount = useCallback(async () => {
    try {
      let countQuery = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", false);

      // Apply dispatcher filtering if needed
      if (options?.dispatcherUserId) {
        let dispatcherDriverIds: string[] = [];
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);

        if (options?.bookedBy && dispatcherDriverIds.length > 0) {
          countQuery = countQuery.or(
            `booked_by.eq.${options.bookedBy},driver1_id.in.(${dispatcherDriverIds.join(',')})`
          );
        } else if (options?.bookedBy) {
          countQuery = countQuery.eq("booked_by", options.bookedBy);
        } else if (dispatcherDriverIds.length > 0) {
          countQuery = countQuery.in("driver1_id", dispatcherDriverIds);
        }
      } else if (options?.bookedBy) {
        countQuery = countQuery.eq("booked_by", options.bookedBy);
      }

      const { count } = await countQuery;
      
      // Guard against unmounted state updates
      if (isMountedRef.current) {
        setPaginationState(prev => ({
          ...prev,
          totalUnlockedCount: count,
          hasMore: prev.loadedCount < (count || 0),
        }));
      }
      
      return count;
    } catch (error) {
      console.error("[useUnlockedOrdersPagination] Count error:", error);
      return null;
    }
  }, [options?.bookedBy, options?.dispatcherUserId]);

  // Load more unlocked orders using cursor-based pagination
  const loadMoreUnlockedOrders = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent loads using ref
    if (isLoadingRef.current) {
      return paginationState.hasMore;
    }

    isLoadingRef.current = true;
    if (isMountedRef.current) {
      setPaginationState(prev => ({ ...prev, isLoadingMore: true }));
    }

    try {
      // Get current orders from cache
      const currentOrders = queryClient.getQueryData<any[]>([
        "orders",
        options?.bookedBy,
        options?.dispatcherUserId,
      ]) || [];

      // Find the last unlocked order to use as cursor
      const unlockedOrders = currentOrders.filter(o => !o.locked);
      const lastUnlocked = unlockedOrders[unlockedOrders.length - 1];
      
      if (!lastUnlocked) {
        if (isMountedRef.current) {
          setPaginationState(prev => ({ ...prev, isLoadingMore: false, hasMore: false }));
        }
        isLoadingRef.current = false;
        return false;
      }

      // Prevent duplicate loads with same cursor
      const cursor = lastUnlocked.createdAt || lastUnlocked.created_at;
      if (cursor === lastCursorRef.current) {
        console.log("[useUnlockedOrdersPagination] Skipping duplicate cursor:", cursor);
        if (isMountedRef.current) {
          setPaginationState(prev => ({ ...prev, isLoadingMore: false }));
        }
        isLoadingRef.current = false;
        return paginationState.hasMore;
      }
      lastCursorRef.current = cursor;

      // Get dispatcher driver IDs if needed
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Fetch next page of unlocked orders using cursor
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
        .eq("locked", false)
        .lt("created_at", cursor) // Cursor: older than last loaded
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

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
      } else if (options?.bookedBy) {
        query = query.eq("booked_by", options.bookedBy);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const newOrders = transformOrders(data || []);
      const hasMore = newOrders.length === PAGE_SIZE;

      // Merge new orders into cache (append to unlocked section)
      queryClient.setQueryData<any[]>(
        ["orders", options?.bookedBy, options?.dispatcherUserId],
        (old) => {
          if (!old) return newOrders;
          
          // Get existing IDs to avoid duplicates
          const existingIds = new Set(old.map(o => o.id));
          const uniqueNewOrders = newOrders.filter(o => !existingIds.has(o.id));
          
          // Separate locked and unlocked, append new unlocked orders
          const lockedOrders = old.filter(o => o.locked);
          const existingUnlocked = old.filter(o => !o.locked);
          
          return [...existingUnlocked, ...uniqueNewOrders, ...lockedOrders];
        }
      );

      // Get updated count after merge
      const updatedOrders = queryClient.getQueryData<any[]>([
        "orders",
        options?.bookedBy,
        options?.dispatcherUserId,
      ]) || [];
      const newLoadedCount = updatedOrders.filter(o => !o.locked).length;
      
      // Guard against unmounted state updates
      if (isMountedRef.current) {
        setPaginationState(prev => ({
          ...prev,
          isLoadingMore: false,
          hasMore,
          loadedCount: newLoadedCount,
        }));
      }

      console.log(`[useUnlockedOrdersPagination] Loaded ${newOrders.length} more (total: ${newLoadedCount})`);
      
      isLoadingRef.current = false;
      return hasMore;
    } catch (error) {
      console.error("[useUnlockedOrdersPagination] Error loading more:", error);
      if (isMountedRef.current) {
        setPaginationState(prev => ({ ...prev, isLoadingMore: false }));
      }
      isLoadingRef.current = false;
      return false;
    }
  }, [options?.bookedBy, options?.dispatcherUserId, queryClient, paginationState.hasMore]);

  // Update loaded count when initial data is available
  const setInitialLoadedCount = useCallback((count: number) => {
    setPaginationState(prev => ({
      ...prev,
      loadedCount: count,
      hasMore: prev.totalUnlockedCount !== null ? count < prev.totalUnlockedCount : count >= PAGE_SIZE,
    }));
  }, []);

  return {
    ...paginationState,
    loadMoreUnlockedOrders,
    fetchTotalCount,
    setInitialLoadedCount,
  };
}
