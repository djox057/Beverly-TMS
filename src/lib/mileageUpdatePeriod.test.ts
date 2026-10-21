import { describe, expect, it } from "vitest";
import { filterMileageUpdateTrucks, countMileageUpdates, mileagePeriodBounds, mileagePresetPeriod } from "./mileageUpdatePeriod";

describe("Mileage update periods", () => {
  it("uses the exact inclusive preset days in the selected month", () => {
    expect(mileagePresetPeriod("2026-10", "first")).toEqual({ start: "2026-10-01", end: "2026-10-07" });
    expect(mileagePresetPeriod("2026-09", "second")).toEqual({ start: "2026-09-15", end: "2026-09-22" });
  });
  it("includes all of the final Chicago date without including the next date", () => {
    expect(mileagePeriodBounds({ start: "2026-10-15", end: "2026-10-22" })).toEqual({
      start: "2026-10-15T05:00:00.000Z", endExclusive: "2026-10-23T05:00:00.000Z",
    });
  });
  it("handles fall and spring daylight-saving boundaries", () => {
    expect(mileagePeriodBounds({ start: "2026-11-01", end: "2026-11-07" })).toEqual({
      start: "2026-11-01T05:00:00.000Z", endExclusive: "2026-11-08T06:00:00.000Z",
    });
    expect(mileagePeriodBounds({ start: "2026-03-07", end: "2026-03-09" })).toEqual({
      start: "2026-03-07T06:00:00.000Z", endExclusive: "2026-03-10T05:00:00.000Z",
    });
  });
  it("handles custom ranges spanning a year", () => {
    expect(mileagePeriodBounds({ start: "2026-12-31", end: "2027-01-02" })).toEqual({
      start: "2026-12-31T06:00:00.000Z", endExclusive: "2027-01-03T06:00:00.000Z",
    });
  });
  it.each([
    { start: "", end: "2026-10-22" },
    { start: "2026-10-23", end: "2026-10-22" },
    { start: "2026-02-29", end: "2026-03-01" },
    { start: "2026-13-01", end: "2026-13-07" },
  ])("rejects incomplete or invalid dates: %j", (period) => {
    expect(mileagePeriodBounds(period)).toBeNull();
  });
});

describe("Mileage update counters", () => {
  it("counts distinct trucks and actual editing users within visible trucks", () => {
    expect(countMileageUpdates([{ id: "a" }, { id: "b" }, { id: "c" }], [
      { truck_id: "a", changed_by: "person1" }, { truck_id: "a", changed_by: "person1" },
      { truck_id: "a", changed_by: "person2" }, { truck_id: "b", changed_by: "person1" },
      { truck_id: "hidden", changed_by: "person3" },
    ])).toEqual({ updated: 2, total: 3, remaining: 1, people: 2 });
  });
  it("does not invent a person for automated edits", () => {
    expect(countMileageUpdates([{ id: "a" }], [{ truck_id: "a", changed_by: null }])).toEqual({ updated: 1, total: 1, remaining: 0, people: 0 });
  });
  it("handles empty results and repeated truck IDs", () => {
    expect(countMileageUpdates([], [])).toEqual({ updated: 0, total: 0, remaining: 0, people: 0 });
    expect(countMileageUpdates([{ id: "a" }, { id: "a" }], [])).toEqual({ updated: 0, total: 1, remaining: 1, people: 0 });
  });
});

describe("Combined mileage filters", () => {
  const trucks = [{ id: "assigned-updated", driver1_id: "driver" }, { id: "assigned-pending", driver1_id: "driver" },
    { id: "unassigned-updated", driver1_id: null }, { id: "unassigned-pending", driver1_id: null }];
  const edits = [{ truck_id: "assigned-updated", changed_by: "user" }, { truck_id: "unassigned-updated", changed_by: "user" }];
  it.each([
    ["all", "all", trucks.map(truck => truck.id)],
    ["assigned", "all", ["assigned-updated", "assigned-pending"]],
    ["all", "updated", ["assigned-updated", "unassigned-updated"]],
    ["all", "remaining", ["assigned-pending", "unassigned-pending"]],
    ["assigned", "updated", ["assigned-updated"]],
    ["assigned", "remaining", ["assigned-pending"]],
  ] as const)("combines %s scope with %s status", (scope, view, expected) => {
    expect(filterMileageUpdateTrucks(trucks, edits, view, scope).map(truck => truck.id)).toEqual(expected);
  });
});
