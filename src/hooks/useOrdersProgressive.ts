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
 * Progressive loading hook for /orders page
 * Loads unlocked orders in batches of 100 using cursor-based pagination.
 * When user reaches page N, loads orders for page N+1 in background.
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const queryClient = useQueryClient();
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;

  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", bookedBy, dispatcherUserId] 
    : ["orders"];
  
  // Subscribe to real-time updates
  useOrdersRealtime();

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const lastCursorRef = useRef<string | null>(null);

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

  // Initial load - first batch of orders
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log("[OrdersProgressive] Loading initial batch...");
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // First get total count
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

      const { count } = await countQuery;
      setTotalCount(count);
      console.log(`[OrdersProgressive] Total unlocked orders: ${count}`);

      // Now fetch first batch
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            limit: PAGE_SIZE,
            offset: 0,
          },
        }
      );

      if (edgeError) throw edgeError;

      const rawOrders = edgeData?.orders ?? [];
      const hasMoreOrders = rawOrders.length === PAGE_SIZE && (count ?? 0) > PAGE_SIZE;
      setHasMore(hasMoreOrders);
      
      // Store cursor for next load
      if (rawOrders.length > 0) {
        lastCursorRef.current = rawOrders[rawOrders.length - 1].created_at;
      }

      console.log(`[OrdersProgressive] Loaded ${rawOrders.length} orders, hasMore: ${hasMoreOrders}`);
      return transformOrders(rawOrders);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  // Load more orders - called when approaching end of loaded data
  const loadMoreOrders = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const dispatcherDriverIds = await fetchDispatcherDriverIds();
      const currentOrders = queryClient.getQueryData<any[]>(queryKey) || [];
      const offset = currentOrders.length;

      console.log(`[OrdersProgressive] Loading more from offset ${offset}...`);

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            limit: PAGE_SIZE,
            offset,
          },
        }
      );

      if (edgeError) throw edgeError;

      const rawOrders = edgeData?.orders ?? [];
      const newOrders = transformOrders(rawOrders);
      
      // Check if we have more
      const loadedSoFar = offset + rawOrders.length;
      const hasMoreOrders = rawOrders.length === PAGE_SIZE && loadedSoFar < (totalCount ?? Infinity);
      setHasMore(hasMoreOrders);

      // Merge into cache
      queryClient.setQueryData<any[]>(queryKey, (old) => {
        if (!old) return newOrders;
        const existingIds = new Set(old.map(o => o.id));
        const uniqueNew = newOrders.filter(o => !existingIds.has(o.id));
        return [...old, ...uniqueNew];
      });

      console.log(`[OrdersProgressive] Loaded ${rawOrders.length} more orders, total: ${loadedSoFar}, hasMore: ${hasMoreOrders}`);
    } catch (error) {
      console.error("[OrdersProgressive] Error loading more:", error);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [bookedBy, dispatcherUserId, fetchDispatcherDriverIds, hasMore, queryClient, queryKey, totalCount]);

  const loadedCount = query.data?.length ?? 0;

  const progress = useMemo<ProgressiveLoadingProgress>(() => {
    return {
      phase: query.isLoading ? 1 : "complete",
      unlockedLoaded: loadedCount,
      unlockedTotal: totalCount,
      lockedLoaded: 0,
      lockedTotal: null,
      isLoadingLocked: false,
      percentComplete: totalCount ? Math.round((loadedCount / totalCount) * 100) : (query.isLoading ? 0 : 100),
    };
  }, [loadedCount, totalCount, query.isLoading]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isLoadingMore,
    isLoadingLocked: false,
    progress,
    unlockedCount: loadedCount,
    lockedCount: 0,
    lockedTotal: null,
    totalCount: totalCount ?? loadedCount,
    totalLoaded: loadedCount,
    hasMore,
    loadMoreOrders,
    isPartialData: query.isLoading || hasMore,
    requestLockedOrders: () => {},
    lockedOrdersLoaded: true,
  };
}
