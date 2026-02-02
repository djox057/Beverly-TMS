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

const LOCKED_BATCH_SIZE = 100;

/**
 * Progressive loading hook for /orders page
 * 
 * Phase 1: Load ALL unlocked orders → Display immediately
 * Phase 2: Load locked orders in batches ON-DEMAND when:
 *   - User paginates past unlocked data
 *   - Batches of 100 are loaded incrementally
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
  
  // Track locked orders loading state
  const lockedLoadingRef = useRef(false);
  const lockedOffsetRef = useRef(0);
  const lockedTotalRef = useRef<number | null>(null);
  const allLockedLoadedRef = useRef(false);

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
    lockedLoadingRef.current = false;
    lockedOffsetRef.current = 0;
    lockedTotalRef.current = null;
    allLockedLoadedRef.current = false;
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
      
      // If cache has locked orders, update our tracking
      if (lockedOrders.length > 0) {
        lockedOffsetRef.current = lockedOrders.length;
        // We don't know if all are loaded from cache, assume not
      }
      
      setProgress({
        phase: lockedOrders.length > 0 ? 2 : 2,
        unlockedLoaded: unlockedOrders.length,
        unlockedTotal: unlockedOrders.length,
        lockedLoaded: lockedOrders.length,
        lockedTotal: null,
        isLoadingLocked: false,
        percentComplete: 50,
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
        progress.phase !== 1
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

  // PHASE 1: Load unlocked orders only
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
            
            // Phase 1 complete - waiting for user action to load locked orders
            setProgress({
              phase: 2,
              unlockedLoaded: allUnlocked.length,
              unlockedTotal: totalUnlocked,
              lockedLoaded: 0,
              lockedTotal: null,
              isLoadingLocked: false,
              percentComplete: 50, // 50% complete - unlocked done, locked pending
            });
            
            console.log("[Progressive] Phase 1 complete. Locked orders will load on pagination.");
          }
        }
      } catch (error) {
        console.error("[Progressive] Phase 1 failed:", error);
        if (!cancelled) {
          setProgress(prev => ({ ...prev, phase: 2 }));
        }
      }
    };
    
    loadPhase1();
    
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializedFromCache, optionsKey]);

  // PHASE 2: Load locked orders in batches on demand
  const loadNextLockedBatch = useCallback(async () => {
    // Prevent concurrent loads or loading when all loaded
    if (lockedLoadingRef.current || allLockedLoadedRef.current) {
      console.log("[Progressive] Skipping batch - already loading or all loaded");
      return;
    }
    
    lockedLoadingRef.current = true;
    const currentOffset = lockedOffsetRef.current;
    const startTime = Date.now();
    
    console.log(`[Progressive] Loading locked batch: offset=${currentOffset}, limit=${LOCKED_BATCH_SIZE}`);
    
    if (isMountedRef.current) {
      setProgress(prev => ({ ...prev, isLoadingLocked: true }));
    }
    
    try {
      const dispatcherDriverIds = await fetchDispatcherDriverIds();
      
      // Use Edge Function for paginated fetch
      const { data: response, error } = await supabase.functions.invoke(
        "get-all-locked-orders",
        {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            offset: currentOffset,
            limit: LOCKED_BATCH_SIZE,
          },
        }
      );

      if (error) {
        console.error("[Progressive] Locked batch error:", error);
        throw error;
      }

      if (response?.orders) {
        const batchOrders = response.orders;
        const totalCount = response.totalCount;
        const hasMore = response.hasMore;
        
        console.log(`[Progressive] Batch loaded: ${batchOrders.length} orders in ${Date.now() - startTime}ms`);
        
        // Update total if this is first batch
        if (currentOffset === 0 && totalCount !== null) {
          lockedTotalRef.current = totalCount;
        }
        
        // Deduplicate against unlocked orders
        const unlockedOrderIds = new Set(phase1Data.map(o => o.id));
        const existingLockedIds = new Set(phase2Data.map(o => o.id));
        const newOrders = batchOrders.filter(
          (order: any) => !unlockedOrderIds.has(order.id) && !existingLockedIds.has(order.id)
        );
        
        // Transform new orders
        const transformedBatch = transformOrders(newOrders);
        
        // Update offset for next batch
        lockedOffsetRef.current = currentOffset + batchOrders.length;
        
        // Check if all loaded
        if (!hasMore || batchOrders.length < LOCKED_BATCH_SIZE) {
          allLockedLoadedRef.current = true;
          console.log("[Progressive] All locked orders loaded");
        }
        
        if (isMountedRef.current) {
          setPhase2Data(prev => [...prev, ...transformedBatch]);
          
          const newLockedCount = phase2Data.length + transformedBatch.length;
          const total = lockedTotalRef.current;
          const isComplete = allLockedLoadedRef.current;
          
          setProgress(prev => ({
            ...prev,
            phase: isComplete ? "complete" : 2,
            lockedLoaded: newLockedCount,
            lockedTotal: total,
            isLoadingLocked: false,
            percentComplete: isComplete ? 100 : Math.min(50 + (newLockedCount / (total || newLockedCount)) * 50, 99),
          }));
        }
      }
    } catch (error) {
      console.error("[Progressive] Batch load failed:", error);
      if (isMountedRef.current) {
        setProgress(prev => ({ ...prev, isLoadingLocked: false }));
      }
    } finally {
      lockedLoadingRef.current = false;
    }
  }, [bookedBy, dispatcherUserId, fetchDispatcherDriverIds, phase1Data, phase2Data]);

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

  // Function to request loading more locked orders (called from pagination)
  const requestLockedOrders = useCallback(() => {
    if (!allLockedLoadedRef.current && !lockedLoadingRef.current) {
      console.log("[Progressive] Requesting next locked batch");
      loadNextLockedBatch();
    }
  }, [loadNextLockedBatch]);

  return {
    data: mergedData,
    isLoading: progress.phase === 1 && phase1Data.length === 0,
    isLoadingLocked: progress.isLoadingLocked,
    progress,
    unlockedCount: progress.unlockedLoaded,
    lockedCount: progress.lockedLoaded,
    lockedTotal: progress.lockedTotal,
    totalCount: mergedData.length,
    isPartialData: progress.phase !== "complete",
    requestLockedOrders, // Trigger next batch load
    lockedOrdersLoaded: allLockedLoadedRef.current,
  };
}
