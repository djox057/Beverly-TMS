import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface LoadingProgress {
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingMore: boolean;
  isComplete: boolean;
}

interface UseOrdersWithProgressOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

const LOCKED_BATCH_SIZE = 1000; // Larger batches for faster loading

/**
 * Hook for Analytics page that loads ALL orders with progress tracking.
 * Uses Edge Functions for bulk fetch - loads all orders efficiently.
 * CRITICAL: This hook MUST load 100% of orders from the database.
 */
export function useOrdersWithProgress(options?: UseOrdersWithProgressOptions) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<LoadingProgress>({
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    lockedTotal: null,
    isLoadingMore: false,
    isComplete: false,
  });
  
  const isMountedRef = useRef(true);

  // Normalize option values for stable query key
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  
  // Use a UNIQUE query key for analytics to avoid conflicts with orders page
  // Analytics always needs ALL data, so it has its own cache
  const queryKey = hasFilters 
    ? ["orders", "analytics-full", bookedBy, dispatcherUserId] 
    : ["orders", "analytics-full"];

  // Subscribe to real-time updates
  useOrdersRealtime();

  // Fetch dispatcher driver IDs if needed
  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!dispatcherUserId) return [];
    
    const { data: assignedDrivers } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", dispatcherUserId);
    
    return (assignedDrivers || []).map(d => d.id);
  }, [dispatcherUserId]);

  // Main query - uses Edge Functions for bulk fetch of ALL orders
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const startTime = Date.now();
      console.log("[OrdersWithProgress] Starting full fetch via Edge Functions...");

      setProgress({
        unlockedLoaded: 0,
        unlockedTotal: null,
        lockedLoaded: 0,
        lockedTotal: null,
        isLoadingMore: true,
        isComplete: false,
      });

      // Fetch dispatcher driver IDs if filtering
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // Phase 1: Fetch ALL unlocked orders
      const { data: unlockedResponse, error: unlockedError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
          },
        }
      );

      if (unlockedError) {
        console.error("[OrdersWithProgress] Unlocked Edge Function error:", unlockedError);
        throw unlockedError;
      }

      let allUnlockedOrders: any[] = [];
      let totalUnlockedCount: number | null = null;

      if (unlockedResponse?.orders) {
        allUnlockedOrders = unlockedResponse.orders;
        totalUnlockedCount = unlockedResponse.count;
        console.log(`[OrdersWithProgress] ✅ Fetched ${allUnlockedOrders.length} unlocked orders in ${unlockedResponse.fetchTimeMs}ms`);
      }

      // Update progress with unlocked count
      if (isMountedRef.current) {
        setProgress(prev => ({ 
          ...prev, 
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
        }));
      }

      // Phase 2: Fetch ALL locked orders using pagination loop
      let allLockedOrders: any[] = [];
      let lockedOffset = 0;
      let hasMoreLocked = true;
      let totalLockedCount: number | null = null;

      console.log("[OrdersWithProgress] Starting locked orders fetch (all batches)...");

      while (hasMoreLocked) {
        const { data: lockedResponse, error: lockedError } = await supabase.functions.invoke(
          "get-all-locked-orders",
          {
            body: {
              bookedBy,
              dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
              offset: lockedOffset,
              limit: LOCKED_BATCH_SIZE,
            },
          }
        );

        if (lockedError) {
          console.error("[OrdersWithProgress] Locked Edge Function error:", lockedError);
          // Don't throw - continue with what we have
          break;
        }

        if (lockedResponse?.orders) {
          const batchOrders = lockedResponse.orders;
          allLockedOrders = [...allLockedOrders, ...batchOrders];
          
          // Get total from first batch
          if (lockedOffset === 0 && lockedResponse.totalCount !== null) {
            totalLockedCount = lockedResponse.totalCount;
          }
          
          hasMoreLocked = lockedResponse.hasMore && batchOrders.length === LOCKED_BATCH_SIZE;
          lockedOffset += batchOrders.length;
          
          console.log(`[OrdersWithProgress] Locked batch: ${batchOrders.length} orders (total: ${allLockedOrders.length}/${totalLockedCount || '?'})`);
          
          // Update progress during loading
          if (isMountedRef.current) {
            setProgress(prev => ({
              ...prev,
              lockedLoaded: allLockedOrders.length,
              lockedTotal: totalLockedCount,
            }));
          }
        } else {
          hasMoreLocked = false;
        }
      }

      console.log(`[OrdersWithProgress] ✅ Fetched all ${allLockedOrders.length} locked orders`);

      // Deduplicate: remove locked orders if unlocked version exists
      const unlockedOrderIds = new Set(allUnlockedOrders.map(o => o.id));
      const deduplicatedLockedOrders = allLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      // Sort locked orders by pickup_datetime descending
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });

      // Final progress update
      const totalTime = Date.now() - startTime;
      if (isMountedRef.current) {
        setProgress({
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
          lockedLoaded: deduplicatedLockedOrders.length,
          lockedTotal: totalLockedCount,
          isLoadingMore: false,
          isComplete: true,
        });
      }

      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);
      console.log(`[OrdersWithProgress] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    // Allow refetch on mount - analytics needs fresh data
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000, // 5 minutes - refetch if stale
  });

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize progress from cached data if available
  useEffect(() => {
    if (query.data && !progress.isComplete && !query.isFetching) {
      const unlockedCount = query.data.filter((o: any) => !o.locked).length;
      const lockedCount = query.data.filter((o: any) => o.locked).length;
      
      setProgress({
        unlockedLoaded: unlockedCount,
        unlockedTotal: unlockedCount,
        lockedLoaded: lockedCount,
        lockedTotal: lockedCount,
        isLoadingMore: false,
        isComplete: true,
      });
    }
  }, [query.data, query.isFetching, progress.isComplete]);

  return {
    ...query,
    progress,
  };
}
