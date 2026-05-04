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
  usePrecomputed: boolean;
}

interface UseOrdersWithProgressOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

const LOCKED_BATCH_SIZE = 1000;

/**
 * Hook for Analytics page that loads orders with progress tracking.
 * When precomputed mode is active (default), only fetches unlocked orders.
 * Locked order analytics come from precomputed aggregates instead.
 * Set localStorage.analytics_use_raw_orders = "true" to restore full fetch.
 */
export function useOrdersWithProgress(options?: UseOrdersWithProgressOptions) {
  const queryClient = useQueryClient();

  // Feature flag: skip locked orders when precomputed aggregates are available
  // Temporarily disabled — defaulting to raw order fetching (all orders loaded).
  // Set localStorage.analytics_use_precomputed = "true" to re-enable precomputed mode.
  const usePrecomputed = typeof window !== "undefined"
    && localStorage.getItem("analytics_use_precomputed") === "true";

  const [progress, setProgress] = useState<LoadingProgress>({
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    lockedTotal: null,
    isLoadingMore: false,
    isComplete: false,
    usePrecomputed,
  });
  
  const isMountedRef = useRef(true);

  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  
  const queryKey = hasFilters 
    ? ["orders", "analytics-full", bookedBy, dispatcherUserId] 
    : ["orders", "analytics-full"];

  useOrdersRealtime();

  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!dispatcherUserId) return [];
    const { data: assignedDrivers } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", dispatcherUserId);
    return (assignedDrivers || []).map(d => d.id);
  }, [dispatcherUserId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const startTime = Date.now();
      console.log(`[OrdersWithProgress] Starting fetch (precomputed=${usePrecomputed})...`);

      setProgress({
        unlockedLoaded: 0,
        unlockedTotal: null,
        lockedLoaded: 0,
        lockedTotal: null,
        isLoadingMore: true,
        isComplete: false,
        usePrecomputed,
      });

      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // Phase 1: Fetch ALL unlocked orders (always)
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

      if (isMountedRef.current) {
        setProgress(prev => ({ 
          ...prev, 
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
        }));
      }

      // Phase 2: Fetch locked orders — SKIP when precomputed mode is active
      if (usePrecomputed) {
        console.log("[OrdersWithProgress] Precomputed mode: skipping locked order fetch");

        const totalTime = Date.now() - startTime;
        if (isMountedRef.current) {
          setProgress({
            unlockedLoaded: allUnlockedOrders.length,
            unlockedTotal: totalUnlockedCount,
            lockedLoaded: 0,
            lockedTotal: 0,
            isLoadingMore: false,
            isComplete: true,
            usePrecomputed: true,
          });
        }

        const mergedOrders = transformOrders(allUnlockedOrders);
        console.log(`[OrdersWithProgress] ✅ COMPLETE (precomputed): ${mergedOrders.length} unlocked orders in ${totalTime}ms`);

        queryClient.setQueryData(["orders"], mergedOrders);
        return mergedOrders;
      }

      // --- Fallback: full locked order fetch (analytics_use_raw_orders = "true") ---
      let allLockedOrders: any[] = [];
      let lockedOffset = 0;
      let hasMoreLocked = true;
      let totalLockedCount: number | null = null;

      console.log("[OrdersWithProgress] Starting locked orders fetch (all batches)...");

      let batchAttempts = 0;
      const MAX_BATCH_ATTEMPTS = 200;
      while (hasMoreLocked && batchAttempts < MAX_BATCH_ATTEMPTS) {
        batchAttempts++;
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
          break;
        }

        if (lockedResponse?.orders) {
          const batchOrders = lockedResponse.orders;
          allLockedOrders = [...allLockedOrders, ...batchOrders];
          
          if (lockedOffset === 0 && lockedResponse.totalCount !== null) {
            totalLockedCount = lockedResponse.totalCount;
          }
          
          hasMoreLocked = lockedResponse.hasMore && batchOrders.length === LOCKED_BATCH_SIZE;
          lockedOffset += batchOrders.length;
          
          console.log(`[OrdersWithProgress] Locked batch: ${batchOrders.length} orders (total: ${allLockedOrders.length}/${totalLockedCount || '?'})`);
          
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

      if (hasMoreLocked && batchAttempts >= MAX_BATCH_ATTEMPTS) {
        console.warn(`[OrdersWithProgress] ⚠️ Stopped fetching locked orders after ${MAX_BATCH_ATTEMPTS} batches (${allLockedOrders.length} loaded). Increase MAX_BATCH_ATTEMPTS if order count keeps growing.`);
      }
      console.log(`[OrdersWithProgress] ✅ Fetched all ${allLockedOrders.length} locked orders`);

      const unlockedOrderIds = new Set(allUnlockedOrders.map(o => o.id));
      const deduplicatedLockedOrders = allLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });

      const totalTime = Date.now() - startTime;
      if (isMountedRef.current) {
        setProgress({
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
          lockedLoaded: deduplicatedLockedOrders.length,
          lockedTotal: totalLockedCount,
          isLoadingMore: false,
          isComplete: true,
          usePrecomputed: false,
        });
      }

      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);
      console.log(`[OrdersWithProgress] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      queryClient.setQueryData(["orders"], mergedOrders);
      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

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
        usePrecomputed,
      });
    }
  }, [query.data, query.isFetching, progress.isComplete]);

  return {
    ...query,
    progress,
  };
}
