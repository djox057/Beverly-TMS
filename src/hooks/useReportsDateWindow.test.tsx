import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { currentWindowFileSnapshot, invalidateWindowFileSnapshots, useReportsDateWindow } from "./useReportsDateWindow";

const request = vi.hoisted(() => vi.fn<typeof fetch>());
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://fixture.example", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: request },
  }) };
});

afterEach(cleanup);

it("loads both lock states, ordered stops and transfers in the same scoped read", async () => {
  const calls: URL[] = [];
  const row = (id: string) => ({
    id,
    order_files: id === "locked" ? [{ id: "pod", file_category: "POD" }] : [],
    pickup_drops: [{ sequence_number: 2 }, { sequence_number: 1 }],
    order_transfers: [{ sequence_number: 3 }, { sequence_number: 1 }],
  });
  request.mockImplementation(async input => {
    const url = new URL(String(input));
    calls.push(url);
    const rows = [row("locked"), row("unlocked")];
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useReportsDateWindow({
    dispatcherId: "dispatcher", currentUserDispatcherId: "dispatcher", individualMode: true,
    individualOverrideDriverIds: ["driver"], selectedDate: new Date(2026, 10, 18), priorityOffice: "Čačak",
  }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(result.current.orders.map(row => row.id).sort()).toEqual(["locked", "unlocked"]));
  for (const order of result.current.orders) {
    expect(order.pickup_drops.map(stop => stop.sequence_number)).toEqual([1, 2]);
    expect(order.order_transfers.map(transfer => transfer.sequence_number)).toEqual([1, 3]);
  }
  const [locked, unlocked] = result.current.orders;
  expect(currentWindowFileSnapshot(locked)).toEqual([{ id: "pod", file_category: "POD" }]);
  expect(currentWindowFileSnapshot(unlocked)).toEqual([]);
  expect(currentWindowFileSnapshot({ ...locked, order_files: Array(1000).fill({}) })).toBeUndefined();
  invalidateWindowFileSnapshots();
  expect(currentWindowFileSnapshot(locked)).toBeUndefined();
  expect(calls).toHaveLength(1);
  expect(calls[0].pathname).toMatch(/\/orders$/);
  const params = calls[0].searchParams;
  expect(params.get("select")).toContain("pickup_drops(");
  expect(params.get("select")).toContain("order_transfers(");
  expect(params.get("select")).toContain("order_files(");
  const [scope, eligibility] = params.getAll("or");
  expect(scope).toContain("original_driver1_id.in.(driver)");
  const dates = "and(pickup_datetime.gte.2026-11-16,pickup_datetime.lte.2026-11-21T23:59:59),and(delivery_datetime.gte.2026-11-16,delivery_datetime.lte.2026-11-21T23:59:59)";
  expect(eligibility).toBe(`(and(locked.eq.false,or(${dates},status.in.(in_transit,pending))),and(locked.eq.true,canceled.eq.false,or(${dates})))`);
});

it("paginates large offices and counts a shared order once across driver batches", async () => {
  const ids = Array.from({ length: 31 }, (_, i) => "driver-" + i);
  const offsets: number[] = [];
  request.mockImplementation(async input => {
    const params = new URL(String(input)).searchParams;
    const offset = Number(params.get("offset"));
    offsets.push(offset);
    const order = (id: number) => ({ id: String(id), pickup_drops: [], order_transfers: [] });
    const rows = params.get("or")?.includes("driver-30")
      ? [order(0), order(1001)]
      : offset === 0 ? Array.from({ length: 1000 }, (_, i) => order(i)) : [order(1000)];
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  });
  const client = new QueryClient();
  const { result } = renderHook(() => useReportsDateWindow({
    dispatcherId: "second", currentUserDispatcherId: "second", individualMode: true,
    individualOverrideDriverIds: ids, selectedDate: new Date(2026, 10, 18), priorityOffice: "Čačak",
  }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(result.current.orders).toHaveLength(1002));
  expect(offsets.sort((a, b) => a - b)).toEqual([0, 0, 1000]);
});
