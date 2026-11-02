import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndividualModeProvider, useIndividualMode } from './IndividualModeContext';

const mock = vi.hoisted(() => ({ date: '', weekend: [] as any[] }));
vi.mock('./AuthContext', () => ({ useAuthContext: () => ({
  profile: { user_id: 'afterhours-user', individual_mode: false },
  getPrimaryRole: () => 'afterhours', loading: false,
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const chain: any = {};
    for (const method of ['select', 'eq', 'in']) chain[method] = () => chain;
    chain.range = async () => ({ data: table === 'afterhours_assignments' ? mock.weekend : [
      { driver_id: 'morning-driver', scheduled_date: mock.date, shift: 'morning' },
    ], error: null });
    return chain;
  },
} }));
const wrapper = ({ children }: { children: React.ReactNode }) => <IndividualModeProvider>{children}</IndividualModeProvider>;
const refresh = async (iso: string) => {
  vi.setSystemTime(new Date(iso));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_010); });
};
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Individual Mode morning coverage uses Serbia time', () => {
  it.each([
    ['2026-10-24', '11', '12'], // both countries on summer time
    ['2026-10-26', '12', '13'], // Serbia winter / Chicago summer
    ['2026-11-02', '12', '13'], // both countries on winter time
  ])('keeps coverage from 13:00 through 13:59, ends at 14:00 on %s', async (date, at13, at14) => {
    vi.useFakeTimers();
    mock.date = date;
    mock.weekend = [];
    vi.setSystemTime(new Date(`${date}T${at13}:00:00Z`));
    const { result } = renderHook(useIndividualMode, { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.individualMode).toBe(true);
    expect(result.current.individualOverrideDriverIds).toEqual(['morning-driver']);
    await refresh(`${date}T${at13}:58:00Z`);
    expect(result.current.individualMode).toBe(true); // now 13:59 in Serbia
    await refresh(`${date}T${at14}:00:00Z`);
    expect(result.current.individualMode).toBe(false);
    expect(result.current.canUseIndividualMode).toBe(false);
  });
  it('keeps weekend coverage available after the morning shift ends', async () => {
    vi.useFakeTimers();
    mock.date = '2026-11-01';
    mock.weekend = [{ driver_id: 'weekend-driver' }];
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { result } = renderHook(useIndividualMode, { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await refresh('2026-11-01T13:00:00Z');
    expect(result.current.individualMode).toBe(true);
    expect(result.current.individualOverrideDriverIds).toEqual(['weekend-driver']);
  });
});
