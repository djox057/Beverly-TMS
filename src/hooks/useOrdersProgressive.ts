import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

const PAGE_SIZE = 100;

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
  currentPage?: number;
}

/**
 * Progressive loading hook for /orders page
 * Fetches orders page-by-page directly from the server using offset-based pagination.
 * Seamlessly continues into locked orders after unlocked orders are exhausted.
 * 
 * Example with 662 unlocked orders:
 * - Pages 1-6: 100 unlocked orders each
 * - Page 7: 62 unlocked + 38 locked = 100 orders
 * - Page 8+: locked orders only
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const currentPage = options?.currentPage ?? 1;

  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  
  // Subscribe to real-time updates
  useOrdersRealtime();

  // Cache for loaded pages: Map<pageNumber, orders[]>
  const loadedPagesRef = useRef<Map<number, any[]>>(new Map());
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [isLoadingPage, setIsLoadingPage] = useState(false);

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

  // Fetch both unlocked and locked counts
  const countsQuery = useQuery({
    queryKey: hasFilters 
      ? ["orders-counts", "filtered", bookedBy, dispatcherUserId] 
      : ["orders-counts"],
    queryFn: async () => {
      console.log("[OrdersProgressive] Fetching total counts...");
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

      // Build filter for both queries
      const buildFilter = (query: any) => {
        if (bookedBy && dispatcherDriverIds.length > 0) {
          return query.or(
            `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
          );
        } else if (bookedBy) {
          return query.eq("booked_by", bookedBy);
        } else if (dispatcherDriverIds.length > 0) {
          return query.in("driver1_id", dispatcherDriverIds);
        }
        return query;
      };

      // Get unlocked count
      let unlockedCountQuery = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", false);
      unlockedCountQuery = buildFilter(unlockedCountQuery);
      
      // Get locked count
      let lockedCountQuery = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", true);
      lockedCountQuery = buildFilter(lockedCountQuery);

      const [unlockedResult, lockedResult] = await Promise.all([
        unlockedCountQuery,
        lockedCountQuery,
      ]);

      if (unlockedResult.error) throw unlockedResult.error;
      if (lockedResult.error) throw lockedResult.error;
      
      const unlockedCount = unlockedResult.count ?? 0;
      const lockedCount = lockedResult.count ?? 0;
      
      console.log(`[OrdersProgressive] Counts - Unlocked: ${unlockedCount}, Locked: ${lockedCount}, Total: ${unlockedCount + lockedCount}`);
      
      return { unlockedCount, lockedCount };
    },
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const unlockedCount = countsQuery.data?.unlockedCount ?? 0;
  const lockedCount = countsQuery.data?.lockedCount ?? 0;
  const totalCount = unlockedCount + lockedCount;

  /**
   * Fetch a specific page, handling the unlocked→locked boundary.
   * 
   * For a page starting at globalOffset:
   * - If entirely within unlocked range: fetch from unlocked
   * - If entirely within locked range: fetch from locked
   * - If spans boundary: fetch from both and merge
   */
  const fetchPage = useCallback(async (pageNumber: number, unlockedTotal: number, lockedTotal: number) => {
    if (loadedPagesRef.current.has(pageNumber)) {
      console.log(`[OrdersProgressive] Page ${pageNumber} already loaded`);
      return loadedPagesRef.current.get(pageNumber)!;
    }

    setIsLoadingPage(true);
    try {
      const dispatcherDriverIds = await fetchDispatcherDriverIds();
      const globalOffset = (pageNumber - 1) * PAGE_SIZE;
      const globalEnd = globalOffset + PAGE_SIZE;
      
      console.log(`[OrdersProgressive] Fetching page ${pageNumber} (global offset ${globalOffset}-${globalEnd}, unlocked=${unlockedTotal}, locked=${lockedTotal})...`);

      let allOrders: any[] = [];

      // Determine what to fetch using passed-in counts (not stale closure values)
      const unlockedEnd = Math.min(unlockedTotal, globalEnd);
      const needsUnlocked = globalOffset < unlockedTotal;
      
      const lockedOffset = Math.max(0, globalOffset - unlockedTotal);
      const needsLocked = globalEnd > unlockedTotal && lockedTotal > 0;

      const fetchPromises: Promise<any>[] = [];

      // Fetch unlocked orders if needed
      if (needsUnlocked) {
        const unlockedLimit = unlockedEnd - globalOffset;
        console.log(`[OrdersProgressive] Fetching ${unlockedLimit} unlocked orders (offset ${globalOffset})`);
        
        fetchPromises.push(
          supabase.functions.invoke("get-all-unlocked-orders", {
            body: {
              bookedBy,
              dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
              limit: unlockedLimit,
              offset: globalOffset,
            },
          }).then(result => ({ type: 'unlocked', ...result }))
        );
      }

      // Fetch locked orders if needed
      if (needsLocked) {
        const lockedLimit = Math.min(PAGE_SIZE - (needsUnlocked ? (unlockedEnd - globalOffset) : 0), lockedTotal - lockedOffset);
        console.log(`[OrdersProgressive] Fetching ${lockedLimit} locked orders (offset ${lockedOffset})`);
        
        fetchPromises.push(
          supabase.functions.invoke("get-all-locked-orders", {
            body: {
              bookedBy,
              dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
              limit: lockedLimit,
              offset: lockedOffset,
            },
          }).then(result => ({ type: 'locked', ...result }))
        );
      }

      // Execute fetches in parallel
      const results = await Promise.all(fetchPromises);

      // Process results in order (unlocked first, then locked)
      for (const result of results) {
        if (result.error) {
          console.error(`[OrdersProgressive] Error fetching ${result.type} orders:`, result.error);
          throw result.error;
        }
        const rawOrders = result.data?.orders ?? [];
        const transformed = transformOrders(rawOrders);
        console.log(`[OrdersProgressive] Got ${transformed.length} ${result.type} orders`);
        allOrders = [...allOrders, ...transformed];
      }
      
      // Cache the page
      loadedPagesRef.current.set(pageNumber, allOrders);
      setLoadedPages(prev => new Set(prev).add(pageNumber));

      console.log(`[OrdersProgressive] Page ${pageNumber} loaded: ${allOrders.length} orders total`);
      return allOrders;
    } finally {
      setIsLoadingPage(false);
    }
  }, [bookedBy, dispatcherUserId, fetchDispatcherDriverIds]);

  // Query for the current page - dynamically loads the page the user is viewing
  const currentPageQuery = useQuery({
    queryKey: hasFilters 
      ? ["orders", "page", currentPage, "filtered", bookedBy, dispatcherUserId] 
      : ["orders", "page", currentPage],
    queryFn: () => fetchPage(currentPage, unlockedCount, lockedCount),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
    enabled: countsQuery.isSuccess && unlockedCount + lockedCount > 0,
  });

  // Request a specific page - returns orders for that page
  const requestPage = useCallback(async (pageNumber: number) => {
    if (loadedPagesRef.current.has(pageNumber)) {
      return loadedPagesRef.current.get(pageNumber)!;
    }
    return fetchPage(pageNumber, unlockedCount, lockedCount);
  }, [fetchPage, unlockedCount, lockedCount]);

  // Prefetch the next page in background
  const prefetchNextPage = useCallback((currentPageNum: number) => {
    const nextPage = currentPageNum + 1;
    const maxPage = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;
    
    if (nextPage <= maxPage && !loadedPagesRef.current.has(nextPage)) {
      console.log(`[OrdersProgressive] Prefetching page ${nextPage}...`);
      fetchPage(nextPage, unlockedCount, lockedCount).catch(err => 
        console.error(`[OrdersProgressive] Prefetch failed for page ${nextPage}:`, err)
      );
    }
  }, [fetchPage, totalCount, unlockedCount, lockedCount]);

  // Return ONLY the current page's data - use query data directly to ensure reactivity
  const currentPageOrders = useMemo(() => {
    // The query data is the most up-to-date source for the current page
    // This ensures we re-render when the query completes
    return currentPageQuery.data || loadedPagesRef.current.get(currentPage) || [];
  }, [currentPage, loadedPages, currentPageQuery.data]);

  // Calculate total pages based on combined count
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;

  // Check if current page is loaded
  const isCurrentPageLoaded = loadedPages.has(currentPage);

  // Track total loaded orders across all cached pages
  const totalLoaded = useMemo(() => {
    let count = 0;
    for (const orders of loadedPagesRef.current.values()) {
      count += orders.length;
    }
    return count;
  }, [loadedPages]);

  // Determine if current page spans into locked orders
  const currentPageSpansLocked = (currentPage - 1) * PAGE_SIZE + PAGE_SIZE > unlockedCount;
  
  const hasMore = currentPage < totalPages;

  const progress = useMemo<ProgressiveLoadingProgress>(() => {
    const isLoading = countsQuery.isLoading || currentPageQuery.isLoading;
    const isInLockedTerritory = (currentPage - 1) * PAGE_SIZE >= unlockedCount;
    
    return {
      phase: isLoading ? 1 : (isInLockedTerritory ? 2 : "complete"),
      unlockedLoaded: Math.min(totalLoaded, unlockedCount),
      unlockedTotal: unlockedCount,
      lockedLoaded: Math.max(0, totalLoaded - unlockedCount),
      lockedTotal: lockedCount,
      isLoadingLocked: isLoadingPage && currentPageSpansLocked,
      percentComplete: totalCount ? Math.round((totalLoaded / totalCount) * 100) : (isLoading ? 0 : 100),
    };
  }, [totalLoaded, unlockedCount, lockedCount, totalCount, countsQuery.isLoading, currentPageQuery.isLoading, isLoadingPage, currentPage, currentPageSpansLocked]);

  return {
    data: currentPageOrders,
    isLoading: countsQuery.isLoading || currentPageQuery.isLoading,
    isLoadingMore: isLoadingPage,
    isLoadingLocked: isLoadingPage && currentPageSpansLocked,
    progress,
    unlockedCount,
    lockedCount,
    lockedTotal: lockedCount,
    totalCount,
    totalPages,
    totalLoaded,
    hasMore,
    currentPage,
    isCurrentPageLoaded,
    requestPage,
    prefetchNextPage,
    loadedPages,
    isPartialData: countsQuery.isLoading || currentPageQuery.isLoading || !isCurrentPageLoaded,
    requestLockedOrders: () => {}, // Legacy - handled automatically now
    lockedOrdersLoaded: true,
  };
}
