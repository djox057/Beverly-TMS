import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrdersWithProgress } from "./useOrdersWithProgress";

const { invoke, from, team } = vi.hoisted(() => ({
  invoke: vi.fn(), from: vi.fn(), team: { cacheScope: null as string | null },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from } }));
vi.mock("./useSupervisorTeam", () => ({ useSupervisorTeam: () => team }));
vi.mock("./useOrdersRealtime", () => ({ useOrdersRealtime: vi.fn() }));
vi.mock("@/utils/fetchTrace", () => ({ traceFetch: vi.fn() }));
// Financial transformations have their own fixtures. Here test orchestration
// without altering any of the returned fields during the merge.
vi.mock("@/utils/ordersTransform", () => ({ transformOrders: (orders: unknown[]) => orders }));

interface TestOrder {
  id: string;
  locked?: boolean;
  pickupDatetime?: string;
  freight?: number;
}
interface Reply {
  data: { orders: TestOrder[]; count: number; totalCount: number | null; hasMore: boolean };
  error: null;
}
function deferred() {
  let resolve!: (value: Reply) => void;
  const promise = new Promise<Reply>((done) => { resolve = done; });
  return { promise, resolve };
}
const response = (orders: TestOrder[], extra: Partial<Reply["data"]> = {}): Reply => ({
  data: { orders, count: orders.length, totalCount: orders.length, hasMore: false, ...extra }, error: null,
});
function setup(options = {}) {
  // Hook-level retry is 1; disabling the retry delay makes error tests bounded.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const hook = renderHook(() => useOrdersWithProgress(options), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...hook, client };
}
beforeEach(() => {
  invoke.mockReset(); from.mockReset(); localStorage.clear(); team.cacheScope = null;
});

describe("Analytics raw order loading", () => {
  it("preserves active-before-archived reads and publishes only the complete, deduplicated merge", async () => {
    const active = deferred(); const archived = deferred();
    const activeRow = { id: "moving", locked: false, freight: 1250.25, pickupDatetime: "2026-11-10" };
    invoke.mockImplementation(name => name === "get-all-unlocked-orders" ? active.promise : archived.promise);
    const { result, client } = setup();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toBe("get-all-unlocked-orders");
    expect(result.current.data).toBeUndefined();
    await act(async () => { active.resolve(response([activeRow])); });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    expect(client.getQueryData(["orders"])).toBeUndefined();
    expect(result.current.progress.isComplete).toBe(false);
    await act(async () => { archived.resolve(response([
      { ...activeRow, locked: true, freight: 0 },
      { id: "old", locked: true, pickupDatetime: "2026-10-01" },
      { id: "new", locked: true, pickupDatetime: "2026-11-01" },
    ])); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      activeRow, { id: "new", locked: true, pickupDatetime: "2026-11-01" },
      { id: "old", locked: true, pickupDatetime: "2026-10-01" },
    ]);
    expect(client.getQueryData(["orders"])).toEqual(result.current.data);
    expect(result.current.progress).toMatchObject({ isComplete: true, unlockedLoaded: 1, lockedLoaded: 2 });
    expect(invoke.mock.calls.filter(([name]) => name === "get-all-locked-orders")).toHaveLength(1);
  });

  it("does not miss a load that becomes archived before the active read completes", async () => {
    const active = deferred(); let lockedNow = false;
    invoke.mockImplementation(name => name === "get-all-unlocked-orders" ? active.promise
      : Promise.resolve(response(lockedNow ? [{ id: "just-locked", locked: true }] : [])));
    const { result } = setup();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await act(async () => { lockedNow = true; active.resolve(response([])); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "just-locked", locked: true }]);
  });

  it("uses every exact-count offset once and retains the four-worker cap", async () => {
    let pending = 0; let peak = 0;
    const pages = new Map<number, ReturnType<typeof deferred>>();
    invoke.mockImplementation((name, { body }) => {
      if (name === "get-all-unlocked-orders") return Promise.resolve(response([]));
      if (body.offset === 0) return Promise.resolve(response([{ id: "0" }], { totalCount: 6001 }));
      pending++; peak = Math.max(peak, pending);
      const page = deferred(); pages.set(body.offset, page);
      return page.promise.finally(() => { pending--; });
    });
    const { result } = setup();
    await waitFor(() => expect(pages.size).toBe(4));
    expect([...pages.keys()]).toEqual([1000, 2000, 3000, 4000]);
    await act(async () => { pages.get(3000)!.resolve(response([{ id: "3000" }])); });
    await waitFor(() => expect(pages.has(5000)).toBe(true));
    await act(async () => { pages.get(1000)!.resolve(response([{ id: "1000" }])); });
    await waitFor(() => expect(pages.has(6000)).toBe(true));
    await act(async () => {
      for (const [offset, page] of pages) page.resolve(response([{ id: String(offset) }]));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(peak).toBe(4);
    expect(result.current.data.map(row => row.id).sort()).toEqual(["0", "1000", "2000", "3000", "4000", "5000", "6000"]);
    expect(invoke.mock.calls.filter(([name]) => name === "get-all-locked-orders").map(([, { body }]) => body.offset).sort((a, b) => a-b))
      .toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000]);
  });

  it("retains the sequential hasMore fallback when the exact count is absent", async () => {
    invoke.mockImplementation((name, { body }) => Promise.resolve(name === "get-all-unlocked-orders"
      ? response([]) : response([{ id: String(body.offset) }], { totalCount: null, hasMore: body.offset < 1001 })));
    const { result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoke.mock.calls.filter(([name]) => name === "get-all-locked-orders").map(([, { body }]) => body.offset))
      .toEqual([0, 1000, 1001]);
    expect(result.current.data).toHaveLength(3);
  });

  it.each(["get-all-unlocked-orders", "get-all-locked-orders"])("never publishes partial success when %s fails", async failingName => {
    invoke.mockImplementation(name => Promise.resolve(name === failingName
      ? { data: null, error: new Error("read failed") } : response([{ id: "partial" }])));
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(client.getQueryData(["orders"])).toBeUndefined();
    expect(result.current.progress.isComplete).toBe(false);
  });

  it("passes the same individual driver/booker scope to both requests", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ id: "driver-1" }, { id: "driver-2" }] });
    from.mockReturnValue({ select: () => ({ eq }) });
    invoke.mockResolvedValue(response([]));
    const { result } = setup({ bookedBy: "Dispatcher", dispatcherUserId: "user-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith("dispatcher_id", "user-1");
    for (const [, { body }] of invoke.mock.calls) expect(body).toMatchObject({
      bookedBy: "Dispatcher", dispatcherDriverIds: ["driver-1", "driver-2"], fields: "analytics",
    });
  });

  it("retains the supervisor cache scope", async () => {
    team.cacheScope = "team-A"; invoke.mockResolvedValue(response([]));
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["orders", "analytics-full", "team-A", "raw"])).toEqual([]);
  });

  it("does not add archived reads to opted-in precomputed mode", async () => {
    localStorage.setItem("analytics_use_precomputed", "true");
    invoke.mockResolvedValue(response([{ id: "active", locked: false }]));
    const { result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(["get-all-unlocked-orders"]);
    expect(result.current.progress).toMatchObject({ usePrecomputed: true, isComplete: true });
  });

  it("still requires archived raw orders for admin invoice metrics", async () => {
    localStorage.setItem("analytics_use_precomputed", "true");
    invoke.mockResolvedValue(response([]));
    const { result } = setup({ requireAllOrders: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(["get-all-unlocked-orders", "get-all-locked-orders"]);
    expect(result.current.progress).toMatchObject({ usePrecomputed: false, isComplete: true });
  });
});
