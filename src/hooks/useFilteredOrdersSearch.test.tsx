import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilteredOrdersSearch } from "./useFilteredOrdersSearch";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("./useSupervisorTeam", () => ({ useSupervisorTeam: () => ({ cacheScope: "test" }) }));
vi.mock("@/utils/ordersTransform", () => ({ transformOrders: (orders: unknown[]) => orders }));

function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useFilteredOrdersSearch(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
const rows = (id: string, hasMore = false) => ({ data: { orders: [{ id }], totalCount: 1, hasMore }, error: null });
const summary = (unlockedCount = 0) => ({ data: { totalCount: 1, unlockedCount }, error: null });

beforeEach(() => { invoke.mockReset(); });
describe("filtered order request ownership", () => {
  it("accepts a newer filter while loading and ignores the old response", async () => {
    const old = deferred();
    invoke.mockImplementation((name, { body }) => name === "orders-summary"
      ? Promise.resolve(summary())
      : body.filters.invoiced ? old.promise : Promise.resolve(rows("new")));
    const { result } = setup();
    let first!: Promise<void>;
    act(() => { first = result.current.search({ invoiced: true }); });
    expect(result.current.isLoading).toBe(true);
    await act(async () => { await result.current.search({ invoiced: false }); });
    await waitFor(() => expect(result.current.orders).toEqual([{ id: "new" }]));
    await act(async () => { old.resolve(rows("old", true)); await first; });
    expect(result.current.orders).toEqual([{ id: "new" }]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("invalidates in-flight results on reset and allows a new search immediately", async () => {
    const old = deferred();
    invoke.mockImplementation((name, { body }) => name === "orders-summary"
      ? Promise.resolve(summary())
      : body.filters.invoiced ? old.promise : Promise.resolve(rows("new")));
    const { result } = setup();
    let first!: Promise<void>;
    act(() => { first = result.current.search({ invoiced: true }); });
    act(() => result.current.reset());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(false);
    await act(async () => { await result.current.search({ invoiced: false }); });
    await act(async () => { old.resolve(rows("old", true)); await first; });
    await waitFor(() => expect(result.current.orders).toEqual([{ id: "new" }]));
    expect(result.current.totalCount).toBe(1);
  });

  it("serializes pagination with unlocked prefetch and ignores stale prefetched rows", async () => {
    const prefetch = deferred();
    invoke.mockImplementation((name, { body }) => {
      if (name === "orders-summary") return Promise.resolve(summary(body.filters.invoiced ? 2 : 0));
      if (!body.filters.invoiced) return Promise.resolve(rows("new"));
      return body.offset === 0 ? Promise.resolve(rows("first", true)) : prefetch.promise;
    });
    const { result } = setup();
    let first!: Promise<void>;
    act(() => { first = result.current.search({ invoiced: true }); });
    await waitFor(() => expect(result.current.isPrefetchingUnlocked).toBe(true));
    const count = invoke.mock.calls.length;
    await act(async () => { await result.current.loadMore(); });
    expect(invoke.mock.calls.length).toBe(count);
    await act(async () => { await result.current.search({ invoiced: false }); });
    await act(async () => { prefetch.resolve(rows("stale", true)); await first; });
    await waitFor(() => expect(result.current.orders).toEqual([{ id: "new" }]));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not let an old pagination request change the new filter", async () => {
    const more = deferred();
    invoke.mockImplementation((name, { body }) => name === "orders-summary"
      ? Promise.resolve(summary())
      : body.offset ? more.promise : Promise.resolve(rows(body.filters.invoiced ? "first" : "new", body.filters.invoiced)));
    const { result } = setup();
    await act(async () => { await result.current.search({ invoiced: true }); });
    let pagination!: Promise<void>;
    act(() => { pagination = result.current.loadMore(); });
    await act(async () => { await result.current.search({ invoiced: false }); });
    await act(async () => { more.resolve(rows("stale", true)); await pagination; });
    await waitFor(() => expect(result.current.orders).toEqual([{ id: "new" }]));
    expect(result.current.hasMore).toBe(false);
  });
});
