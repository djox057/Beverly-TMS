import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrdersWithProgress } from "./useOrdersWithProgress";

const { invoke, from, team, identity } = vi.hoisted(() => ({
  invoke: vi.fn(), from: vi.fn(), identity: { user: { id: "user" }, roles: ["dispatch"] }, team: { cacheScope: null as string | null },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => identity }));
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
  invoke.mockReset(); from.mockReset(); localStorage.clear(); team.cacheScope = null; identity.user.id = "user"; identity.roles = ["dispatch"];
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
    expect(client.getQueryData(["orders", "analytics-full", "user", ["dispatch"], null, null, "team-A", "raw"])).toEqual([]);
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

it("combines compact and legacy pages during a rolling deployment", async () => {
  invoke.mockImplementation(async name => name === "get-all-unlocked-orders"
    ? { data: { count: 2, orderColumns: { keys: ["id", "freight", "locked"], values: [["a", "b"], [0, 12.5], [false, false]] } }, error: null }
    : response([{ id: "c", locked: true }]));
  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([{ id: "a", freight: 0, locked: false }, { id: "b", freight: 12.5, locked: false }, { id: "c", locked: true }]);
  for (const [, { body }] of invoke.mock.calls) expect(body.orderFormat).toBe("columns-v1");
});

it("does not publish an incomplete compact archive page", async () => {
  invoke.mockImplementation(async name => name === "get-all-unlocked-orders" ? response([{ id: "active" }])
    : { data: { orderColumns: { keys: ["id", "freight"], values: [["a", "b"], [1250]] } }, error: null });
  const { result, client } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData(["orders"])).toBeUndefined();
});

it("revalidates archived blocks on refetch and retains the last complete snapshot after a failed page", async () => {
  const tag = "a".repeat(64);
  let attempt = 0;
  const offers: string[][] = [];
  invoke.mockImplementation(async (name, { body }) => {
    if (name === "get-all-unlocked-orders") return response([{ id: "active" }]);
    offers.push(body.knownArchiveTags);
    if (attempt === 1) return { error: new Error("temporary archive failure") };
    return { data: { orders: body.knownArchiveTags.includes(tag) ? [] : [{ id: "old", freight: 1200 }],
      archiveTags: [tag], count: 1, totalCount: 1 }, error: null };
  });
  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(offers).toEqual([[]]);
  attempt = 1;
  await act(async () => { await result.current.refetch(); });
  expect(result.current.isError).toBe(true);
  attempt = 2;
  await act(async () => { await result.current.refetch(); });
  expect(offers.slice(1)).toEqual([[tag], [tag], [tag]]);
  expect(result.current.data).toEqual([{ id: "active" }, { id: "old", freight: 1200 }]);
});

it("recovers an unusable manifest with one complete read of the same archived page", async () => {
  const first = "a".repeat(64);
  const later = "b".repeat(64);
  invoke.mockImplementation(async (name, { body }) => {
    if (name === "get-all-unlocked-orders") return response([]);
    if (!body.knownArchiveTags) return response([{ id: "old", freight: 2 }]);
    const warm = body.knownArchiveTags.length > 0;
    return { data: { count: 1, totalCount: 1, archiveTags: [warm ? later : first],
      orders: warm ? [] : [{ id: "old", freight: 1 }] }, error: null };
  });
  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => { await result.current.refetch(); });
  expect(result.current.data).toEqual([{ id: "old", freight: 2 }]);
  const requests = invoke.mock.calls.filter(([name]) => name === "get-all-locked-orders").map(([, {body}]) => body);
  expect(requests).toHaveLength(3);
  const { knownArchiveTags, ...samePage } = requests[1];
  expect(knownArchiveTags).toEqual([first]);
  expect(requests[2]).toEqual(samePage);
});

it("starts fresh when the account or roles change", async () => {
  const tag = "c".repeat(64);
  invoke.mockImplementation(async (name, { body }) => name === "get-all-unlocked-orders" ? response([])
    : { data: { count: 1, totalCount: 1, archiveTags: [tag], orders: [{ id: identity.user.id }] }, error: null });
  const { result, rerender } = setup();
  await waitFor(() => expect(result.current.data).toEqual([{ id: "user" }]));
  identity.user.id = "second";
  rerender();
  await waitFor(() => expect(result.current.data).toEqual([{ id: "second" }]));
  identity.roles = ["manager"];
  rerender();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const requests = invoke.mock.calls.filter(([name]) => name === "get-all-locked-orders");
  expect(requests.map(([, { body }]) => body.knownArchiveTags)).toEqual([[], [], []]);
});

it("a late response from a previous account cannot replace the current result", async () => {
  const late = deferred();
  const signals: AbortSignal[] = [];
  invoke.mockImplementation(async (name, options) => {
    if (name === "get-all-unlocked-orders") return response([]);
    signals.push(options.signal);
    return identity.user.id === "user" ? late.promise : response([{ id: "second" }]);
  });
  const { result, client, rerender } = setup();
  await waitFor(() => expect(signals.length).toBe(1));
  identity.user.id = "second";
  rerender();
  await waitFor(() => expect(result.current.data).toEqual([{ id: "second" }]));
  expect(signals[0].aborted).toBe(true);
  await act(async () => { late.resolve(response([{ id: "previous-user" }])); });
  expect(client.getQueryData(["orders"])).toEqual([{ id: "second" }]);
});
