import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeOpportunities, useDispatcherLoadOpportunities } from "./useDispatcherLoadOpportunities";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), invalidate: vi.fn(), cancel: vi.fn(() => Promise.resolve()),
  handlers: {} as Record<string, (payload: unknown) => void>, resume: undefined as (() => void) | undefined,
  unsubscribe: vi.fn(), cacheUnsubscribe: vi.fn(), cacheHandler: undefined as ((event: unknown) => void) | undefined,
  data: { prebookCount: 1, recoveryCount: 2, truckIds: ["mine"], orderIds: ["last-delivery", "prebook"] },
  rpc: vi.fn(), abortSignal: vi.fn(),
}));
const client = {
  invalidateQueries: mocks.invalidate, cancelQueries: mocks.cancel,
  getQueryData: () => mocks.data,
  getQueryCache: () => ({ subscribe: (callback: (event: unknown) => void) => {
    mocks.cacheHandler = callback; return mocks.cacheUnsubscribe;
  } }),
};
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mocks.query(options), useQueryClient: () => client }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => {
  mocks.rpc(...args); return { abortSignal: mocks.abortSignal };
} } }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: (resume: () => void) => {
  mocks.resume = resume;
  const channel = { on: (_: string, cfg: { table: string }, handler: (payload: unknown) => void) => {
    mocks.handlers[cfg.table] = handler; return channel;
  }, subscribe: () => channel, unsubscribe: mocks.unsubscribe };
  return channel;
} }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); mocks.handlers = {}; });
const settle = async () => { await act(async () => { vi.advanceTimersByTime(300); }); };
const event = (next: Record<string, unknown>, old: Record<string, unknown> = {}, eventType = "UPDATE") => ({ new: next, old, eventType });

describe("dispatcher-only query", () => {
  it.each(["admin", "manager", "supervisor", "afterhours", "safety", "accounting", "maintenance", "chicago_management", "yard", "recruiting", "driver", "claims", null] as const)("does not fetch or subscribe for %s", role => {
    renderHook(() => useDispatcherLoadOpportunities("user", role));
    expect(mocks.query.mock.calls[0][0].enabled).toBe(false);
    expect(Object.keys(mocks.handlers)).toHaveLength(0);
  });
  it("keys by user identity and uses the aggregate RPC with abort support", async () => {
    const { rerender } = renderHook(({ id }) => useDispatcherLoadOpportunities(id, "dispatch"), { initialProps: { id: "one" } });
    let options = mocks.query.mock.calls[0][0];
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(["dispatcher-load-opportunities", "one"]);
    mocks.abortSignal.mockResolvedValue({ data: [{ prebook_count: 2, recovery_count: 1, truck_ids: ["t"], order_ids: ["o"] }], error: null });
    const signal = new AbortController().signal;
    expect(await options.queryFn({ signal })).toEqual({ prebookCount: 2, recoveryCount: 1, truckIds: ["t"], orderIds: ["o"] });
    expect(mocks.rpc).toHaveBeenCalledWith("get_dispatcher_load_opportunities_v2");
    expect(mocks.abortSignal).toHaveBeenCalledWith(signal);
    rerender({ id: "two" });
    options = mocks.query.mock.lastCall![0];
    expect(options.queryKey).toEqual(["dispatcher-load-opportunities", "two"]);
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
  it("disables an unauthenticated dispatcher", () => {
    renderHook(() => useDispatcherLoadOpportunities(undefined, "dispatch"));
    expect(mocks.query.mock.calls[0][0].enabled).toBe(false);
  });
});

describe("live matching refresh", () => {
  it("ignores unrelated fleet activity and batches normal bookings, opportunities and stops", async () => {
    vi.useFakeTimers(); renderHook(() => useDispatcherLoadOpportunities("user", "dispatch"));
    act(() => mocks.handlers.orders(event({ id: "unrelated", truck_id: "other" })));
    await settle();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    act(() => {
      mocks.handlers.orders(event({ id: "new-booking", truck_id: "mine", prebook: false, retrieval: false }));
      mocks.handlers.pickup_drops(event({ order_id: "new-booking" }));
      mocks.handlers.orders(event({ id: "new-prebook", prebook: true }));
      mocks.handlers.pickup_drops(event({ order_id: "last-delivery" }));
    });
    await settle();
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["dispatcher-load-opportunities", "user"] });
  });
  it("handles reassignment out of the fleet, cancellations and PK-only deletes", async () => {
    vi.useFakeTimers(); renderHook(() => useDispatcherLoadOpportunities("user", "dispatch"));
    act(() => {
      mocks.handlers.orders(event({ id: "last-delivery", truck_id: "other" }, { id: "last-delivery" }));
      mocks.handlers.orders(event({ id: "prebook", prebook: false, canceled: true }, { id: "prebook" }));
      mocks.handlers.pickup_drops(event({}, { id: "deleted-stop" }, "DELETE"));
    });
    await settle(); expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
  it("refreshes from shared fallback and same-tab fleet edits, without looping on its own invalidation", async () => {
    vi.useFakeTimers(); renderHook(() => useDispatcherLoadOpportunities("user", "dispatch"));
    act(() => {
      mocks.resume!();
      mocks.cacheHandler!({ type: "updated", action: { type: "invalidate" }, query: { queryKey: ["drivers", "v2"] } });
      mocks.cacheHandler!({ type: "updated", action: { type: "invalidate" }, query: { queryKey: ["dispatcher-load-opportunities", "user"] } });
    });
    await settle(); expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
  it("unsubscribes and drops pending work after a role change", async () => {
    vi.useFakeTimers(); const { rerender } = renderHook(({ role }: { role: "dispatch" | "manager" }) => useDispatcherLoadOpportunities("user", role), { initialProps: { role: "dispatch" } });
    act(() => mocks.handlers.orders(event({ id: "new", prebook: true })));
    rerender({ role: "manager" });
    await settle();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect(mocks.cacheUnsubscribe).toHaveBeenCalled();
  });
});

it("accepts actual zeros but never turns missing or invalid responses into zeros", () => {
  expect(normalizeOpportunities([{ prebook_count: 0, recovery_count: 0, truck_ids: [], order_ids: [] }]).prebookCount).toBe(0);
  for (const data of [null, [], {}, [{ prebook_count: -1 }]]) expect(() => normalizeOpportunities(data)).toThrow();
});
