import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userId: 'admin' as string | null,
  shifts: [] as any[],
  weekend: [] as any[],
  scheduled: false,
  profileError: null as any,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ profile: { user_id: mock.userId } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const chain: any = {};
    for (const method of ['select', 'eq', 'in', 'limit', 'order', 'range']) chain[method] = () => chain;
    chain.then = (resolve: any, reject: any) => Promise.resolve({
      data: table === 'afterhours_schedule' ? (mock.scheduled ? [{ id: 'schedule' }] : [])
        : table === 'afterhours_assignments' ? mock.weekend
        : table === 'afterhours_shift_assignments' ? mock.shifts
        : [
          { user_id: 'sandy', full_name: 'Sandy', email: 'sandy@test' },
          { user_id: 'matthew', full_name: 'Matthew', email: 'matthew@test' },
        ],
      error: table === 'profiles' ? mock.profileError : null,
    }).then(resolve, reject);
    return chain;
  },
} }));
import { useAfterhoursDriverMap } from './useAfterhoursDriverMap';

const date = '2026-10-02';
const night = { driver_id: 'truck-driver', afterhours_user_id: 'matthew', scheduled_date: date, shift: 'night' };
const morning = { ...night, afterhours_user_id: 'sandy', scheduled_date: '2026-10-03', shift: 'morning' };
const at = (iso: string) => vi.setSystemTime(new Date(iso));
let clients: QueryClient[];
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(useAfterhoursDriverMap, { wrapper }), client };
};
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };

beforeEach(() => {
  vi.useFakeTimers();
  at('2026-10-03T10:30:00Z'); // 05:30 Chicago
  mock.userId = 'admin';
  mock.shifts = [morning, night];
  mock.weekend = [];
  mock.scheduled = false;
  mock.profileError = null;
  clients = [];
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); vi.useRealTimers(); });

describe('Reports afterhours assignment labels', () => {
  it('shows Sandy on her covered trucks even when Matthew covers the same driver', async () => {
    mock.userId = 'sandy';
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Sandy');
  });
  it('shows Matthew on his own covered trucks', async () => {
    mock.userId = 'matthew';
    at('2026-10-03T11:30:00Z'); // 06:30 Chicago
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Matthew');
  });
  it.each([false, true])('picks the live morning shift regardless of row order (reverse=%s)', async reverse => {
    at('2026-10-03T11:30:00Z');
    if (reverse) mock.shifts.reverse();
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Sandy');
  });
  it('switches from last night to morning without remounting at 06:00 Chicago', async () => {
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Matthew');
    at('2026-10-03T11:00:00Z');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_010); });
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Sandy');
  });
  it('clears shift tags when their existing display window closes at 07:00', async () => {
    const { result } = mount();
    await flush();
    at('2026-10-03T12:00:00Z');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_010); });
    expect(result.current.driverAfterhoursMap.size).toBe(0);
    expect(result.current.isWeekendWindow).toBe(false);
  });
  it('clears removed assignments after mutation invalidation', async () => {
    const { result, client } = mount();
    await flush();
    mock.shifts = [];
    await act(async () => { await client.invalidateQueries({ queryKey: ['afterhours-driver-map'] }); });
    await flush();
    expect(result.current.driverAfterhoursMap.size).toBe(0);
    expect(result.current.isWeekendWindow).toBe(false);
  });
  it('picks up an assignment made by another session on the next refresh', async () => {
    mock.userId = 'sandy';
    mock.shifts = [night];
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Matthew');
    mock.shifts = [night, morning];
    await act(async () => { await vi.advanceTimersByTimeAsync(60_010); });
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Sandy');
  });
  it('keeps weekend coverage labels visible outside the shift tag window', async () => {
    at('2026-10-03T18:00:00Z');
    mock.scheduled = true;
    mock.weekend = [{ driver_id: 'truck-driver', afterhours_user_id: 'sandy' }];
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Sandy');
    expect(result.current.isWeekendWindow).toBe(true);
  });
  it('uses tonight for evening preview and ignores yesterday', async () => {
    at('2026-10-03T02:00:00Z'); // Oct 2, 21:00 Chicago
    mock.shifts = [night, { ...morning, scheduled_date: date }, { ...night, driver_id: 'old', scheduled_date: '2026-10-01' }];
    const { result } = mount();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Matthew');
    expect(result.current.driverAfterhoursMap.has('old')).toBe(false);
  });
  it('does not leak a previous users preferred labels on account change', async () => {
    mock.userId = 'sandy';
    const { result, rerender } = mount();
    await flush();
    mock.userId = 'matthew';
    rerender();
    await flush();
    expect(result.current.driverAfterhoursMap.get('truck-driver')?.userName).toBe('Matthew');
  });
});
