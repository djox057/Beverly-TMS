import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export interface ChristmasNote {
  id: string;
  driver_id: string;
  truck_id: string | null;
  dispatcher_id: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  driver_name?: string;
  truck_number?: string;
  dispatcher_name?: string;
}

export const useChristmasNotes = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  const { data: christmasNotes = [], isLoading, error } = useQuery({
    queryKey: ["christmas-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("christmas_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch related data
      if (!data || data.length === 0) return [];
      
      const driverIds = [...new Set(data.map(n => n.driver_id))];
      const truckIds = [...new Set(data.filter(n => n.truck_id).map(n => n.truck_id))];
      const dispatcherIds = [...new Set(data.map(n => n.dispatcher_id))];
      
      const [driversRes, trucksRes, profilesRes] = await Promise.all([
        supabase.from("drivers").select("id, name").in("id", driverIds),
        truckIds.length > 0 
          ? supabase.from("trucks").select("id, truck_number").in("id", truckIds)
          : Promise.resolve({ data: [] }),
        supabase.from("profiles").select("user_id, full_name").in("user_id", dispatcherIds),
      ]);
      
      const driversMap = new Map((driversRes.data || []).map(d => [d.id, d.name]));
      const trucksMap = new Map((trucksRes.data || []).map(t => [t.id, t.truck_number]));
      const profilesMap = new Map((profilesRes.data || []).map(p => [p.user_id, p.full_name]));
      
      return data.map(note => ({
        ...note,
        driver_name: driversMap.get(note.driver_id) || "Unknown",
        truck_number: note.truck_id ? trucksMap.get(note.truck_id) : null,
        dispatcher_name: profilesMap.get(note.dispatcher_id) || "Unknown",
      })) as ChristmasNote[];
    },
    staleTime: 30000,
  });

  // Get note for a specific driver (for the current dispatcher only)
  const getNoteForDriver = (driverId: string): ChristmasNote | undefined => {
    return christmasNotes.find(n => n.driver_id === driverId && n.dispatcher_id === user?.id);
  };

  // Check if dispatcher has a note without text for this driver (show snowflake)
  const shouldShowSnowflake = (driverId: string, dispatcherId: string): boolean => {
    if (user?.id !== dispatcherId) return false;
    const note = christmasNotes.find(n => n.driver_id === driverId && n.dispatcher_id === user?.id);
    return !note || !note.note || note.note.trim() === "";
  };

  const upsertNote = useMutation({
    mutationFn: async ({ 
      driverId, 
      truckId, 
      note 
    }: { 
      driverId: string; 
      truckId: string | null;
      note: string;
    }) => {
      if (!user?.id) throw new Error("No user");
      
      // Check if note exists
      const existingNote = christmasNotes.find(n => n.driver_id === driverId && n.dispatcher_id === user.id);
      
      if (existingNote) {
        const { error } = await supabase
          .from("christmas_notes")
          .update({ note, truck_id: truckId })
          .eq("id", existingNote.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("christmas_notes")
          .insert({
            driver_id: driverId,
            truck_id: truckId,
            dispatcher_id: user.id,
            note,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["christmas-notes"] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from("christmas_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["christmas-notes"] });
    },
  });

  return {
    christmasNotes,
    isLoading,
    error,
    getNoteForDriver,
    shouldShowSnowflake,
    upsertNote,
    deleteNote,
  };
};
