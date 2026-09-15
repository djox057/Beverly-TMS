import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ range: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query: any = { select: () => query, eq: (...args: any[]) => { mocks.eq(...args); return query; },
    order: (...args: any[]) => { mocks.order(...args); return query; }, range: mocks.range };
  return query;
} } }));
import { fetchReportsReferenceRows } from "./fetchReportsReferenceRows";
describe("Reports fleet pagination", () => {
  beforeEach(() => Object.values(mocks).forEach(fn => fn.mockReset()));
  it("continues past the API cap using a stable key order", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null })
      .mockResolvedValueOnce({ data: [{ id: 1000 }], error: null });
    expect(await fetchReportsReferenceRows("drivers", "id, hos_status")).toHaveLength(1001);
    expect(mocks.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(mocks.order).toHaveBeenCalledWith("id");
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
  });
  it("throws instead of returning a partial snapshot when a later page fails", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array(1000).fill({ truck_id: "t" }), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("interrupted") });
    await expect(fetchReportsReferenceRows("truck_telemetry", "truck_id, fuel_level")).rejects.toThrow("interrupted");
    expect(mocks.eq).not.toHaveBeenCalled();
    expect(mocks.order).toHaveBeenCalledWith("truck_id");
  });
});
