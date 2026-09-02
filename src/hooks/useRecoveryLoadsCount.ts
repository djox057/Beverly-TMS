import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RecoveryBadge {
  count: number;
  hasMine: boolean;
}

/**
 * Sidebar badge for active recovery loads.
 *
 * Perf notes (2026-09-02): this hook previously invalidated itself on EVERY
 * `orders` realtime change AND polled every 30s AND downloaded every matching
 * row to count them client-side. That single query was 9,512 REST calls/hour
 * (≈4.4M lifetime calls) — the highest-volume request shape in the project.
 *
 * It now calls one aggregate RPC (`get_recovery_loads_badge`) that returns the
 * total and "is one of them mine" from a single index scan
 * (Index Scan using idx_orders_retrieval, 0.18ms — verified with
 * EXPLAIN ANALYZE, BUFFERS), and it no longer subscribes to realtime.
 *
 * Request budget: staleTime 60s + refetchInterval 90s means at most 2 requests
 * per minute per eligible tab, including focus refetches (a focus refetch is a
 * no-op while the data is still fresh, which is what throttles tab-switching).
 *
 * Tradeoff: bounded staleness — the badge can lag a new recovery load by up to
 * ~90 seconds. The RecoveryLoads page itself stays live via its own scoped
 * subscription.
 */
export const useRecoveryLoadsCount = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;

/**
 * Pure normalizer for the RPC payload (unit-tested).
 * The RPC returns a single row; PostgREST may hand it back as an object or as
 * a one-element array depending on the client version.
 */
export const normalizeBadgeRow = (data: unknown): RecoveryBadge => {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { total?: number | null; has_mine?: boolean | null }
    | null
    | undefined;
  return {
    count: row?.total ?? 0,
    hasMine: row?.has_mine ?? false,
  };
};

export const useRecoveryLoadsCount = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;

  return useQuery<RecoveryBadge>({
    queryKey: ["recovery-loads-count"],
    queryFn: async () => {
      // Identity is derived server-side from auth.uid(); nothing is sent from
      // the client, and the function runs SECURITY INVOKER so RLS still applies.
      const { data, error } = await supabase.rpc("get_recovery_loads_badge");

      if (error) {
        console.error("Error fetching recovery loads badge:", error);
        throw error;
      }

      return normalizeBadgeRow(data);
    },

    enabled,
    staleTime: 60000,
    refetchInterval: enabled ? 90000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
};
