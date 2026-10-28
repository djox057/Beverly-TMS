import { expect, it } from "vitest";
import { applyHistoricalExpectedCounts } from "./pretripExpectedCounts";
import { buildPretripStatistics } from "./pretripStatistics";
const trucks = [{ id: "t", truck_number: "100", driver1_id: "a", driver2_id: null, dispatcher_id: "d", dispatcher_name: "Dan" }];
const weeks = ["2026-09-28", "2026-10-05"];
const stats = () => buildPretripStatistics(trucks, weeks, [{ truck_id: "t", inspection_date: "2026-09-28" }]);
it("copies Analytics' recorded-day average per dispatcher and week, not today's fleet size or seven-day dilution", () => {
  const result = applyHistoricalExpectedCounts(stats(), weeks, { counts: [
    { dispatcher_id: "d", date: "2026-09-28", truck_count: 10, driver_count: 20 },
    { dispatcher_id: "d", date: "2026-09-30", truck_count: 20, driver_count: 20 },
    { dispatcher_id: "d", date: "2026-10-05", truck_count: 5, driver_count: 20 },
    { dispatcher_id: "former", date: "2026-09-29", truck_count: 3, driver_count: 20 },
    { dispatcher_id: "outside", date: "2026-09-25", truck_count: 999, driver_count: 999 },
  ], names: { former: "Former dispatcher" } });
  expect(result.dispatchers.find(r => r.id === "d")).toMatchObject({ expected: 20, completed: 1, missing: 19, rate: 5, expectedAvailable: true });
  expect(result.dispatchers.find(r => r.id === "former")).toMatchObject({ name: "Former dispatcher", expected: 3, completed: 0 });
  expect(result.weekly.map(r => r.expected)).toEqual([18, 5]);
  expect(result.drivers).toEqual(stats().drivers);
  expect(result.dispatchers.some(r => r.id === "outside")).toBe(false);
});
it("preserves fractions and uses driver_count only when truck_count is null, including valid zero snapshots", () => {
  const result = applyHistoricalExpectedCounts(stats(), weeks, { counts: [
    { dispatcher_id: "d", date: weeks[0], truck_count: null, driver_count: 5 },
    { dispatcher_id: "d", date: "2026-09-29", truck_count: 0, driver_count: 20 },
    { dispatcher_id: "d", date: weeks[1], truck_count: 0, driver_count: 20 },
  ], names: {} });
  expect(result.weekly[0]).toMatchObject({ expected: 2.5, completed: 1, missing: 1.5, rate: 40 });
  expect(result.weekly[1]).toMatchObject({ expected: 0, expectedAvailable: true, missing: 0, rate: 0 });
});
it("marks missing history unavailable instead of substituting the current truck count", () => {
  const result = applyHistoricalExpectedCounts(stats(), weeks, { counts: [{ dispatcher_id: "d", date: weeks[0], truck_count: 10, driver_count: 10 }], names: {} });
  expect(result.weekly[1]).toMatchObject({ expected: 0, expectedAvailable: false });
  expect(result.dispatchers[0].expectedAvailable).toBe(false);
  expect(applyHistoricalExpectedCounts(stats(), weeks, { counts: [], names: {} }).weekly.every(r => !r.expectedAvailable)).toBe(true);
});
it("never gives negative missing counts or hides completion when a weekly average is exceeded", () => {
  const result = applyHistoricalExpectedCounts(stats(), weeks, { counts: [
    { dispatcher_id: "d", date: weeks[0], truck_count: 0, driver_count: 0 },
    { dispatcher_id: "d", date: "2026-09-29", truck_count: 1, driver_count: 1 },
    { dispatcher_id: "d", date: weeks[1], truck_count: 0, driver_count: 0 },
  ], names: {} });
  expect(result.dispatchers[0]).toMatchObject({ expected: 0.5, completed: 1, missing: 0, rate: 200 });
});
