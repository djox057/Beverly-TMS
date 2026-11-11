import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTripStatement } from "./saveTripStatement";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), insert: vi.fn(), single: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  from: () => ({ insert: (payload: unknown) => { mocks.insert(payload); return { select: () => ({ single: mocks.single }) }; } }),
} }));
const file = new File(["x"], "salary.pdf");
const target = { truckNumber: "03212", driverName: "Edward Butcher", weekStart: "2026-10-20", amount: -50 };
beforeEach(() => {
  vi.resetAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null }); mocks.single.mockResolvedValue({ data: { id: "s1" }, error: null });
});
describe("bulk statement persistence", () => {
  it("inserts the original PDF and final amount without changing paid flags", async () => {
    await insertTripStatement(file, target);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ truck_number: "03212", driver_name: "Edward Butcher", week_start: "2026-10-20", paid_amount: -50, file_name: "salary.pdf" }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans up a failed insert and reports a concurrent duplicate without overwriting", async () => {
    mocks.single.mockResolvedValue({ error: { code: "23505" } });
    await expect(insertTripStatement(file, target)).rejects.toThrow("already exists");
    expect(mocks.remove).toHaveBeenCalledWith([mocks.insert.mock.calls[0][0].file_path]);
  });
  it("stops before inserting if upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Upload failed" } });
    await expect(insertTripStatement(file, target)).rejects.toThrow("Upload failed");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
