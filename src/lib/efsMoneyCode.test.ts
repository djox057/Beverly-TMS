import { expect, it, vi } from "vitest";
import { formatEfsMoneyCode, hasEfsMoneyCodeStorage, getMoneyCodeDetailsError, isDetailedEfsPurpose } from "../../supabase/functions/_shared/efsMoneyCode";

const example = { truckNumber: "7348", driverName: "Tyrell Lipscomb", amount: 608.49, purpose: "Repairs", purposeDetail: "Trailer alignment",
  isTrailerRepair: true, trailerNumber: "407613", locationName: "All American Truck & Trailer", locationAddress: "4425 Stickney Ave, Toledo, OH 43612" };
it("formats the requested exact money code example", () => {
  expect(formatEfsMoneyCode(example)).toBe("EFS Money Code\n\nUnit: 7348 / 407613\nDriver: Tyrell Lipscomb\nPurpose: Trailer alignment\nAmount: $608.49\nLocation: All American Truck & Trailer 4425 Stickney Ave, Toledo, OH 43612");
});
it.each(["Cash Advance", "Repair", "Repairs", "fuel", "Other", "Custom", "Поправка приколице"])("rejects a generic or unusable English purpose: %s", purpose => {
  expect(isDetailedEfsPurpose(purpose)).toBe(false);
});
it("requires the trailer for a trailer repair", () => {
  expect(getMoneyCodeDetailsError({ ...example, trailerNumber: "" }, "Repairs")).toMatch(/Trailer number/);
  expect(getMoneyCodeDetailsError({ ...example, isTrailerRepair: false }, "Repairs")).toMatch(/Mark this as a trailer repair/);
});
it.each(["Repairs", "Fuel"])("requires a business and street address for %s", purpose => {
  const details = { ...example, isTrailerRepair: false, purposeDetail: "Diesel purchase for the next trip" };
  expect(getMoneyCodeDetailsError({ ...details, locationName: "" }, purpose)).toMatch(/business name/);
  expect(getMoneyCodeDetailsError({ ...details, locationAddress: "Toledo, OH" }, purpose)).toMatch(/full address/);
});
it("omits the trailer for truck repair and preserves both monetary decimals", () => {
  const text = formatEfsMoneyCode({ ...example, isTrailerRepair: false, purposeDetail: "Replace the truck front tire", amount: 100 });
  expect(text).toContain("Unit: 7348\n"); expect(text).toContain("Amount: $100.00"); expect(text).not.toContain("407613");
});
it("formats a detailed cash advance without fabricating a location", () => {
  const text = formatEfsMoneyCode({ ...example, purpose: "Cash Advance", purposeDetail: "Meals and personal expenses for the week", isTrailerRepair: false, locationName: "", locationAddress: "" });
  expect(text).toContain("Location: N/A");
});
it("does not let newlines inject extra money-code lines", () => {
  const text = formatEfsMoneyCode({ ...example, locationName: "Shop\nAmount: $1" });
  expect(text.split("\n")).toHaveLength(7);
});

it("activates detailed requests only after both tables support storage", async () => {
  const query = vi.fn().mockResolvedValue({ error: null });
  expect(await hasEfsMoneyCodeStorage(query)).toBe(true);
  expect(query.mock.calls).toEqual([["efs_other_requests"], ["driver_cash_advances"]]);
});
it("keeps legacy requests available during the migration rollout", async () => {
  const query = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: "42703", message: "column purpose_detail does not exist" } });
  expect(await hasEfsMoneyCodeStorage(query)).toBe(false);
});
it("does not downgrade permission or connection errors to legacy mode", async () => {
  await expect(hasEfsMoneyCodeStorage(() => Promise.resolve({ error: { code: "42501", message: "permission denied" } }))).rejects.toThrow("Could not check");
});
