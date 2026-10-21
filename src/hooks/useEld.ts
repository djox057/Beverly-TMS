import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import type { EldCheckField, EldDay } from '@/lib/eld';

export function useEldDay(date: string) {
  const { user } = useAuthContext();
  const client = useQueryClient();
  const day = useQuery({
    queryKey: ['eld-day', user?.id, date],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('eld_get_day', { p_date: date });
      if (error) throw error;
      return data as unknown as EldDay;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['eld-day', user?.id] }),
    client.invalidateQueries({ queryKey: ['eld-activity', user?.id] }),
  ]);
  const onError = (error: Error) => toast({ title: 'Unable to save ELD work', description: error.message, variant: 'destructive' });
  const saveCheck = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: EldCheckField; value: string | boolean }) => {
      const { error } = await supabase.rpc('eld_save_check', { p_id: id, p_field: field, p_value: value });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });
  const manage = useMutation({
    mutationFn: async ({ action, payload }: { action: 'assign' | 'add_task' | 'complete_task'; payload: Json }) => {
      const { error } = await supabase.rpc('eld_manage', { p_action: action, p_payload: payload });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });
  return { day, saveCheck, manage };
}
