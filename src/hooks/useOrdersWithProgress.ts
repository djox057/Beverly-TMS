import { useAuthContext } from "@/contexts/AuthContext";
import { readArchivePage, readOrderRows, type CachedArchiveBlock } from "../../supabase/functions/_shared/analyticsOrderColumns";
import { useSupervisorTeam } from "./useSupervisorTeam";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";
import { traceFetch } from "@/utils/fetchTrace";

interface LoadingProgress {
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingMore: boolean;
  isComplete: boolean;
  usePrecomputed: boolean;
}

interface UseOrdersWithProgressOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
  requireAllOrders?: boolean;
}

// Entries expire with their React Query owner and are never persisted across browser sessions.
const archiveSnapshots = new WeakMap<object, Map<number, CachedArchiveBlock[]>>();
const MAX_ARCHIVE_CACHE_CHARS = 16 * 1024 * 1024;
const LOCKED_BATCH_SIZE = 1000;
const LOCKED_FETCH_CONCURRENCY = 4;

const perfLogEnabled = () =>
  typeof window !== "undefined" &&
  localStorage.getItem("analytics_perf_log") === "true";

const plog = (...args: unknown[]) => {
  if (perfLogEnabled()) console.log("[analytics-perf]", ...args);
};

/**
 * Hook for Analytics page that loads orders with progress tracking.
 * When precomputed mode is active (default), only fetches unlocked orders.
 * Locked order analytics come from precomputed aggregates instead.
 * Set localStorage.analytics_use_raw_orders = "true" to restore full fetch.
 */
export function useOrdersWithProgress(options?: UseOrdersWithProgressOptions) {
  const queryClient = useQueryClient();
  const { user, roles } = useAuthContext();
  const { cacheScope: supervisorCacheScope } = useSupervisorTeam(false);

  // Feature flag: skip locked orders when precomputed aggregates are available
  // Temporarily disabled — defaulting to raw order fetching (all orders loaded).
  // Set localStorage.analytics_use_precomputed = "true" to re-enable precomputed mode.
  const usePrecomputed = typeof window !== "undefined"
    && !options?.requireAllOrders
    && localStorage.getItem("analytics_use_precomputed") === "true";

  const [progress, setProgress] = useState<LoadingProgress>({
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    lockedTotal: null,
    isLoadingMore: false,
    isComplete: false,
    usePrecomputed,
  });

  const isMountedRef = useRef(true);

  const bookedBy = options?.bookedBy ?? null;
  const dispatcherUserId = options?.dispatcherUserId ?? null;
  const queryKey = ["orders", "analytics-full", user?.id, [...roles].sort(), bookedBy, dispatcherUserId,
    supervisorCacheScope, usePrecomputed ? "precomputed" : "raw"];

  useOrdersRealtime();

  useEffect(() => {
    traceFetch("useOrdersWithProgress", "mount");
    return () => traceFetch("useOrdersWithProgress", "unmount");
  }, []);

  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!dispatcherUserId) return [];
    const { data: assignedDrivers } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", dispatcherUserId);
    return (assignedDrivers || []).map(d => d.id);
  }, [dispatcherUserId]);

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const startTime = Date.now();
      console.log(`[OrdersWithProgress] Starting fetch (precomputed=${usePrecomputed})...`);
      const tFetchStart = performance.now();
      let tTransformMs = 0;

      setProgress({
        unlockedLoaded: 0,
        unlockedTotal: null,
        lockedLoaded: 0,
        lockedTotal: null,
        isLoadingMore: true,
        isComplete: false,
        usePrecomputed,
      });

      const dispatcherDriverIds = await fetchDispatcherDriverIds();
      signal.throwIfAborted();

      // Phase 1: Fetch ALL unlocked orders (always)
      const tUnlockedStart = performance.now();
      const { data: unlockedResponse, error: unlockedError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        {
          signal,
          body: {
            bookedBy,
            dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
            fields: "analytics",
            orderFormat: "columns-v1",
            compactChildren: true,
          },
        }
      );

      signal.throwIfAborted();
      if (unlockedError) {
        console.error("[OrdersWithProgress] Unlocked Edge Function error:", unlockedError);
        throw unlockedError;
      }

      const allUnlockedOrders = readOrderRows(unlockedResponse);
      const totalUnlockedCount = unlockedResponse.count ?? null;
      plog(`unlocked fetch: ${allUnlockedOrders.length} rows in ${(performance.now() - tUnlockedStart).toFixed(0)}ms (server reported ${unlockedResponse?.fetchTimeMs}ms)`);

      // Transform unlocked immediately so the cost overlaps with locked-batch network time.
      const tTUnlockedStart = performance.now();
      const transformedUnlocked = transformOrders(allUnlockedOrders);
      tTransformMs += performance.now() - tTUnlockedStart;

      if (isMountedRef.current) {
        setProgress(prev => ({
          ...prev,
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
        }));
      }

      // Phase 2: Fetch locked orders — SKIP when precomputed mode is active
      if (usePrecomputed) {
        console.log("[OrdersWithProgress] Precomputed mode: skipping locked order fetch");

        const totalTime = Date.now() - startTime;
        if (isMountedRef.current) {
          setProgress({
            unlockedLoaded: allUnlockedOrders.length,
            unlockedTotal: totalUnlockedCount,
            lockedLoaded: 0,
            lockedTotal: 0,
            isLoadingMore: false,
            isComplete: true,
            usePrecomputed: true,
          });
        }

        const mergedOrders = transformedUnlocked;
        console.log(`[OrdersWithProgress] ✅ COMPLETE (precomputed): ${mergedOrders.length} unlocked orders in ${totalTime}ms`);

        queryClient.setQueryData(["orders"], mergedOrders);
        return mergedOrders;
      }

      // --- Locked order fetch: worker-pool, per-batch transform ---
      const tLockedStart = performance.now();
      const transformedLocked: any[] = [];
      let lockedRowsFetched = 0;
      let totalLockedCount: number | null = null;

      const owner = queryClient.getQueryCache().find({ queryKey, exact: true });
      const previousArchive = owner && archiveSnapshots.get(owner);
      const nextArchive = new Map<number, CachedArchiveBlock[]>();
      let retainedChars = 0;

      const fetchLockedBatch = async (offset: number) => {
        const previous = previousArchive?.get(offset) ?? [];
        const body = {
          bookedBy,
          dispatcherDriverIds: dispatcherUserId ? dispatcherDriverIds : [],
          offset,
          limit: LOCKED_BATCH_SIZE,
          fields: "analytics",
          orderFormat: "columns-v1",
        };
        const { data: resp, error } = await supabase.functions.invoke("get-all-locked-orders", {
          signal,
          body: { ...body, knownArchiveTags: previous.map(block => block.tag) },
        });
        signal.throwIfAborted();
        if (error) throw error;
        let page: ReturnType<typeof readArchivePage>;
        try {
          page = readArchivePage(resp, previous);
        } catch (decodeError) {
          if (!previous.length || !resp?.archiveTags) throw decodeError;
          // Recover this page with a complete response if the manifest cannot be reconstructed.
          const full = await supabase.functions.invoke("get-all-locked-orders", { body, signal });
          signal.throwIfAborted();
          if (full.error) throw full.error;
          return { ...full.data, orders: readOrderRows(full.data) };
        }
        const { orders, blocks } = page;
        const chars = blocks.reduce((sum, block) => sum + block.json.length, 0);
        if (blocks.length && retainedChars + chars <= MAX_ARCHIVE_CACHE_CHARS) {
          nextArchive.set(offset, blocks);
          retainedChars += chars;
        }
        return { ...resp, orders };
      };

      // Bootstrap with first batch to learn totalCount.
      const firstResp = await fetchLockedBatch(0);
      if (firstResp?.orders?.length) {
        const tT = performance.now();
        transformedLocked.push(...transformOrders(firstResp.orders));
        tTransformMs += performance.now() - tT;
        lockedRowsFetched += firstResp.orders.length;
      }
      totalLockedCount = firstResp?.totalCount ?? null;
      plog(`locked first batch: ${firstResp?.orders?.length ?? 0} rows, totalCount=${totalLockedCount}`);

      if (isMountedRef.current) {
        setProgress(prev => ({
          ...prev,
          lockedLoaded: lockedRowsFetched,
          lockedTotal: totalLockedCount,
        }));
      }

      // Plan remaining offsets. If totalCount missing, fall back to sequential length-based pagination.
      if (totalLockedCount !== null) {
        const offsets: number[] = [];
        for (let off = LOCKED_BATCH_SIZE; off < totalLockedCount; off += LOCKED_BATCH_SIZE) {
          offsets.push(off);
        }
        plog(`locked plan: ${offsets.length} more batches at concurrency ${LOCKED_FETCH_CONCURRENCY}`);

        // Worker pool
        let cursor = 0;
        const worker = async () => {
          while (cursor < offsets.length) {
            const myIndex = cursor++;
            const off = offsets[myIndex];
            const resp = await fetchLockedBatch(off);
            const batch = resp?.orders ?? [];
            if (batch.length) {
              const tT = performance.now();
              const tBatch = transformOrders(batch);
              tTransformMs += performance.now() - tT;
              transformedLocked.push(...tBatch);
              lockedRowsFetched += batch.length;
              if (isMountedRef.current) {
                setProgress(prev => ({
                  ...prev,
                  lockedLoaded: lockedRowsFetched,
                  lockedTotal: totalLockedCount,
                }));
              }
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(LOCKED_FETCH_CONCURRENCY, offsets.length) }, worker)
        );
      } else {
        // Fallback: server didn't report totalCount — sequential, trust hasMore.
        let off = LOCKED_BATCH_SIZE;
        let attempts = 0;
        const MAX_ATTEMPTS = 200;
        let hasMore = !!firstResp?.hasMore;
        while (hasMore && attempts < MAX_ATTEMPTS) {
          attempts++;
          const resp = await fetchLockedBatch(off);
          const batch = resp?.orders ?? [];
          if (batch.length) {
            const tT = performance.now();
            transformedLocked.push(...transformOrders(batch));
            tTransformMs += performance.now() - tT;
            lockedRowsFetched += batch.length;
            off += batch.length;
            if (isMountedRef.current) {
              setProgress(prev => ({ ...prev, lockedLoaded: lockedRowsFetched, lockedTotal: null }));
            }
          }
          hasMore = !!resp?.hasMore && batch.length > 0;
        }
      }

      plog(`locked total: ${lockedRowsFetched} rows in ${(performance.now() - tLockedStart).toFixed(0)}ms`);

      signal.throwIfAborted();
      // Dedupe: unlocked always wins. Build a set of unlocked ids and drop locked dupes.
      const unlockedIds = new Set(transformedUnlocked.map((o: any) => o.id));
      const dedupedLocked = transformedLocked.filter((o: any) => !unlockedIds.has(o.id));
      dedupedLocked.sort((a: any, b: any) => {
        const da = a.pickupDatetime || "";
        const db = b.pickupDatetime || "";
        return db.localeCompare(da);
      });

      const totalTime = Date.now() - startTime;
      if (isMountedRef.current) {
        setProgress({
          unlockedLoaded: allUnlockedOrders.length,
          unlockedTotal: totalUnlockedCount,
          lockedLoaded: dedupedLocked.length,
          lockedTotal: totalLockedCount,
          isLoadingMore: false,
          isComplete: true,
          usePrecomputed: false,
        });
      }

      const mergedOrders = [...transformedUnlocked, ...dedupedLocked];
      if (owner) archiveSnapshots.set(owner, nextArchive);
      plog(`pipeline total: fetch+transform=${(performance.now() - tFetchStart).toFixed(0)}ms, transform-only=${tTransformMs.toFixed(0)}ms, merged=${mergedOrders.length}`);
      console.log(`[OrdersWithProgress] ✅ COMPLETE: ${transformedUnlocked.length} unlocked + ${dedupedLocked.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      queryClient.setQueryData(["orders"], mergedOrders);
      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize progress from cached data if available
  useEffect(() => {
    if (query.data && !progress.isComplete && !query.isFetching) {
      const unlockedCount = query.data.filter((o: any) => !o.locked).length;
      const lockedCount = query.data.filter((o: any) => o.locked).length;

      setProgress({
        unlockedLoaded: unlockedCount,
        unlockedTotal: unlockedCount,
        lockedLoaded: lockedCount,
        lockedTotal: lockedCount,
        isLoadingMore: false,
        isComplete: true,
        usePrecomputed,
      });
    }
  }, [query.data, query.isFetching, progress.isComplete]);

  return {
    ...query,
    progress,
  };
}
