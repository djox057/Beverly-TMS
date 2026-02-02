import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface LoadingProgress {
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  isLoadingMore: boolean;
  isComplete: boolean;
}

interface UseOrdersWithProgressOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

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
    isLoadingMore: false,
    isComplete: false,
  });
  
  const isMountedRef = useRef(true);

  // Normalize option values for stable query key
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  
  // Query key changes when filters change
  const queryKey = hasFilters 
    ? ["orders", "analytics", bookedBy, dispatcherUserId] 
    : ["orders"];

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

  // Main query - uses Edge Functions for bulk fetch
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const startTime = Date.now();
      console.log("[OrdersWithProgress] Starting bulk fetch via Edge Functions...");

      setProgress(prev => ({ ...prev, isLoadingMore: true }));

      // Fetch dispatcher driver IDs if filtering
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // Fetch ALL orders (unlocked + locked) in parallel via Edge Functions
      const [unlockedResponse, lockedResponse] = await Promise.all([
        supabase.functions.invoke("get-all-unlocked-orders", {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
          },
        }),
        supabase.functions.invoke("get-all-locked-orders", {
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
          },
        }),
      ]);

      let allUnlockedOrders: any[] = [];
      let allLockedOrders: any[] = [];
      let totalUnlockedCount: number | null = null;

      // Process unlocked orders
      if (unlockedResponse.error) {
        console.error("[OrdersWithProgress] Unlocked Edge Function error:", unlockedResponse.error);
        throw unlockedResponse.error;
      }
      if (unlockedResponse.data?.orders) {
        allUnlockedOrders = unlockedResponse.data.orders;
        totalUnlockedCount = unlockedResponse.data.count;
        console.log(`[OrdersWithProgress] ✅ Fetched ${allUnlockedOrders.length} unlocked orders in ${unlockedResponse.data.fetchTimeMs}ms`);
      }

      // Update progress with unlocked count
      setProgress(prev => ({ 
        ...prev, 
        unlockedLoaded: allUnlockedOrders.length,
        unlockedTotal: totalUnlockedCount,
      }));

      // Process locked orders
      if (lockedResponse.error) {
        console.error("[OrdersWithProgress] Locked Edge Function error:", lockedResponse.error);
        // Don't throw - continue with unlocked orders only
      } else if (lockedResponse.data?.orders) {
        allLockedOrders = lockedResponse.data.orders;
        console.log(`[OrdersWithProgress] ✅ Fetched ${allLockedOrders.length} locked orders in ${lockedResponse.data.fetchTimeMs}ms`);
      }

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
      setProgress({
        unlockedLoaded: allUnlockedOrders.length,
        unlockedTotal: totalUnlockedCount,
        lockedLoaded: deduplicatedLockedOrders.length,
        isLoadingMore: false,
        isComplete: true,
      });

      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);
      console.log(`[OrdersWithProgress] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  // Handle cache hit scenario (data already loaded by /orders page)
  useEffect(() => {
    isMountedRef.current = true;
    
    if (query.data && progress.unlockedTotal === null && !query.isLoading) {
      // Data exists but progress wasn't initialized (came from cache)
      const unlockedCount = query.data.filter((o: any) => !o.locked).length;
      const lockedCount = query.data.filter((o: any) => o.locked).length;
      
      console.log(`[OrdersWithProgress] Using cached data: ${unlockedCount} unlocked, ${lockedCount} locked`);
      
      // Verify we have all unlocked orders
      (async () => {
        const dispatcherDriverIds = await fetchDispatcherDriverIds();
        
        let countQuery = supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("locked", false);
        
        // Apply same filters as main query
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
        
        if (isMountedRef.current) {
          setProgress({
            unlockedLoaded: unlockedCount,
            unlockedTotal: count,
            lockedLoaded: lockedCount,
            isLoadingMore: false,
            isComplete: unlockedCount >= (count || 0),
          });
          
          if (unlockedCount < (count || 0)) {
            console.warn(`[OrdersWithProgress] Cache incomplete: ${unlockedCount}/${count}, triggering refetch`);
            queryClient.invalidateQueries({ queryKey });
          }
        }
      })();
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [query.data, query.isLoading, progress.unlockedTotal, queryClient, queryKey, bookedBy, fetchDispatcherDriverIds]);

  return {
    ...query,
    progress,
  };
}
