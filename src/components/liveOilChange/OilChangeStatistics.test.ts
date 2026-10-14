import { expect, it } from "vitest";
import { serviceCounts } from "./OilChangeStatistics";

it("uses source intervals and separates warnings, due, overdue, and invalid readings", () => {
  const trucks = [25000, 27000, 29000, 30000, 30001, -1].map(miles => ({ source: "BF TRUCK", miles, last_oil_change_miles: 0, air_filter: 0 }));
  expect(Object.values(serviceCounts(trucks, false))).toEqual([1, 1, 1, 1, 1, 1]);
  expect(serviceCounts([{ ...trucks[0], source: "RYDER", miles: 30001 }], false).Good).toBe(1);
});

it("uses existing air filter warnings and the 80000-mile interval", () => {
  const trucks = [60000, 60001, 80000, 80001, null].map(miles => ({ source: null, miles, last_oil_change_miles: 0, air_filter: 0 }));
  expect(Object.values(serviceCounts(trucks, true))).toEqual([1, 0, 1, 1, 1, 1]);
});
