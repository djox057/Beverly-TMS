import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMatchedOrders, type MatchedOrder } from "@/lib/loadMatch/client";

const STALE_MS = 2 * 60 * 1000;

export const loadMatchesKey = (truckId: string | null | undefined) =>
  ["load-matches", truckId] as const;

/** Fetch matches for a single truck. `enabled` controls when the request fires. */
export function useMatchedOrders(truckId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: loadMatchesKey(truckId),
    queryFn: ({ signal }) => getMatchedOrders(truckId!, signal),
    enabled: !!truckId && enabled,
    staleTime: STALE_MS,
    retry: 1,
  });
}

/**
 * When `enabled` flips to true, prefetch one query per provided truckId.
 * Used by the dispatcher toggle to warm the cache for their fleet.
 */
export function usePrefetchTruckMatches(truckIds: string[], enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const unique = Array.from(new Set(truckIds.filter(Boolean)));
    for (const id of unique) {
      qc.prefetchQuery({
        queryKey: loadMatchesKey(id),
        queryFn: ({ signal }) => getMatchedOrders(id, signal),
        staleTime: STALE_MS,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, truckIds.join("|")]);
}

export type { MatchedOrder };