import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
 * Phase 3E: Two-call ids→hydrate split with in-flight cancellation.
 * 1. `search_orders_ids` returns matched ids only (very fast, single RLS pass).
 * 2. `search_orders_hydrate(ids)` returns the full payload with relations.
 * Each new keystroke aborts the previous request via AbortController.
 */
export function useOrdersSearch() {
  const queryClient = useQueryClient();
  
  const [activeSearchTerm, setActiveSearchTerm] = useState<string | null>(null);
  const [activeOptions, setActiveOptions] = useState<{ bookedBy?: string | null; dispatcherUserId?: string | null; excludeBookedByCompanyId?: string | null; bookedByCompanyId?: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);
  const latestSearchKeyRef = useRef<string>("");
  const inFlightAbortRef = useRef<AbortController | null>(null);
  
  // Refs to break the circular dependency: searchOrders no longer depends on reactive queryKey
  const activeQueryKeyRef = useRef<(string | null | undefined)[] | null>(null);
  const activeSearchTermRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort();
    };
  }, []);

  const searchOrders = useCallback(async (
    searchTerm: string,
    options?: {
      bookedBy?: string | null;
      dispatcherUserId?: string | null;
      excludeBookedByCompanyId?: string | null;
      bookedByCompanyId?: string | null;
    }
  ) => {
    if (!searchTerm || searchTerm.trim().length < 3) {
      inFlightAbortRef.current?.abort();
      inFlightAbortRef.current = null;
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

    // Abort any in-flight request from a prior keystroke
    inFlightAbortRef.current?.abort();
    const abortController = new AbortController();
    inFlightAbortRef.current = abortController;
    const signal = abortController.signal;

    console.log("[useOrdersSearch] Starting ids+hydrate search for:", term);
    const t0 = performance.now();

    setIsSearching(true);
    setSearchError(null);

    try {
      queryClient.cancelQueries({ queryKey: ["orders", "search"] });

      // Stage 1: get matching ids only
      const idsRes: any = await (supabase.rpc("search_orders_ids" as any, {
        p_term: term,
        p_booked_by: options?.bookedBy ?? null,
        p_dispatcher_user_id: options?.dispatcherUserId ?? null,
        p_excluded_booked_by_company_id: options?.excludeBookedByCompanyId ?? null,
        p_booked_by_company_id: options?.bookedByCompanyId ?? null,
        p_limit: 50,
      }) as any).abortSignal(signal);

      if (signal.aborted || latestSearchKeyRef.current !== searchKey) {
        console.log("[useOrdersSearch] Discarding stale ids response for:", searchKey);
        return;
      }
      if (idsRes.error) throw idsRes.error;

      const ids = (idsRes.data as string[]) || [];
      console.log(`[useOrdersSearch] ids stage: ${ids.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);

      if (ids.length === 0) {
        queryClient.setQueryData(newQueryKey, []);
        return;
      }

      // Stage 2: hydrate full payload
      const hydrateRes: any = await (supabase.rpc("search_orders_hydrate" as any, {
        p_ids: ids,
      }) as any).abortSignal(signal);

      if (signal.aborted || latestSearchKeyRef.current !== searchKey) {
        console.log("[useOrdersSearch] Discarding stale hydrate response for:", searchKey);
        return;
      }
      if (hydrateRes.error) throw hydrateRes.error;

      const rows = (hydrateRes.data as any[]) || [];
      const transformed = transformOrders(rows);
      console.log(`[useOrdersSearch] hydrate complete: ${transformed.length} rows total ${(performance.now() - t0).toFixed(0)}ms`);
      queryClient.setQueryData(newQueryKey, transformed);
    } catch (err: any) {
      if (err?.name === "AbortError" || signal.aborted) {
        return;
      }
      if (latestSearchKeyRef.current === searchKey) {
        console.error("[useOrdersSearch] Error:", err);

        setSearchError(err instanceof Error ? err : new Error("Search failed"));
        queryClient.setQueryData(newQueryKey, null);
      }
    } finally {
      if (latestSearchKeyRef.current === searchKey) {
        setIsSearching(false);
      }
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
    }
  }, [queryClient]); // Stable deps - no queryKey!

  const clearSearch = useCallback(() => {
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
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
