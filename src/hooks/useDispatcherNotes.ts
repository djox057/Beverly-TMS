import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DispatcherNote {
  id: string;
  dispatcher_id: string;
  date: string;
  note: string;
  color: 'red' | 'yellow' | 'green';
  created_at: string;
  updated_at: string;
  created_by: string;
}

const fetchDispatcherNotes = async (startDate?: string, endDate?: string): Promise<DispatcherNote[]> => {
  let query = supabase
    .from('dispatcher_notes')
    .select('*')
    .order('date', { ascending: false });

  if (startDate && endDate) {
    query = query.gte('date', startDate).lte('date', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as DispatcherNote[];
};

export const useDispatcherNotes = (startDate?: string, endDate?: string) => {
  const queryClient = useQueryClient();

  const { data: notes, isLoading, error } = useQuery({
    queryKey: ['dispatcher-notes', startDate, endDate],
    queryFn: () => fetchDispatcherNotes(startDate, endDate),
  });

  const upsertNote = useMutation({
    mutationFn: async (note: Omit<DispatcherNote, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('dispatcher_notes')
        .upsert({
          ...note,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatcher-notes'] });
      toast.success('Note saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save note');
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('dispatcher_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatcher-notes'] });
      toast.success('Note deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete note');
    },
  });

  return {
    notes: notes || [],
    isLoading,
    error,
    upsertNote,
    deleteNote,
  };
};
