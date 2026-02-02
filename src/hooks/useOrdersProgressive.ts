import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface ProgressiveLoadingProgress {
  phase: 1 | 2 | "complete";
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingLocked: boolean;
  percentComplete: number;
}

interface UseOrdersProgressiveOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

/**
 * Progressive loading hook for /orders page
 * 
 * Phase 1: Load unlocked orders → Display immediately (1-2s)
 * Phase 2: Background load locked orders via edge function (3-5s)
 * 
 * Uses local state for progressive loading phases, but syncs to React Query cache
 * for real-time updates from useOrdersRealtime
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const loadingStartedRef = useRef(false);
  
  // Normalize option values so we can reliably detect changes
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const optionsKey = `${bookedBy ?? ""}|${dispatcherUserId ?? ""}`;
  
  // Determine query key based on filter options
  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", bookedBy, dispatcherUserId] 
    : ["orders"];
  
  // Subscribe to real-time updates - this updates the cache automatically
  useOrdersRealtime();
  
  // Progress tracking
  const [progress, setProgress] = useState<ProgressiveLoadingProgress>({
    phase: 1,
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    lockedTotal: null,
    isLoadingLocked: false,
    percentComplete: 0,
  });

  // Local state for progressive loading phases
  const [phase1Data, setPhase1Data] = useState<any[]>([]);
  const [phase2Data, setPhase2Data] = useState<any[]>([]);

  // Track cache version for real-time updates (lightweight - only increments on actual changes)
  const [cacheVersion, setCacheVersion] = useState(0);

  // Check if we have cached data on mount - use state to avoid ref timing issues
  const [initializedFromCache, setInitializedFromCache] = useState(false);
  const cachedDataOnMount = useRef<any[] | undefined>(queryClient.getQueryData<any[]>(queryKey));

  // When filters change (e.g., Individual Mode toggled), we must restart progressive loading.
  const lastOptionsKeyRef = useRef(optionsKey);
  useEffect(() => {
    if (lastOptionsKeyRef.current === optionsKey) return;

    console.log(`[Progressive] Options changed, restarting load (${lastOptionsKeyRef.current} → ${optionsKey})`);
    lastOptionsKeyRef.current = optionsKey;

    loadingStartedRef.current = false;
    cachedDataOnMount.current = queryClient.getQueryData<any[]>(queryKey);
    setInitializedFromCache(false);
    setCacheVersion(0);
    setPhase1Data([]);
    setPhase2Data([]);
    setProgress({
      phase: 1,
      unlockedLoaded: 0,
      unlockedTotal: null,
      lockedLoaded: 0,
      lockedTotal: null,
      isLoadingLocked: false,
      percentComplete: 0,
    });
  }, [optionsKey, queryClient, queryKey]);

  // Get dispatcher driver IDs if needed
  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!dispatcherUserId) return [];
    
    const { data: assignedDrivers } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", dispatcherUserId);
    
    return (assignedDrivers || []).map(d => d.id);
  }, [dispatcherUserId]);

  // Initialize from cache if available (runs once on mount)
  useEffect(() => {
    const cachedOrders = cachedDataOnMount.current;
    if (cachedOrders && cachedOrders.length > 0 && !initializedFromCache && !loadingStartedRef.current) {
      console.log(`[Progressive] Initializing from cache: ${cachedOrders.length} orders`);
      const unlockedOrders = cachedOrders.filter(o => !o.locked);
      const lockedOrders = cachedOrders.filter(o => o.locked);
      
      setPhase1Data(unlockedOrders);
      setPhase2Data(lockedOrders);
      setProgress({
        phase: "complete",
        unlockedLoaded: unlockedOrders.length,
        unlockedTotal: unlockedOrders.length,
        lockedLoaded: lockedOrders.length,
        lockedTotal: lockedOrders.length,
        isLoadingLocked: false,
        percentComplete: 100,
      });
      setInitializedFromCache(true);
      loadingStartedRef.current = true;
    }
  }, [initializedFromCache, queryKey]);

  // Subscribe to cache updates for real-time changes
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        isMountedRef.current &&
        event?.type === "updated" && 
        event?.query?.queryKey?.[0] === "orders" &&
        progress.phase === "complete"
      ) {
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
        }
        pendingUpdateRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setCacheVersion(v => v + 1);
          }
          pendingUpdateRef.current = null;
        }, 50);
      }
    });
    return () => {
      unsubscribe();
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [queryClient, progress.phase]);

  // PHASE 1 & 2: Progressive loading
  useEffect(() => {
    // Skip if already loading or initialized from cache
    if (loadingStartedRef.current || initializedFromCache) {
      console.log("[Progressive] Skipping fetch - already started or cached");
      return;
    }
    
    loadingStartedRef.current = true;
    let cancelled = false;
    
    const loadPhase1 = async () => {
      const startTime = Date.now();
      console.log("[Progressive] Phase 1: Starting unlocked orders fetch...");
      
      try {
        const dispatcherDriverIds = await fetchDispatcherDriverIds();
        
        // Use Edge Function for bulk fetch
        const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
          "get-all-unlocked-orders",
          {
            body: {
              bookedBy,
              dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            },
          }
        );

        if (cancelled) return;

        if (edgeFunctionError) {
          console.error("[Progressive] Phase 1 Edge Function error:", edgeFunctionError);
          throw edgeFunctionError;
        }

        if (edgeFunctionResponse?.orders) {
          const allUnlocked = edgeFunctionResponse.orders;
          const totalUnlocked = edgeFunctionResponse.count;
          
          console.log(`[Progressive] Phase 1: ✅ Fetched ${allUnlocked.length} unlocked orders in ${Date.now() - startTime}ms`);
          
          // Transform and set local state
          const transformedUnlocked = transformOrders(allUnlocked);
          
          if (!cancelled && isMountedRef.current) {
            setPhase1Data(transformedUnlocked);
            
            setProgress(prev => ({
              ...prev,
              phase: 2,
              unlockedLoaded: allUnlocked.length,
              unlockedTotal: totalUnlocked,
              percentComplete: 30,
            }));
            
            // Start Phase 2 immediately
            loadPhase2(transformedUnlocked, dispatcherDriverIds);
          }
        }
      } catch (error) {
        console.error("[Progressive] Phase 1 failed:", error);
        if (!cancelled) {
          setProgress(prev => ({ ...prev, phase: "complete" }));
        }
      }
    };
    
    const loadPhase2 = async (unlockedOrders: any[], dispatcherDriverIds: string[]) => {
      const startTime = Date.now();
      console.log("[Progressive] Phase 2: Starting locked orders fetch via edge function...");
      
      if (!isMountedRef.current) return;
      
      setProgress(prev => ({ ...prev, isLoadingLocked: true }));
      
      try {
        // Use Edge Function for bulk fetch - same pattern as unlocked orders
        const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
          "get-all-locked-orders",
          {
            body: {
              bookedBy,
              dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            },
          }
        );

        if (cancelled) return;

        if (edgeFunctionError) {
          console.error("[Progressive] Phase 2 Edge Function error:", edgeFunctionError);
          throw edgeFunctionError;
        }

        if (edgeFunctionResponse?.orders) {
          const allLocked = edgeFunctionResponse.orders;
          const totalLocked = edgeFunctionResponse.count;
          
          console.log(`[Progressive] Phase 2: ✅ Fetched ${allLocked.length} locked orders in ${Date.now() - startTime}ms`);
          
          // Deduplicate against unlocked orders
          const unlockedOrderIds = new Set(unlockedOrders.map(o => o.id));
          const deduplicatedLockedOrders = allLocked.filter(
            (order: any) => !unlockedOrderIds.has(order.id)
          );
          
          // Transform locked orders
          const transformedLocked = transformOrders(deduplicatedLockedOrders);
          
          if (isMountedRef.current) {
            setPhase2Data(transformedLocked);
            
            setProgress({
              phase: "complete",
              unlockedLoaded: unlockedOrders.length,
              unlockedTotal: unlockedOrders.length,
              lockedLoaded: transformedLocked.length,
              lockedTotal: totalLocked,
              isLoadingLocked: false,
              percentComplete: 100,
            });
            
            console.log(`[Progressive] Phase 2: ✅ Complete! ${transformedLocked.length} locked orders`);
          }
        }
      } catch (error) {
        console.error("[Progressive] Phase 2 failed:", error);
        if (isMountedRef.current) {
          setProgress(prev => ({ ...prev, phase: "complete", isLoadingLocked: false }));
        }
      }
    };
    
    loadPhase1();
    
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializedFromCache, optionsKey]);

  // Track mount state separately
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Merge data and sync to cache for real-time updates
  const mergedData = useMemo(() => {
    // If loading is complete, check cache for real-time updates
    if (progress.phase === "complete" && cacheVersion > 0) {
      const freshCachedOrders = queryClient.getQueryData<any[]>(queryKey);
      if (freshCachedOrders && freshCachedOrders.length > 0) {
        const orderMap = new Map<string, any>();
        freshCachedOrders.forEach(order => {
          orderMap.set(order.id, order);
        });
        const deduplicated = Array.from(orderMap.values());
        console.log(`[Progressive] Using cache (v${cacheVersion}): ${deduplicated.length} orders`);
        return deduplicated;
      }
    }
    
    // Merge phase1 and phase2 data with deduplication
    const allOrders = [...phase1Data, ...phase2Data];
    
    const orderMap = new Map<string, any>();
    allOrders.forEach(order => {
      // For duplicates, prefer unlocked version (more recent data)
      const existing = orderMap.get(order.id);
      if (!existing || (!order.locked && existing.locked)) {
        orderMap.set(order.id, order);
      }
    });
    
    const deduplicated = Array.from(orderMap.values());
    
    // Only sync to cache once loading is complete
    if (progress.phase === "complete" && deduplicated.length > 0) {
      queryClient.setQueryData(queryKey, deduplicated);
    }
    
    return deduplicated;
  }, [phase1Data, phase2Data, progress.phase, queryClient, queryKey, cacheVersion]);

  return {
    data: mergedData,
    isLoading: progress.phase === 1 && phase1Data.length === 0,
    isLoadingLocked: progress.isLoadingLocked,
    progress,
    unlockedCount: progress.unlockedLoaded,
    lockedCount: progress.lockedLoaded,
    totalCount: mergedData.length,
    isPartialData: progress.phase !== "complete",
  };
}
