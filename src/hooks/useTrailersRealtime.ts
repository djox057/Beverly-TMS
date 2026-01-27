import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Hook that subscribes to real-time changes on trailers and related tables.
 * Uses setQueryData to patch cache directly - no full refetch needed.
 */
export function useTrailersRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Only subscribe once globally
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const QUERY_KEY = ["trailers", "v2"];

    // Fetch a single trailer with truck relationships (same shape as list query)
    const fetchSingleTrailer = async (trailerId: string) => {
      const { data: trailer, error } = await supabase
        .from("trailers")
        .select("*")
        .eq("id", trailerId)
        .maybeSingle();

      if (error) {
        console.error("[TrailersRealtime] Error fetching trailer:", error);
        return null;
      }

      if (!trailer) return null;

      // Fetch trucks that have this trailer assigned
      const { data: trucks } = await supabase
        .from("trucks")
        .select("id, truck_number, trailer_id")
        .eq("trailer_id", trailerId);

      return {
        ...trailer,
        trucks: trucks || [],
      };
    };

    // Update cache with the transformed trailer
    const updateCache = (
      trailerId: string,
      transformedTrailer: any | null,
      isDelete: boolean = false
    ) => {
      queryClient.setQueryData(QUERY_KEY, (old: any[] | undefined) => {
        if (!old) return isDelete ? old : transformedTrailer ? [transformedTrailer] : old;

        if (isDelete) {
          console.log(`[TrailersRealtime] Removing trailer ${trailerId} from cache`);
          return old.filter((t) => t.id !== trailerId);
        }

        if (!transformedTrailer) return old;

        const existingIndex = old.findIndex((t) => t.id === trailerId);
        if (existingIndex >= 0) {
          console.log(`[TrailersRealtime] Updating trailer ${trailerId} in cache`);
          const updated = [...old];
          updated[existingIndex] = transformedTrailer;
          return updated;
        } else {
          console.log(`[TrailersRealtime] Inserting new trailer ${trailerId} into cache`);
          return [...old, transformedTrailer];
        }
      });
    };

    // Handle trailer changes
    const handleTrailerChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const trailerId = newRecord?.id || oldRecord?.id;

      console.log(`[TrailersRealtime] Trailer ${eventType}:`, trailerId);

      if (eventType === "DELETE") {
        updateCache(oldRecord.id, null, true);
        return;
      }

      if (!trailerId) return;

      const fullTrailer = await fetchSingleTrailer(trailerId);
      if (!fullTrailer) {
        console.warn("[TrailersRealtime] Could not fetch trailer, falling back to invalidation");
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        return;
      }

      updateCache(trailerId, fullTrailer);
    };

    // Handle truck changes (affects trailer.trucks array)
    const handleTruckChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;

      // Find affected trailers (old and new trailer_id)
      const affectedTrailerIds = new Set<string>();
      if (newRecord?.trailer_id) affectedTrailerIds.add(newRecord.trailer_id);
      if (oldRecord?.trailer_id) affectedTrailerIds.add(oldRecord.trailer_id);

      console.log(`[TrailersRealtime] Truck change affecting trailers:`, [...affectedTrailerIds]);

      // Update each affected trailer
      for (const trailerId of affectedTrailerIds) {
        const fullTrailer = await fetchSingleTrailer(trailerId);
        if (fullTrailer) {
          updateCache(trailerId, fullTrailer);
        }
      }
    };

    // Create channel and subscribe
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
      .subscribe((status) => {
        console.log("[TrailersRealtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[TrailersRealtime] Unsubscribing from trailers channel");
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
