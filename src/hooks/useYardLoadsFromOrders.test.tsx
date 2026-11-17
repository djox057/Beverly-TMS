import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useYardLoadsFromOrders } from "./useYardLoadsFromOrders";
import { useYardLoadsCount } from "./useYardLoadsCount";

const db = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let countOnly = false;
    const query: any = {
      select: (_fields: string, options?: { head?: boolean }) => { countOnly = !!options?.head; return query; },
      or: (filter: string) => { db.calls.push([table, "or", filter]); return query; },
      is: (...args: unknown[]) => { db.calls.push([table, "is", ...args]); return query; },
      eq: (...args: unknown[]) => { db.calls.push([table, "eq", ...args]); return query; },
      in: (...args: unknown[]) => { db.calls.push([table, "in", ...args]); return query; },
      order: () => query,
      then: (resolve: any, reject: any) => Promise.resolve({ error: null, count: countOnly ? 1 : null, data: countOnly ? null : table === "orders" ? [
        { id: "order-1", is_recovery: true, driver1_id: "recovery-1", truck_id: null, original_driver1_id: "original-1", prebook: false },
      ] : table === "drivers" ? [
        { id: "recovery-1", name: "Recovery Driver" }, { id: "original-1", name: "Original Driver" },
      ] : [] }).then(resolve, reject),
    };
    return query;
  },
} }));
beforeEach(() => { db.calls = []; });
afterEach(cleanup);
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it("retains pending recovery assignments and resolves the assigned driver's name", async () => {
  const { result } = renderHook(() => useYardLoadsFromOrders(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.[0]).toMatchObject({ driver1Id: "recovery-1", driverName: "Recovery Driver", originalDriverName: "Original Driver", truckId: null });
  expect(db.calls).toContainEqual(["orders", "or", "driver1_id.is.null,is_recovery.eq.true"]);
  expect(db.calls).toContainEqual(["orders", "is", "truck_id", null]);
  expect(db.calls).toContainEqual(["orders", "eq", "prebook", false]);
});

it("uses the same pending-assignment filter for the navigation count", async () => {
  const { result } = renderHook(() => useYardLoadsCount(), { wrapper });
  await waitFor(() => expect(result.current.data).toBe(1));
  expect(db.calls).toContainEqual(["orders", "or", "driver1_id.is.null,is_recovery.eq.true"]);
  expect(db.calls).toContainEqual(["orders", "is", "truck_id", null]);
  expect(db.calls).toContainEqual(["orders", "eq", "prebook", false]);
});
