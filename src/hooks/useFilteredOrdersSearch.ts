import { useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";

interface SearchFilters {
  companyId?: string;
  loadNumberSuffix?: string;
  bookedBy?: string;
  truckId?: string;
  driverId?: string;
  brokerId?: string;
  lockedNotInvoiced?: boolean;
  invoiced?: boolean;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  excludeBookedByCompanyId?: string;
}

interface FilteredSearchResult {
  orders: any[];
  totalCount: number | null;
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  search: (filters: SearchFilters) => Promise<void>;
  reset: () => void;
  summary: OrdersSummary | null;
  isPrefetchingUnlocked: boolean;
}

export interface OrdersSummary {
  totalCount: number;
  unlockedCount: number;
  lockedCount: number;
  invoicedCount: number;
  notInvoicedCount: number;
  freightSum: number;
  driverPaySum: number;
}

const BATCH_SIZE = 500;

/**
 * Generate a stable query key from filters for React Query caching.
 * This enables real-time updates to patch filtered results.
 */
function getFilterQueryKey(filters: SearchFilters): (string | boolean | undefined)[] {
  return [
    "orders",
    "filtered",
    filters.companyId,
    filters.loadNumberSuffix,
    filters.bookedBy,
    filters.truckId,
    filters.driverId,
    filters.brokerId,
    filters.lockedNotInvoiced,
    filters.invoiced,
    filters.deliveryDateFrom,
    filters.deliveryDateTo,
    filters.pickupDateFrom,
    filters.pickupDateTo,
    filters.excludeBookedByCompanyId,
  ];
}

/**
 * Hook for server-side filtered order search.
 * Uses React Query for caching so real-time updates can patch results.
 */
export function useFilteredOrdersSearch(): FilteredSearchResult {
  const queryClient = useQueryClient();
  
  // Track current filters and pagination
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState<(string | boolean | undefined)[] | null>(null);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [isPrefetchingUnlocked, setIsPrefetchingUnlocked] = useState(false);
  
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  // Stable refs to break reactive dependency chains
  const activeQueryKeyRef = useRef<(string | boolean | undefined)[] | null>(null);
  const activeFiltersRef = useRef<SearchFilters | null>(null);
  const hasMoreRef = useRef(false);

  const search = useCallback(async (filters: SearchFilters) => {
    if (isLoadingRef.current) return;
    
    isLoadingRef.current = true;
    offsetRef.current = 0;
    
    const newQueryKey = getFilterQueryKey(filters);
    // Update refs BEFORE any async work
    activeQueryKeyRef.current = newQueryKey;
    activeFiltersRef.current = filters;
    setActiveFilterKey(newQueryKey);
    
    console.log("[FilteredSearch] Starting search with filters:", filters);

    let summaryData: OrdersSummary | null = null;

    try {
      // Fetch rows (page 1) and aggregates in parallel.
      const [rowsRes, summaryRes] = await Promise.all([
        supabase.functions.invoke("search-orders", {
          body: { filters, offset: 0, limit: BATCH_SIZE },
        }),
        supabase.functions.invoke("orders-summary", {
          body: { filters },
        }),
      ]);
      const { data: response, error } = rowsRes;

      if (summaryRes.error) {
        console.error("[FilteredSearch] Summary error:", summaryRes.error);
        setSummary(null);
      } else if (summaryRes.data) {
        summaryData = summaryRes.data as OrdersSummary;
        setSummary(summaryData);
      }

      if (error) {
        console.error("[FilteredSearch] Search error:", error);
        throw error;
      }

      if (response?.orders) {
        const transformed = transformOrders(response.orders);
        
        // Store in React Query cache so real-time can patch it
        queryClient.setQueryData(newQueryKey, transformed);
        
        setTotalCount(response.totalCount);
        hasMoreRef.current = response.hasMore;
        offsetRef.current = response.orders.length;
        
        console.log(`[FilteredSearch] Found ${transformed.length} orders (total: ${response.totalCount})`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Search failed:", error);
      queryClient.setQueryData(newQueryKey, []);
      setTotalCount(null);
      hasMoreRef.current = false;
      setSummary(null);
    } finally {
      isLoadingRef.current = false;
    }

    // Eagerly prefetch additional batches until every unlocked row is in the
    // client cache. The server returns rows in `locked asc` order, so once
    // loaded.length >= summary.unlockedCount we know all unlocked are present.
    // Cap at 10 batches (5,000 rows) as a safety net.
    if (
      summaryData &&
      typeof summaryData.unlockedCount === "number" &&
      summaryData.unlockedCount > 0
    ) {
      const cached = (queryClient.getQueryData(newQueryKey) as any[] | undefined) ?? [];
      if (cached.length < summaryData.unlockedCount && hasMoreRef.current) {
        setIsPrefetchingUnlocked(true);
        try {
          let safety = 0;
          while (
            // Bail if a newer search has started
            activeQueryKeyRef.current === newQueryKey &&
            hasMoreRef.current &&
            safety < 10
          ) {
            const currentCached =
              (queryClient.getQueryData(newQueryKey) as any[] | undefined) ?? [];
            if (currentCached.length >= summaryData.unlockedCount) break;

            const { data: more, error: moreErr } = await supabase.functions.invoke(
              "search-orders",
              {
                body: {
                  filters,
                  offset: offsetRef.current,
                  limit: BATCH_SIZE,
                },
              }
            );
            if (moreErr || !more?.orders) {
              console.error("[FilteredSearch] Unlocked prefetch error:", moreErr);
              break;
            }
            const transformed = transformOrders(more.orders);
            queryClient.setQueryData(newQueryKey, (old: any[] | undefined) => [
              ...(old || []),
              ...transformed,
            ]);
            hasMoreRef.current = more.hasMore;
            offsetRef.current += more.orders.length;
            safety += 1;
          }
        } finally {
          if (activeQueryKeyRef.current === newQueryKey) {
            setIsPrefetchingUnlocked(false);
          } else {
            setIsPrefetchingUnlocked(false);
          }
        }
      }
    }
  }, [queryClient]);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current || !activeFiltersRef.current || !activeQueryKeyRef.current) {
      if (!activeQueryKeyRef.current) {
        console.warn('[FilteredSearch] loadMore called but no active query');
      }
      return;
    }
    
    isLoadingRef.current = true;
    setIsLoadingMore(true);
    
    console.log(`[FilteredSearch] Loading more: offset=${offsetRef.current}`);
    
    const currentQueryKey = activeQueryKeyRef.current;
    const currentFilters = activeFiltersRef.current;
    
    try {
      const { data: response, error } = await supabase.functions.invoke(
        "search-orders",
        {
          body: {
            filters: currentFilters,
            offset: offsetRef.current,
            limit: BATCH_SIZE,
          },
        }
      );

      if (error) {
        console.error("[FilteredSearch] Load more error:", error);
        throw error;
      }

      if (response?.orders) {
        const transformed = transformOrders(response.orders);
        
        // Append to existing React Query cache
        queryClient.setQueryData(currentQueryKey, (old: any[] | undefined) => {
          return [...(old || []), ...transformed];
        });
        
        hasMoreRef.current = response.hasMore;
        offsetRef.current += response.orders.length;
        
        console.log(`[FilteredSearch] Loaded ${transformed.length} more orders`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Load more failed:", error);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    // Clear the React Query cache for the current filter
    if (activeQueryKeyRef.current) {
      console.log('[FilteredSearch] Clearing cached query');
      queryClient.removeQueries({ queryKey: activeQueryKeyRef.current });
    }
    activeQueryKeyRef.current = null;
    activeFiltersRef.current = null;
    hasMoreRef.current = false;
    setTotalCount(null);
    setActiveFilterKey(null);
    offsetRef.current = 0;
    setSummary(null);
    setIsPrefetchingUnlocked(false);
  }, [queryClient]);

  // Subscribe to cache updates using useQuery with enabled: false
  const cacheQueryKey = useMemo(() => {
    return activeFilterKey || ["orders", "filtered", "__disabled__"];
  }, [activeFilterKey]);

  const { data: cachedOrders = [] } = useQuery<any[]>({
    queryKey: cacheQueryKey,
    queryFn: () => [],
    enabled: false,
    staleTime: Infinity,
  });

  return {
    orders: cachedOrders,
    totalCount,
    isLoading: isLoadingRef.current || isLoadingMore,
    hasMore: hasMoreRef.current,
    loadMore,
    search,
    reset,
    summary,
    isPrefetchingUnlocked,
  };
}
