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
  
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  // Stable refs to break reactive dependency chains
  const activeQueryKeyRef = useRef<(string | boolean | undefined)[] | null>(null);
  const activeFiltersRef = useRef<SearchFilters | null>(null);
  const hasMoreRef = useRef(false);
  const unlockedCountRef = useRef(0);
  const lockedCountRef = useRef<number | null>(null);

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
    
    try {
      // Locked-only mode: filters explicitly imply locked rows.
      const lockedOnlyMode = filters.lockedNotInvoiced === true || filters.invoiced === true;
      // Unlocked-only mode: caller already requested only unlocked.
      const unlockedOnlyMode = !lockedOnlyMode &&
        // No explicit way to request unlocked-only from UI today, kept for symmetry
        false;

      const unlockedPromise = lockedOnlyMode
        ? Promise.resolve({ data: { orders: [], totalCount: 0, hasMore: false }, error: null as any })
        : supabase.functions.invoke("search-orders", {
            body: {
              filters: { ...filters, locked: false },
              offset: 0,
              limit: 1000,
              fetchAllUnlocked: true,
            },
          });

      const lockedPromise = unlockedOnlyMode
        ? Promise.resolve({ data: { orders: [], totalCount: 0, hasMore: false }, error: null as any })
        : supabase.functions.invoke("search-orders", {
            body: {
              filters: lockedOnlyMode ? filters : { ...filters, locked: true },
              offset: 0,
              limit: BATCH_SIZE,
            },
          });

      const [unlockedRes, lockedRes] = await Promise.all([unlockedPromise, lockedPromise]);

      if (unlockedRes.error) throw unlockedRes.error;
      if (lockedRes.error) throw lockedRes.error;

      const unlockedRaw = unlockedRes.data?.orders || [];
      const lockedRaw = lockedRes.data?.orders || [];
      const unlockedTransformed = transformOrders(unlockedRaw);
      const lockedTransformed = transformOrders(lockedRaw);

      const combined = [...unlockedTransformed, ...lockedTransformed];
      queryClient.setQueryData(newQueryKey, combined);

      const unlockedTotal = unlockedRes.data?.totalCount ?? unlockedTransformed.length;
      const lockedTotal = lockedRes.data?.totalCount ?? null;
      const grandTotal = (unlockedTotal || 0) + (lockedTotal || 0);

      unlockedCountRef.current = unlockedTransformed.length;
      lockedCountRef.current = lockedTotal;
      hasMoreRef.current = !!lockedRes.data?.hasMore;
      offsetRef.current = lockedTransformed.length; // locked-page offset

      setTotalCount(grandTotal);

      console.log(
        `[FilteredSearch] unlocked=${unlockedTransformed.length} lockedPage=${lockedTransformed.length} ` +
        `lockedTotal=${lockedTotal} grandTotal=${grandTotal}`
      );
    } catch (error) {
      console.error("[FilteredSearch] Search failed:", error);
      queryClient.setQueryData(newQueryKey, []);
      setTotalCount(null);
      hasMoreRef.current = false;
      unlockedCountRef.current = 0;
      lockedCountRef.current = null;
    } finally {
      isLoadingRef.current = false;
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
      const lockedOnlyMode = currentFilters.lockedNotInvoiced === true || currentFilters.invoiced === true;
      const { data: response, error } = await supabase.functions.invoke(
        "search-orders",
        {
          body: {
            filters: lockedOnlyMode ? currentFilters : { ...currentFilters, locked: true },
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
  };
}
