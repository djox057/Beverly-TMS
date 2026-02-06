import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { enrichOrdersWithRelations } from "@/utils/ordersFlatBatchFetch";

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
        .select("id", { count: "exact", head: true })
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
      // Flat query - no joins to eliminate RLS amplification
      let query = supabase
        .from("orders")
        .select("*")
        .eq("locked", false)
        .lt("created_at", cursor)
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

      // Batch-fetch all relations (flat+batch pattern)
      const enrichedData = await enrichOrdersWithRelations(data || []);
      const newOrders = transformOrders(enrichedData);
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
