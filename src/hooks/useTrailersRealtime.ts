import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Realtime subscription for the trailers list.
 *
 * Perf notes (2026-09-02): the previous version fired one `trailers` fetch +
 * one `trucks` fetch *per affected trailer, per event*, inside a sequential
 * `for` loop with no debounce — and it reacted to EVERY `trucks` UPDATE,
 * including mileage/location/distance syncs that never touch `trailer_id`.
 * With ~1,745 truck PATCHes/hour that loop alone produced thousands of
 * pointless REST calls per hour.
 *
 * Now: events are coalesced into a deduplicated ID set, flushed once per
 * 1s debounce window, and fetched with a single `.in()` pair of queries.
 * `trucks` events are ignored unless `trailer_id` actually changed
 * (`trucks` has REPLICA IDENTITY FULL, so `payload.old` carries the old value;
 * if it does not, we fall back to treating the event as relevant).
 */
export function useTrailersRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["trailers", "v2"];

    // ─── Debounce state ───
    const pendingTrailerIds = new Set<string>();
    const pendingDeletes = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isFlushing = false;

    /**
     * Batch-fetch trailers with their assigned trucks.
     * The list query (`useTrailers`) caches the full trailer row, so the
     * trailer select stays `*` for shape parity; the trucks join uses the
     * three columns the list actually renders.
     */
    const fetchTrailersBatch = async (trailerIds: string[]) => {
      if (trailerIds.length === 0) return [];

      const [{ data: trailers, error }, { data: trucks }] = await Promise.all([
        supabase.from("trailers").select("*").in("id", trailerIds),
        supabase
          .from("trucks")
          .select("id, truck_number, trailer_id")
          .in("trailer_id", trailerIds),
      ]);

      if (error || !trailers || trailers.length === 0) {
        if (error) console.error("[TrailersRT] Batch fetch error:", error);
        return [];
      }

      const trucksByTrailer = new Map<string, any[]>();
      for (const t of trucks || []) {
        if (!t.trailer_id) continue;
        const list = trucksByTrailer.get(t.trailer_id);
        if (list) list.push(t);
        else trucksByTrailer.set(t.trailer_id, [t]);
      }

      return trailers.map((trailer) => ({
        ...trailer,
        trucks: trucksByTrailer.get(trailer.id) || [],
      }));
    };

    const updateCache = (
      trailerId: string,
      transformedTrailer: any | null,
      isDelete = false
    ) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformedTrailer ? [transformedTrailer] : old;
        if (isDelete) return old.filter((t) => t.id !== trailerId);
        if (!transformedTrailer) return old;
        const idx = old.findIndex((t) => t.id === trailerId);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = transformedTrailer;
          return updated;
        }
        return [...old, transformedTrailer];
      });
    };

    const flushPending = async () => {
      if (isFlushing) return;
      isFlushing = true;

      const deleteIds = [...pendingDeletes];
      pendingDeletes.clear();
      const fetchIds = [...pendingTrailerIds].filter((id) => !deleteIds.includes(id));
      pendingTrailerIds.clear();

      try {
        for (const id of deleteIds) updateCache(id, null, true);
        if (fetchIds.length > 0) {
          const fetched = await fetchTrailersBatch(fetchIds);
          const fetchedIds = new Set(fetched.map((t: any) => t.id));
          for (const t of fetched) updateCache(t.id, t);
          // Rows that vanished (deleted or now invisible under RLS)
          for (const id of fetchIds) {
            if (!fetchedIds.has(id)) updateCache(id, null, true);
          }
        }
      } catch (err) {
        console.error("[TrailersRT] Flush error:", err);
      } finally {
        isFlushing = false;
        if (pendingTrailerIds.size > 0 || pendingDeletes.size > 0) scheduleFlush();
      }
    };

    const scheduleFlush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushPending, 1000);
    };

    const handleTrailerChange = (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRec = payload.new as any;
      const oldRec = payload.old as any;
      const trailerId = newRec?.id || oldRec?.id;
      if (!trailerId) return;
      if (payload.eventType === "DELETE") pendingDeletes.add(trailerId);
      else pendingTrailerIds.add(trailerId);
      scheduleFlush();
    };

    const handleTruckChange = (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const affected = affectedTrailerIdsFromTruckEvent(payload);
      if (affected.length === 0) return;
      for (const id of affected) pendingTrailerIds.add(id);
      scheduleFlush();
    };


    const channel = supabase
      .channel("trailers-realtime-advanced")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trailers" },
        handleTrailerChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        handleTruckChange
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isSubscribedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
