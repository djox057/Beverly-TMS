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
  currentPage?: number;
}

/**
 * Progressive loading hook for /orders page
 * Fetches orders page-by-page directly from the server using offset-based pagination.
 * Each page is fetched independently when requested.
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const queryClient = useQueryClient();
  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const currentPage = options?.currentPage ?? 1;

  const hasFilters = Boolean(bookedBy || dispatcherUserId);
  
  // Subscribe to real-time updates
  useOrdersRealtime();

  const [totalCount, setTotalCount] = useState<number | null>(null);
  
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

  // Fetch total count on mount
  const countQuery = useQuery({
    queryKey: hasFilters 
      ? ["orders-count", "filtered", bookedBy, dispatcherUserId] 
      : ["orders-count"],
    queryFn: async () => {
      console.log("[OrdersProgressive] Fetching total count...");
      const dispatcherDriverIds = await fetchDispatcherDriverIds();

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

      const { count, error } = await countQuery;
      if (error) throw error;
      
      console.log(`[OrdersProgressive] Total unlocked orders: ${count}`);
      setTotalCount(count);
      return count;
    },
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds
  });

  // Fetch a specific page
  const fetchPage = useCallback(async (pageNumber: number) => {
    if (loadedPagesRef.current.has(pageNumber)) {
      console.log(`[OrdersProgressive] Page ${pageNumber} already loaded`);
      return loadedPagesRef.current.get(pageNumber)!;
    }

    setIsLoadingPage(true);
    try {
      const dispatcherDriverIds = await fetchDispatcherDriverIds();
      const offset = (pageNumber - 1) * PAGE_SIZE;

      console.log(`[OrdersProgressive] Fetching page ${pageNumber} (offset ${offset})...`);

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
      const transformedOrders = transformOrders(rawOrders);
      
      // Cache the page
      loadedPagesRef.current.set(pageNumber, transformedOrders);
      setLoadedPages(prev => new Set(prev).add(pageNumber));

      console.log(`[OrdersProgressive] Page ${pageNumber} loaded: ${transformedOrders.length} orders`);
      return transformedOrders;
    } finally {
      setIsLoadingPage(false);
    }
  }, [bookedBy, dispatcherUserId, fetchDispatcherDriverIds]);

  // Load initial page (page 1) on mount
  const initialPageQuery = useQuery({
    queryKey: hasFilters 
      ? ["orders", "page", 1, "filtered", bookedBy, dispatcherUserId] 
      : ["orders", "page", 1],
    queryFn: () => fetchPage(1),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
    enabled: countQuery.isSuccess,
  });

  // Request a specific page - returns orders for that page
  const requestPage = useCallback(async (pageNumber: number) => {
    if (loadedPagesRef.current.has(pageNumber)) {
      return loadedPagesRef.current.get(pageNumber)!;
    }
    return fetchPage(pageNumber);
  }, [fetchPage]);

  // Prefetch the next page in background
  const prefetchNextPage = useCallback((currentPage: number) => {
    const nextPage = currentPage + 1;
    const maxPage = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;
    
    if (nextPage <= maxPage && !loadedPagesRef.current.has(nextPage)) {
      console.log(`[OrdersProgressive] Prefetching page ${nextPage}...`);
      fetchPage(nextPage).catch(err => 
        console.error(`[OrdersProgressive] Prefetch failed for page ${nextPage}:`, err)
      );
    }
  }, [fetchPage, totalCount]);

  // Return ONLY the current page's data (not all pages merged)
  const currentPageOrders = useMemo(() => {
    return loadedPagesRef.current.get(currentPage) || [];
  }, [currentPage, loadedPages]); // Re-compute when currentPage or loadedPages changes

  // Calculate total pages based on server count
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;

  // Check if current page is loaded
  const isCurrentPageLoaded = loadedPages.has(currentPage);

  // For backward compatibility, also track total loaded
  const loadedCount = useMemo(() => {
    let count = 0;
    for (const orders of loadedPagesRef.current.values()) {
      count += orders.length;
    }
    return count;
  }, [loadedPages]);

  const hasMore = totalCount ? currentPage < totalPages : false;

  const progress = useMemo<ProgressiveLoadingProgress>(() => {
    const isLoading = countQuery.isLoading || initialPageQuery.isLoading;
    return {
      phase: isLoading ? 1 : "complete",
      unlockedLoaded: loadedCount,
      unlockedTotal: totalCount,
      lockedLoaded: 0,
      lockedTotal: null,
      isLoadingLocked: false,
      percentComplete: totalCount ? Math.round((loadedCount / totalCount) * 100) : (isLoading ? 0 : 100),
    };
  }, [loadedCount, totalCount, countQuery.isLoading, initialPageQuery.isLoading]);

  return {
    data: currentPageOrders,  // Only current page's orders
    isLoading: countQuery.isLoading || initialPageQuery.isLoading,
    isLoadingMore: isLoadingPage,
    isLoadingLocked: false,
    progress,
    unlockedCount: loadedCount,
    lockedCount: 0,
    lockedTotal: null,
    totalCount: totalCount ?? 0,
    totalPages,
    totalLoaded: loadedCount,
    hasMore,
    currentPage,
    isCurrentPageLoaded,
    requestPage,
    prefetchNextPage,
    loadedPages,
    isPartialData: countQuery.isLoading || initialPageQuery.isLoading || !isCurrentPageLoaded,
    requestLockedOrders: () => {},
    lockedOrdersLoaded: true,
  };
}
