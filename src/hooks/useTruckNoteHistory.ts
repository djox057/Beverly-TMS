import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NoteHistoryEntry {
  id: string;
  note: string | null;
  edited_by: string | null;
  edited_at: string;
  editor_name: string | null;
  editor_email: string | null;
}

export const useTruckNoteHistory = (driverId: string | null) => {
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
  });
};
