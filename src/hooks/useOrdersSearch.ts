import { useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { transformOrders } from "@/utils/ordersTransform";

/**
 * Generate a stable query key for search results.
 */
function getSearchQueryKey(
  searchTerm: string,
  bookedBy?: string | null,
  dispatcherUserId?: string | null,
  excludeBookedByCompanyId?: string | null,
  bookedByCompanyId?: string | null,
): (string | null | undefined)[] {
  return ["orders", "search", searchTerm, bookedBy, dispatcherUserId, excludeBookedByCompanyId, bookedByCompanyId];
}

/**
 * Server-side search hook for orders.
 * Phase 3D: Uses single `search_orders_v2` RPC instead of 6–9 round-trips.
 * RPC returns matched orders fully assembled with relations + entities in one
 * payload. RLS still applies (security invoker).
 */
export function useOrdersSearch() {
  const queryClient = useQueryClient();
  
  const [activeSearchTerm, setActiveSearchTerm] = useState<string | null>(null);
  const [activeOptions, setActiveOptions] = useState<{ bookedBy?: string | null; dispatcherUserId?: string | null; excludeBookedByCompanyId?: string | null; bookedByCompanyId?: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);
  const latestSearchKeyRef = useRef<string>("");
  
  // Refs to break the circular dependency: searchOrders no longer depends on reactive queryKey
  const activeQueryKeyRef = useRef<(string | null | undefined)[] | null>(null);
  const activeSearchTermRef = useRef<string | null>(null);

  const searchOrders = useCallback(async (
    searchTerm: string,
    options?: {
      bookedBy?: string | null;
      dispatcherUserId?: string | null;
      excludeBookedByCompanyId?: string | null;
      bookedByCompanyId?: string | null;
    }
  ) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      if (activeQueryKeyRef.current) {
        queryClient.removeQueries({ queryKey: activeQueryKeyRef.current });
        activeQueryKeyRef.current = null;
      }
      activeSearchTermRef.current = null;
      setActiveSearchTerm(null);
      setActiveOptions(null);
      latestSearchKeyRef.current = "";
      return;
    }

    const term = searchTerm.trim().toLowerCase();
    const searchKey = `${term}|${options?.bookedBy || ''}|${options?.dispatcherUserId || ''}|${options?.excludeBookedByCompanyId || ''}|${options?.bookedByCompanyId || ''}`;

    latestSearchKeyRef.current = searchKey;
    activeSearchTermRef.current = term;
    
    setActiveSearchTerm(term);
    setActiveOptions(options || null);
    const newQueryKey = getSearchQueryKey(term, options?.bookedBy, options?.dispatcherUserId, options?.excludeBookedByCompanyId, options?.bookedByCompanyId);
    activeQueryKeyRef.current = newQueryKey;
    
    console.log("[useOrdersSearch] Starting RPC search for:", term);
    
    setIsSearching(true);
    setSearchError(null);

    try {
      queryClient.cancelQueries({ queryKey: ["orders", "search"] });

      const { data, error } = await supabase.rpc("search_orders_v2" as any, {
        p_term: term,
        p_booked_by: options?.bookedBy ?? null,
        p_dispatcher_user_id: options?.dispatcherUserId ?? null,
        p_excluded_booked_by_company_id: options?.excludeBookedByCompanyId ?? null,
        p_booked_by_company_id: options?.bookedByCompanyId ?? null,
        p_limit: 50,
      });

      if (latestSearchKeyRef.current !== searchKey) {
        console.log("[useOrdersSearch] Discarding stale RPC response for:", searchKey);
        return;
      }
      if (error) {
        console.error("[useOrdersSearch] RPC error:", error);
        throw error;
      }

      const rows = (data as any[]) || [];
      console.log("[useOrdersSearch] Results count:", rows.length);

      const transformed = transformOrders(rows);
      queryClient.setQueryData(newQueryKey, transformed);
    } catch (err: any) {
      if (latestSearchKeyRef.current === searchKey) {
        console.error("[useOrdersSearch] Error:", err);

        setSearchError(err instanceof Error ? err : new Error("Search failed"));
        queryClient.setQueryData(newQueryKey, null);
      }
    } finally {
      if (latestSearchKeyRef.current === searchKey) {
        setIsSearching(false);
      }
    }
  }, [queryClient]); // Stable deps - no queryKey!

  const clearSearch = useCallback(() => {
    if (activeQueryKeyRef.current) {
      queryClient.removeQueries({ queryKey: activeQueryKeyRef.current });
      activeQueryKeyRef.current = null;
    }
    latestSearchKeyRef.current = "";
    activeSearchTermRef.current = null;
    setActiveSearchTerm(null);
    setActiveOptions(null);
    setIsSearching(false);
    setSearchError(null);
  }, [queryClient]); // Stable deps - no queryKey!

  // Derive query key from state so useQuery subscribes to cache changes
  const searchQueryKey = useMemo(() => {
    if (!activeSearchTerm) return ["orders", "search", "__disabled__"];
    return getSearchQueryKey(activeSearchTerm, activeOptions?.bookedBy, activeOptions?.dispatcherUserId, activeOptions?.excludeBookedByCompanyId, activeOptions?.bookedByCompanyId);
  }, [activeSearchTerm, activeOptions]);

  // useQuery subscribes to cache updates (setQueryData) even with enabled: false
  const { data: searchResults = null } = useQuery<any[] | null>({
    queryKey: searchQueryKey,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  });

  return {
    searchResults,
    isSearching,
    searchError,
    searchOrders,
    clearSearch,
  };
}
