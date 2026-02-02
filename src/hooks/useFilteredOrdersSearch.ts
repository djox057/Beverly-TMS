import { useState, useCallback, useRef } from "react";
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
 * Hook for server-side filtered order search
 * Used when filters are active to avoid loading all orders client-side
 */
export function useFilteredOrdersSearch(): FilteredSearchResult {
  const [orders, setOrders] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  
  const currentFiltersRef = useRef<SearchFilters>({});
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);

  const search = useCallback(async (filters: SearchFilters) => {
    if (isLoadingRef.current) return;
    
    isLoadingRef.current = true;
    setIsLoading(true);
    currentFiltersRef.current = filters;
    offsetRef.current = 0;
    
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
        setOrders(transformed);
        setTotalCount(response.totalCount);
        setHasMore(response.hasMore);
        offsetRef.current = response.orders.length;
        
        console.log(`[FilteredSearch] Found ${transformed.length} orders (total: ${response.totalCount})`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Search failed:", error);
      setOrders([]);
      setTotalCount(null);
      setHasMore(false);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore) return;
    
    isLoadingRef.current = true;
    setIsLoading(true);
    
    console.log(`[FilteredSearch] Loading more: offset=${offsetRef.current}`);
    
    try {
      const { data: response, error } = await supabase.functions.invoke(
        "search-orders",
        {
          body: {
            filters: currentFiltersRef.current,
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
        setOrders(prev => [...prev, ...transformed]);
        setHasMore(response.hasMore);
        offsetRef.current += response.orders.length;
        
        console.log(`[FilteredSearch] Loaded ${transformed.length} more orders`);
      }
    } catch (error) {
      console.error("[FilteredSearch] Load more failed:", error);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore]);

  const reset = useCallback(() => {
    setOrders([]);
    setTotalCount(null);
    setHasMore(false);
    currentFiltersRef.current = {};
    offsetRef.current = 0;
  }, []);

  return {
    orders,
    totalCount,
    isLoading,
    hasMore,
    loadMore,
    search,
    reset,
  };
}
