import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRecoveryLoadsRealtime } from "./useRecoveryLoadsRealtime";
const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), handlers: {} as Record<string, (payload: unknown) => void>, unsubscribe: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => {
  const channel = { on: (_: string, cfg: { table: string }, handler: (payload: unknown) => void) => { mocks.handlers[cfg.table] = handler; return channel; }, subscribe: () => channel, unsubscribe: mocks.unsubscribe };
  return channel;
} }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it("refreshes entry, assignment and removal events but ignores unrelated orders", () => {
  vi.useFakeTimers(); renderHook(() => useRecoveryLoadsRealtime([{ id: "known" }]));
  act(() => {
    mocks.handlers.orders({ new: { id: "other", retrieval: false, recovery_assigned: false }, old: {} });
    vi.advanceTimersByTime(400);
  });
  expect(mocks.invalidate).not.toHaveBeenCalled();
  act(() => {
    mocks.handlers.orders({ new: { id: "new", retrieval: false, prebook: true }, old: {} });
    mocks.handlers.orders({ new: { id: "known", retrieval: false, recovery_assigned: true }, old: { id: "known" } });
    mocks.handlers.orders({ new: {}, old: { id: "new" } });
    vi.advanceTimersByTime(300);
  });
  expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["recovery-loads"] });
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["recovery-loads-count"] });
});
it("refreshes related pickup changes and cancels pending work on unmount", () => {
  vi.useFakeTimers(); const { unmount } = renderHook(() => useRecoveryLoadsRealtime([{ id: "known" }]));
  act(() => { mocks.handlers.pickup_drops({ new: { order_id: "known" }, old: {} }); vi.advanceTimersByTime(300); });
  expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  act(() => { mocks.handlers.orders({ new: { id: "known", retrieval: false }, old: { id: "known" } }); });
  unmount(); act(() => vi.advanceTimersByTime(300));
  expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  expect(mocks.unsubscribe).toHaveBeenCalled();
});
