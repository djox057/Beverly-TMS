import { describe, expect, it } from "vitest";
import { isAssignedPretripTruck, pretripCompletionCount } from "./pretripCompletion";

describe("Pretrip truck eligibility", () => {
  const truck = { id: "unit", is_active: true, driver1_id: null, driver2_id: null };
  it("hides active unassigned trucks, even if they have inspection history", () => {
    expect(isAssignedPretripTruck(truck)).toBe(false);
  });
  it("includes a truck with a driver in either slot", () => {
    expect(isAssignedPretripTruck({ ...truck, driver1_id: "driver" })).toBe(true);
    expect(isAssignedPretripTruck({ ...truck, driver2_id: "driver" })).toBe(true);
  });
  it("removes trucks after the last driver is unassigned or the truck becomes inactive", () => {
    const assigned = { ...truck, driver1_id: "driver" };
    expect(isAssignedPretripTruck({ ...assigned, driver1_id: null })).toBe(false);
    expect(isAssignedPretripTruck({ ...assigned, is_active: false })).toBe(false);
  });
});

describe("Selected-week pretrip completion", () => {
  const trucks = [{ id: "form-truck" }, { id: "manual-truck" }, { id: "missing-truck" }];
  const forms = { "form-truck": [{ status: "imported" }, { status: "pending" }] };
  const photos = { "form-truck": [{}, {}], "manual-truck": [{}] };
  it("counts trucks once across repeated forms and multiple photos", () => {
    expect(pretripCompletionCount(trucks, forms, photos)).toEqual({ completed: 2, total: 3, remaining: 1 });
  });
  it("counts a submitted form while its photo import still needs attention", () => {
    expect(pretripCompletionCount([{ id: "pending" }], { pending: [{ status: "error" }] }, {})).toEqual({ completed: 1, total: 1, remaining: 0 });
  });
  it("does not count a superseded form as a submission", () => {
    expect(pretripCompletionCount([{ id: "old" }], { old: [{ status: "superseded" }] }, {})).toEqual({ completed: 0, total: 1, remaining: 1 });
  });
  it("uses only the trucks in the current filters and permission scope", () => {
    expect(pretripCompletionCount([trucks[2]], forms, photos)).toEqual({ completed: 0, total: 1, remaining: 1 });
  });
  it("does not carry completion into a week without submissions or photos", () => {
    expect(pretripCompletionCount(trucks, {}, {})).toEqual({ completed: 0, total: 3, remaining: 3 });
  });
  it("handles empty and duplicate truck lists without inflating the counter", () => {
    expect(pretripCompletionCount([], forms, photos)).toEqual({ completed: 0, total: 0, remaining: 0 });
    expect(pretripCompletionCount([trucks[0], trucks[0]], forms, photos)).toEqual({ completed: 1, total: 1, remaining: 0 });
  });
});
