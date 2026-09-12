import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), drops: vi.fn(), transfers: vi.fn(), patch: vi.fn(), remove: vi.fn(), has: vi.fn(), flush: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ in: mocks.read }) }) } }));
vi.mock("@/hooks/useReportsDateWindow", () => ({ fetchPickupDropsForOrders: mocks.drops,
  fetchOrderTransfersForOrders: mocks.transfers, patchOrderInGlobalStore: mocks.patch,
  removeOrderFromGlobalStore: mocks.remove, hasOrderInGlobalStore: mocks.has, flushGlobalStoreNotifications: mocks.flush }));
import { refreshReportsOrders } from "./refreshReportsOrders";
describe("Reports changed-order reconciliation", () => {
  beforeEach(() => { Object.values(mocks).forEach(fn => fn.mockReset()); mocks.drops.mockResolvedValue([]); mocks.transfers.mockResolvedValue([]); });
  it("evicts the entire batch when all rows are deleted or no longer accessible", async () => {
    mocks.read.mockResolvedValue({ data: [], error: null });
    await refreshReportsOrders(["a", "b"], ["driver"], () => true);
    expect(mocks.remove.mock.calls).toEqual([["a", false], ["b", false]]);
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.flush).toHaveBeenCalledTimes(1);
  });
  it("preserves completion flags, stop ordering and transfer-driver membership", async () => {
    mocks.read.mockResolvedValue({ data: [{ id: "a", driver1_id: "other", bol_force_complete: true, pod_force_complete: true, weight_bol: 44000 }], error: null });
    mocks.transfers.mockResolvedValue([{ order_id: "a", driver1_id: "driver", sequence_number: 0 }]);
    mocks.drops.mockResolvedValue([{ id: "last", order_id: "a", sequence_number: 2 }, { id: "first", order_id: "a", sequence_number: 1 }]);
    await refreshReportsOrders(["a"], ["driver"], () => true);
    const row = mocks.patch.mock.calls[0][0];
    expect(row.bol_force_complete).toBe(true); expect(row.weight_bol).toBe(44000);
    expect(row.pickup_drops.map((r: any) => r.id)).toEqual(["first", "last"]);
  });
  it("does not replace existing orders with incomplete relations on a failed read", async () => {
    mocks.read.mockResolvedValue({ data: [{ id: "a", driver1_id: "driver" }], error: null });
    mocks.drops.mockRejectedValue(new Error("network"));
    await expect(refreshReportsOrders(["a"], ["driver"], () => true)).rejects.toThrow("network");
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("discards an in-flight result after the page/account changes", async () => {
    mocks.read.mockResolvedValue({ data: [{ id: "a", driver1_id: "driver" }], error: null });
    await refreshReportsOrders(["a"], ["driver"], () => false);
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.flush).not.toHaveBeenCalled();
  });
  it("bounds PostgREST identifier lists and deduplicates repeated IDs", async () => {
    mocks.read.mockResolvedValue({ data: [], error: null });
    const ids = Array.from({ length: 205 }, (_, i) => `o${i}`);
    await refreshReportsOrders([...ids, ids[0]], [], () => true);
    expect(mocks.read.mock.calls.map(([, ids]) => ids.length)).toEqual([100, 100, 5]);
  });
});
