import { useMemo, useRef } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { EldCheck, EldCheckField, EldDay } from '@/lib/eld';

type CheckChange = { id: string; field: EldCheckField; value: string | boolean };
type ManageChange =
  | { action: 'assign'; payload: { driver_id: string; worker_id: string | null } }
  | { action: 'add_task'; payload: { work_date: string; worker_id: string; description: string } }
  | { action: 'complete_task'; payload: { id: string; completed: boolean } };
type SaveContext = { key: QueryKey; date: string; rollback?: () => void };

export function useEldDay(date: string) {
  const { user } = useAuthContext();
  const client = useQueryClient();
  const refreshDates = useRef(new Set<string>());
  const revisions = useRef(new Map<string, number>());
  const writeKey = ['eld-write', user?.id];
  const key = ['eld-day', user?.id, date];
  const day = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('eld_get_day', { p_date: date }).abortSignal(signal);
      if (error) throw error;
      refreshDates.current.delete(date);
      return data as unknown as EldDay;
    },
    refetchInterval: () => client.isMutating({ mutationKey: writeKey }) ? false : 60_000,
    refetchOnWindowFocus: () => !client.isMutating({ mutationKey: writeKey }),
  });
  const activityChanged = () => { void client.invalidateQueries({ queryKey: ['eld-activity', user?.id] }); };
  // Only adding a side task requires fetching its generated ID. Defer that read
  // until writes finish so it cannot overwrite another field's optimistic value.
  const settled = () => {
    if (client.isMutating({ mutationKey: writeKey }) !== 1) return;
    for (const workDate of refreshDates.current) {
      void client.invalidateQueries({ queryKey: ['eld-day', user?.id, workDate], exact: true });
    }
  };
  const reportError = (error: Error, _variables: unknown, context?: SaveContext) => {
    context?.rollback?.();
    toast({ title: 'Unable to save ELD work', description: error.message, variant: 'destructive' });
  };
  const revision = (entity: string) => {
    const next = (revisions.current.get(entity) ?? 0) + 1;
    revisions.current.set(entity, next);
    return () => revisions.current.get(entity) === next;
  };
  const saveCheck = useMutation<void, Error, CheckChange, SaveContext>({
    mutationKey: [...writeKey, date, 'check'],
    mutationFn: async ({ id, field, value }: CheckChange) => {
      const { error } = await supabase.rpc('eld_save_check', { p_id: id, p_field: field, p_value: value });
      if (error) throw error;
    },
    onMutate: async ({ id, field, value }): Promise<SaveContext> => {
      const isLatest = revision(`${date}:check:${id}:${field}`);
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<EldDay>(key)?.checks.find(row => row.id === id)?.[field];
      const patch = (next: string | boolean) => client.setQueryData<EldDay>(key, data => data && ({
        ...data, checks: data.checks.map(row => row.id === id ? { ...row, [field]: next } : row),
      }));
      patch(value);
      return { key, date, rollback: () => { if (isLatest() && previous !== undefined) patch(previous); } };
    },
    onSuccess: activityChanged,
    onError: reportError,
    onSettled: settled,
  });
  const manage = useMutation<void, Error, ManageChange, SaveContext>({
    mutationKey: [...writeKey, date, 'manage'],
    mutationFn: async ({ action, payload }: ManageChange) => {
      const { error } = await supabase.rpc('eld_manage', { p_action: action, p_payload: payload });
      if (error) throw error;
    },
    onMutate: async (change): Promise<SaveContext> => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const data = client.getQueryData<EldDay>(key);
      if (change.action === 'assign') {
        const { driver_id, worker_id } = change.payload;
        const isLatest = revision(`${date}:assign:${driver_id}`);
        const previous = data?.checks.find(row => row.driver_id === driver_id);
        const patch = (values: Pick<EldCheck, 'worker_id' | 'worker_name'>) => client.setQueryData<EldDay>(key, current => current && ({
          ...current, checks: current.checks.map(row => row.driver_id === driver_id ? { ...row, ...values } : row),
        }));
        patch({ worker_id, worker_name: data?.workers.find(worker => worker.user_id === worker_id)?.name ?? null });
        return { key, date, rollback: () => { if (isLatest() && previous) patch({ worker_id: previous.worker_id, worker_name: previous.worker_name }); } };
      }
      if (change.action === 'complete_task') {
        const { id, completed } = change.payload;
        const isLatest = revision(`${date}:task:${id}`);
        const previous = data?.tasks.find(task => task.id === id);
        const patch = (values: { completed: boolean; completed_by: string | null; completed_at: string | null }) => client.setQueryData<EldDay>(key, current => current && ({
          ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, ...values } : task),
        }));
        patch({ completed, completed_by: completed ? user?.id ?? null : null, completed_at: completed ? new Date().toISOString() : null });
        return { key, date, rollback: () => { if (isLatest() && previous) patch({ completed: previous.completed, completed_by: previous.completed_by, completed_at: previous.completed_at }); } };
      }
      return { key, date };
    },
    onSuccess: (_data, change, context) => {
      activityChanged();
      if (change.action === 'add_task') refreshDates.current.add(context.date);
    },
    onError: reportError,
    onSettled: settled,
  });
  const pendingChecks = useMutationState({
    filters: { mutationKey: [...writeKey, date, 'check'], status: 'pending' },
    select: mutation => mutation.state.variables as CheckChange,
  });
  const pendingChanges = useMutationState({
    filters: { mutationKey: [...writeKey, date, 'manage'], status: 'pending' },
    select: mutation => mutation.state.variables as ManageChange,
  });
  const pendingCheckKeys = useMemo(() => new Set(pendingChecks.map(change => `${change.id}:${change.field}`)), [pendingChecks]);
  const pendingAssignments = useMemo(() => new Set(pendingChanges.flatMap(change => change.action === 'assign' ? [change.payload.driver_id] : [])), [pendingChanges]);
  const pendingTasks = useMemo(() => new Set(pendingChanges.flatMap(change => change.action === 'complete_task' ? [change.payload.id] : [])), [pendingChanges]);
  return { day, saveCheck, manage, pendingCheckKeys, pendingAssignments, pendingTasks,
    addingTask: pendingChanges.some(change => change.action === 'add_task'),
    hasPendingWrites: !!(pendingChecks.length || pendingChanges.length) };
}
