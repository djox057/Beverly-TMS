import { useState, useCallback, useRef, useMemo } from "react";
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
  const [activeFilters, setActiveFilters] = useState<SearchFilters | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);

  // Generate query key from active filters
  const queryKey = useMemo(() => {
    if (!activeFilters) return null;
    return getFilterQueryKey(activeFilters);
  }, [activeFilters]);

  // Use React Query for the filtered results - this enables real-time patching
  const { data: orders = [], isLoading: isQueryLoading } = useQuery({
    queryKey: queryKey || ["orders", "filtered", "inactive"],
    queryFn: async () => {
      // This should never be called directly - we populate via setQueryData
      return [];
    },
    enabled: false, // We manually control data via setQueryData
    staleTime: Infinity,
  });

  const search = useCallback(async (filters: SearchFilters) => {
    if (isLoadingRef.current) return;
    
    isLoadingRef.current = true;
    offsetRef.current = 0;
    
    // Set active filters to generate the query key
    setActiveFilters(filters);
    const newQueryKey = getFilterQueryKey(filters);
    
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
        setHasMore(response.hasMore);
        offsetRef.current = response.orders.length;
        
        console.log(`[FilteredSearch] Found ${transformed.length} orders (total: ${response.totalCount})`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Search failed:", error);
      queryClient.setQueryData(newQueryKey, []);
      setTotalCount(null);
      setHasMore(false);
    } finally {
      isLoadingRef.current = false;
    }
  }, [queryClient]);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore || !activeFilters || !queryKey) return;
    
    isLoadingRef.current = true;
    setIsLoadingMore(true);
    
    console.log(`[FilteredSearch] Loading more: offset=${offsetRef.current}`);
    
    try {
      const { data: response, error } = await supabase.functions.invoke(
        "search-orders",
        {
          body: {
            filters: activeFilters,
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
        queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
          return [...(old || []), ...transformed];
        });
        
        setHasMore(response.hasMore);
        offsetRef.current += response.orders.length;
        
        console.log(`[FilteredSearch] Loaded ${transformed.length} more orders`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Load more failed:", error);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, activeFilters, queryKey, queryClient]);

  const reset = useCallback(() => {
    // Clear the React Query cache for the current filter
    if (queryKey) {
      queryClient.removeQueries({ queryKey });
    }
    setActiveFilters(null);
    setTotalCount(null);
    setHasMore(false);
    offsetRef.current = 0;
  }, [queryKey, queryClient]);

  // Get data from React Query cache
  const cachedOrders = queryKey 
    ? (queryClient.getQueryData<any[]>(queryKey) || [])
    : [];

  return {
    orders: cachedOrders,
    totalCount,
    isLoading: isLoadingRef.current || isLoadingMore,
    hasMore,
    loadMore,
    search,
    reset,
  };
}
