import { beforeEach, expect, it, vi } from "vitest";
import { completeYardTruckAssignment } from "./completeYardTruckAssignment";

const db = vi.hoisted(() => ({
  order: { driver1_id: "driver-1", truck_id: null as string | null, is_recovery: true },
  transfer: { id: "transfer-2", driver1_id: "driver-1", truck_id: null as string | null },
  history: { id: "history-2", recovery_truck_id: null as string | null },
  failedTable: "",
  writes: [] as { table: string; values: Record<string, unknown>; filters: unknown[][] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let values: Record<string, unknown> | undefined;
    const filters: unknown[][] = [];
    const result = () => {
      if (values) {
        db.writes.push({ table, values, filters });
        return { data: { id: "order-1" }, error: db.failedTable === table ? new Error("Save failed") : null };
      }
      return { data: table === "orders" ? db.order : table === "order_transfers" ? db.transfer : db.history, error: null };
    };
    const query: any = {
      select: () => query,
      update: (next: Record<string, unknown>) => { values = next; return query; },
      eq: (...args: unknown[]) => { filters.push(["eq", ...args]); return query; },
      is: (...args: unknown[]) => { filters.push(["is", ...args]); return query; },
      order: () => query, limit: () => query,
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  },
} }));

beforeEach(() => {
  db.order = { driver1_id: "driver-1", truck_id: null, is_recovery: true };
  db.transfer = { id: "transfer-2", driver1_id: "driver-1", truck_id: null };
  db.history = { id: "history-2", recovery_truck_id: null };
  db.failedTable = "";
  db.writes = [];
});

it("updates the existing leg and history and only adds truck_id to the order", async () => {
  await completeYardTruckAssignment("order-1", "driver-1", "truck-1");
  expect(db.writes).toEqual([
    { table: "order_transfers", values: { truck_id: "truck-1" }, filters: [["eq", "id", "transfer-2"]] },
    { table: "recovery_history", values: { recovery_truck_id: "truck-1" }, filters: [["eq", "id", "history-2"]] },
    { table: "orders", values: { truck_id: "truck-1" }, filters: [["eq", "id", "order-1"], ["eq", "driver1_id", "driver-1"], ["is", "truck_id", null]] },
  ]);
});

it("rejects a stale assignment before changing transfer records", async () => {
  db.order.truck_id = "different-truck";
  await expect(completeYardTruckAssignment("order-1", "driver-1", "truck-1")).rejects.toThrow("assignment has changed");
  expect(db.writes).toEqual([]);
});

it("does not complete the order when a related history update fails", async () => {
  db.failedTable = "recovery_history";
  await expect(completeYardTruckAssignment("order-1", "driver-1", "truck-1")).rejects.toThrow("Save failed");
  expect(db.writes.some(w => w.table === "orders")).toBe(false);
});

it("can retry when related records already received the same truck", async () => {
  db.transfer.truck_id = "truck-1";
  db.history.recovery_truck_id = "truck-1";
  await expect(completeYardTruckAssignment("order-1", "driver-1", "truck-1")).resolves.toBeUndefined();
  expect(db.writes.at(-1)?.table).toBe("orders");
});
