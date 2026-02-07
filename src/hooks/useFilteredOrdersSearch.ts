import { useState, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";

interface SearchFilters {
  companyId?: string;
  truckCompanyId?: string;
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
    filters.truckCompanyId,
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
    
    console.log("[FilteredSearch] Starting search with filters:", filters);
    
    try {
      const { data: response, error } = await supabase.functions.invoke(
        "search-orders",
        {
          body: {
            filters,
            offset: 0,
            limit: BATCH_SIZE,
          },
        }
      );

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
    offsetRef.current = 0;
  }, [queryClient]);

  // Get data from React Query cache using stable ref
  const cachedOrders = activeQueryKeyRef.current 
    ? (queryClient.getQueryData<any[]>(activeQueryKeyRef.current) || [])
    : [];

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
