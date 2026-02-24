import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface NoteHistoryEntry {
  id: string;
  note: string | null;
  edited_by: string | null;
  edited_at: string;
  editor_name: string | null;
  editor_email: string | null;
}

export const useTruckNoteHistory = (driverId: string | null) => {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Live updates while the dialog is open: truck_note_history is append-only (INSERT per edit)
  useEffect(() => {
    if (!driverId) return;

    // Ensure we never keep a subscription for the wrong driver
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`truck-note-history-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "truck_note_history",
          filter: `driver_id=eq.${driverId}`,
        },
        async (payload) => {
          const newId = (payload.new as any)?.id as string | undefined;
          if (!newId) {
            queryClient.invalidateQueries({ queryKey: ["truck-note-history", driverId] });
            return;
          }

          // Fetch the new row with editor info (join) and patch cache directly.
          const { data, error } = await supabase
            .from("truck_note_history")
            .select(
              `
              id,
              note,
              edited_by,
              edited_at,
              profiles:edited_by (
                full_name,
                email
              )
            `,
            )
            .eq("id", newId)
            .maybeSingle();

          if (error || !data) {
            queryClient.invalidateQueries({ queryKey: ["truck-note-history", driverId] });
            return;
          }

          const mapped: NoteHistoryEntry = {
            id: data.id,
            note: (data as any).note,
            edited_by: (data as any).edited_by,
            edited_at: (data as any).edited_at,
            editor_name: (data as any).profiles?.full_name || null,
            editor_email: (data as any).profiles?.email || null,
          };

          queryClient.setQueryData<NoteHistoryEntry[]>(["truck-note-history", driverId], (old) => {
            const prev = Array.isArray(old) ? old : [];
            const deduped = prev.filter((e) => e.id !== mapped.id);
            return [mapped, ...deduped].slice(0, 7);
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [driverId, queryClient]);

  return useQuery({
    queryKey: ['truck-note-history', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('truck_note_history')
        .select(`
          id,
          note,
          edited_by,
          edited_at,
          profiles:edited_by (
            full_name,
            email
          )
        `)
        .eq('driver_id', driverId)
        .order('edited_at', { ascending: false })
        .limit(7);

      if (error) {
        console.error('Error fetching driver note history:', error);
        throw error;
      }

      console.log('Driver note history data:', data);

      return (data || []).map((entry: any) => ({
        id: entry.id,
        note: entry.note,
        edited_by: entry.edited_by,
        edited_at: entry.edited_at,
        editor_name: entry.profiles?.full_name || null,
        editor_email: entry.profiles?.email || null,
      })) as NoteHistoryEntry[];
    },
    enabled: !!driverId,
    staleTime: 0,
  });
};
