import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EldDay } from '@/lib/eld';
import { useEldDay } from './useEld';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'worker' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => mock.rpc(...args) } }));
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => mock.toast(...args) }));
const date = '2026-10-21';
const fixture = (): EldDay => ({ today: date, can_manage: true, can_work: true,
  workers: [{ user_id: 'worker', name: 'ELD One' }, { user_id: 'other', name: 'ELD Two' }],
  checks: ['one', 'two'].map(id => ({ id, driver_id: `driver-${id}`, driver_name: `Driver ${id}`, truck_number: id, work_date: date, worker_id: 'worker', worker_name: 'ELD One', yesterday_log: false, forms: false, pti: false, comment: '', updated_by: null, updated_at: date })),
  tasks: [{ id: 'task', work_date: date, worker_id: 'worker', description: 'Review connection', completed: false, completed_by: null, completed_at: null, created_by: 'worker', created_at: date, updated_at: date }],
});
function deferred() {
  let resolve!: (value: { data: null; error: { message: string } | null }) => void;
  const promise = new Promise<{ data: null; error: { message: string } | null }>(done => { resolve = done; });
  return { promise, succeed: () => resolve({ data: null, error: null }), fail: () => resolve({ data: null, error: { message: 'Save failed' } }) };
}
const clients: QueryClient[] = [];
const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ workDate }) => useEldDay(workDate), { wrapper, initialProps: { workDate: date } });
  await waitFor(() => expect(hook.result.current.day.isSuccess).toBe(true));
  return { ...hook, client };
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockImplementation((name: string) => {
    if (name === 'eld_get_day') return { abortSignal: () => Promise.resolve({ data: fixture(), error: null }) };
    return Promise.resolve({ data: null, error: null });
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('ELD saves without blocking the roster', () => {
  it('updates a check immediately while its RPC is pending, without reloading the roster', async () => {
    const pending = deferred();
    const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_save_check' ? pending.promise : base(name, ...args));
    const { result } = await mount();
    act(() => result.current.saveCheck.mutate({ id: 'one', field: 'pti', value: true }));
    await waitFor(() => expect(result.current.day.data?.checks[0].pti).toBe(true));
    expect(result.current.pendingCheckKeys.has('one:pti')).toBe(true);
    expect(result.current.pendingCheckKeys.has('one:forms')).toBe(false);
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'eld_get_day')).toHaveLength(1);
    await act(async () => pending.succeed());
    await waitFor(() => expect(result.current.hasPendingWrites).toBe(false));
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'eld_get_day')).toHaveLength(1);
  });
  it('rolls back only the failed field and retains a concurrent successful change', async () => {
    const failed = deferred(); const successful = deferred();
    const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, args: { p_field: string }) => name === 'eld_save_check' ? args.p_field === 'forms' ? failed.promise : successful.promise : base(name, args));
    const { result } = await mount();
    act(() => {
      result.current.saveCheck.mutate({ id: 'one', field: 'forms', value: true });
      result.current.saveCheck.mutate({ id: 'one', field: 'pti', value: true });
    });
    await waitFor(() => expect(result.current.day.data?.checks[0]).toMatchObject({ forms: true, pti: true }));
    await act(async () => { successful.succeed(); failed.fail(); });
    await waitFor(() => expect(result.current.hasPendingWrites).toBe(false));
    expect(result.current.day.data?.checks[0]).toMatchObject({ forms: false, pti: true });
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
  it('does not roll an older failed save over a newer change to the same field', async () => {
    const old = deferred(); const latest = deferred(); let calls = 0;
    const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_save_check' ? ++calls === 1 ? old.promise : latest.promise : base(name, ...args));
    const { result } = await mount();
    act(() => result.current.saveCheck.mutate({ id: 'one', field: 'comment', value: 'First comment' }));
    await waitFor(() => expect(result.current.day.data?.checks[0].comment).toBe('First comment'));
    act(() => result.current.saveCheck.mutate({ id: 'one', field: 'comment', value: 'Newer comment' }));
    await waitFor(() => expect(result.current.day.data?.checks[0].comment).toBe('Newer comment'));
    await act(async () => { latest.succeed(); old.fail(); });
    await waitFor(() => expect(result.current.hasPendingWrites).toBe(false));
    expect(result.current.day.data?.checks[0].comment).toBe('Newer comment');
  });
  it('keeps an old date failure out of the newly selected date', async () => {
    const pending = deferred(); const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_save_check' ? pending.promise : base(name, ...args));
    const { result, rerender } = await mount();
    act(() => result.current.saveCheck.mutate({ id: 'one', field: 'forms', value: true }));
    await waitFor(() => expect(result.current.day.data?.checks[0].forms).toBe(true));
    rerender({ workDate: '2026-10-20' });
    await waitFor(() => expect(result.current.day.isSuccess).toBe(true));
    await act(async () => pending.fail());
    expect(result.current.day.data?.checks[0].forms).toBe(false);
  });
  it('updates assignments and task completion without a roster fetch', async () => {
    const pending = deferred(); const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_manage' ? pending.promise : base(name, ...args));
    const { result } = await mount();
    act(() => {
      result.current.manage.mutate({ action: 'assign', payload: { driver_id: 'driver-one', worker_id: 'other' } });
      result.current.manage.mutate({ action: 'complete_task', payload: { id: 'task', completed: true } });
    });
    await waitFor(() => expect(result.current.day.data?.checks[0].worker_name).toBe('ELD Two'));
    expect(result.current.day.data?.tasks[0]).toMatchObject({ completed: true, completed_by: 'worker' });
    expect(result.current.pendingAssignments.has('driver-one')).toBe(true);
    expect(result.current.pendingTasks.has('task')).toBe(true);
    await act(async () => pending.succeed());
    await waitFor(() => expect(result.current.hasPendingWrites).toBe(false));
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'eld_get_day')).toHaveLength(1);
  });
  it('rolls back a failed assignment and task without reverting a saved checklist field', async () => {
    const pending = deferred(); const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_manage' ? pending.promise : base(name, ...args));
    const { result } = await mount();
    act(() => {
      result.current.manage.mutate({ action: 'assign', payload: { driver_id: 'driver-one', worker_id: 'other' } });
      result.current.manage.mutate({ action: 'complete_task', payload: { id: 'task', completed: true } });
      result.current.saveCheck.mutate({ id: 'one', field: 'forms', value: true });
    });
    await waitFor(() => expect(result.current.day.data?.checks[0]).toMatchObject({ worker_id: 'other', forms: true }));
    await act(async () => pending.fail());
    await waitFor(() => expect(result.current.hasPendingWrites).toBe(false));
    expect(result.current.day.data?.checks[0]).toMatchObject({ worker_id: 'worker', worker_name: 'ELD One', forms: true });
    expect(result.current.day.data?.tasks[0]).toMatchObject({ completed: false, completed_at: null });
  });
  it('waits for concurrent writes before fetching a newly added task', async () => {
    const pending = deferred(); const base = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'eld_save_check' ? pending.promise : base(name, ...args));
    const { result } = await mount();
    act(() => result.current.saveCheck.mutate({ id: 'one', field: 'forms', value: true }));
    await waitFor(() => expect(result.current.pendingCheckKeys.has('one:forms')).toBe(true));
    await act(async () => result.current.manage.mutateAsync({ action: 'add_task', payload: { work_date: date, worker_id: 'worker', description: 'New task' } }));
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'eld_get_day')).toHaveLength(1);
    await act(async () => pending.succeed());
    await waitFor(() => expect(mock.rpc.mock.calls.filter(([name]) => name === 'eld_get_day')).toHaveLength(2));
  });
});
