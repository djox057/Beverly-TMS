import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IndividualModeProvider, useIndividualMode } from './IndividualModeContext';

const mocks = vi.hoisted(() => ({
  auth: { profile: { user_id: 'one', individual_mode: false }, getPrimaryRole: (): string => 'dispatch', loading: false },
  assignments: { data: [{ driver_id: 'driver' }], error: null as unknown },
  save: vi.fn(), toast: vi.fn(),
}));
vi.mock('./AuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/afterhoursShiftTime', () => ({ getAfterhoursShiftTime: () => ({ shift: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => table === 'profiles'
    ? { update: (value: unknown) => ({ eq: () => mocks.save(value) }) }
    : { select: () => ({ eq: () => ({ eq: () => ({ range: async () => mocks.assignments }) }) }) },
} }));
const wrapper = ({ children }: { children: React.ReactNode }) => <IndividualModeProvider>{children}</IndividualModeProvider>;

describe('Individual Mode stability', () => {
  beforeEach(() => {
    mocks.auth.profile = { user_id: 'one', individual_mode: false };
    mocks.auth.getPrimaryRole = () => 'dispatch';
    mocks.assignments = { data: [{ driver_id: 'driver' }], error: null };
    mocks.save.mockReset().mockResolvedValue({ error: null });
    mocks.toast.mockClear();
  });
  afterEach(() => vi.useRealTimers());
  it('preserves manual choice across stale profile refreshes', async () => {
    const { result, rerender } = renderHook(useIndividualMode, { wrapper });
    await act(() => result.current.setIndividualMode(true));
    mocks.auth.profile = { ...mocks.auth.profile, individual_mode: false };
    rerender();
    expect(result.current.individualMode).toBe(true);
  });
  it('keeps afterhours manual off through polling and failed refreshes', async () => {
    vi.useFakeTimers();
    mocks.auth.getPrimaryRole = () => 'afterhours';
    const { result } = renderHook(useIndividualMode, { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.individualMode).toBe(true);
    await act(() => result.current.setIndividualMode(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.individualMode).toBe(false);
    await act(() => result.current.setIndividualMode(true));
    mocks.assignments = { data: [], error: new Error('offline') };
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.individualMode).toBe(true);
    expect(result.current.canUseIndividualMode).toBe(true);
  });
  it('restores the last saved value and reports save failure', async () => {
    const { result } = renderHook(useIndividualMode, { wrapper });
    mocks.save.mockResolvedValue({ error: new Error('offline') });
    await act(() => result.current.setIndividualMode(true));
    expect(result.current.individualMode).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
  it('initializes a different account from its own preference', async () => {
    const { result, rerender } = renderHook(useIndividualMode, { wrapper });
    await act(() => result.current.setIndividualMode(true));
    mocks.auth.profile = { user_id: 'two', individual_mode: false };
    rerender();
    expect(result.current.individualMode).toBe(false);
  });
  it('serializes rapid clicks and rolls back to the last successful save', async () => {
    const { result } = renderHook(useIndividualMode, { wrapper });
    let finish!: (value: { error: null }) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ error: new Error('offline') });
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.setIndividualMode(true);
      second = result.current.setIndividualMode(false);
      await Promise.resolve();
    });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ error: null }); await Promise.all([first, second]); });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(result.current.individualMode).toBe(true);
  });
});
