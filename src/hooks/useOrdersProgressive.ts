import { useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface ProgressiveLoadingProgress {
  // Phase 2 removed: we only load active orders here.
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
 *
 * NOTE: Phase 2 (archived/locked progressive loading) has been removed.
 * This hook now loads active (unlocked) orders in a single query and keeps
 * them in the React Query cache so realtime updates can patch them.
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;

  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", bookedBy, dispatcherUserId] 
    : ["orders"];
  
  // Subscribe to real-time updates - this updates the cache automatically
  useOrdersRealtime();

  const unlockedTotalRef = useRef<number | null>(null);

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

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
          },
        }
      );

      if (edgeError) throw edgeError;

      const rawOrders = edgeData?.orders ?? [];
      unlockedTotalRef.current = edgeData?.count ?? rawOrders.length;

      return transformOrders(rawOrders);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  const progress = useMemo<ProgressiveLoadingProgress>(() => {
    const unlockedLoaded = query.data?.length ?? 0;
    const unlockedTotal =
      unlockedTotalRef.current ?? (query.isLoading ? null : unlockedLoaded);

    return {
      phase: query.isLoading ? 1 : "complete",
      unlockedLoaded,
      unlockedTotal,
      lockedLoaded: 0,
      lockedTotal: null,
      isLoadingLocked: false,
      percentComplete: query.isLoading ? 0 : 100,
    };
  }, [query.data, query.isLoading]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isLoadingLocked: false,
    progress,
    unlockedCount: progress.unlockedLoaded,
    lockedCount: 0,
    lockedTotal: null,
    totalCount: query.data?.length ?? 0,
    isPartialData: query.isLoading,
    requestLockedOrders: () => {},
    lockedOrdersLoaded: true,
  };
}
