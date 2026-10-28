import { describe, expect, it } from "vitest";
import { buildPretripStatistics, statisticsWeeks, type StatisticsTruck } from "./pretripStatistics";
const trucks: StatisticsTruck[] = [
  { id: "one", truck_number: "100", driver1_id: "a", driver2_id: "b", driver_name: "Alice", driver2_name: "Bob", dispatcher_id: "d", dispatcher_name: "Dispatcher" },
  { id: "two", truck_number: "200", driver1_id: null, driver2_id: "c", driver2_name: "Carol", dispatcher_id: "d", dispatcher_name: "Dispatcher" },
  { id: "three", truck_number: "300", driver1_id: "e", driver2_id: null },
];
describe("pretrip statistics", () => {
  it("excludes launch week, includes weeks across month boundaries, and handles an empty range", () => {
    expect(statisticsWeeks("2026-09-21", "2026-10-05")).toEqual(["2026-09-28", "2026-10-05"]);
    expect(statisticsWeeks("2026-10-05", "2026-09-28")).toEqual([]);
  });
  it("counts a truck once per week, credits both team drivers, and weights dispatcher totals by truck-weeks", () => {
    const result = buildPretripStatistics(trucks, ["2026-09-28", "2026-10-05"], [
      { truck_id: "one", inspection_date: "2026-09-28" },
      { truck_id: "one", inspection_date: "2026-10-04" },
      { truck_id: "one", inspection_date: "2026-10-05" },
      { truck_id: "two", inspection_date: "2026-10-11" },
      { truck_id: "one", inspection_date: "2026-09-25" },
      { truck_id: "other", inspection_date: "2026-10-05" },
      { truck_id: null, inspection_date: null },
    ]);
    expect(result.drivers.find(r => r.id === "a")).toMatchObject({ completed: 2, expected: 2, rate: 100 });
    expect(result.drivers.find(r => r.id === "b")).toMatchObject({ completed: 2, expected: 2 });
    expect(result.drivers.find(r => r.id === "c")).toMatchObject({ name: "Carol", completed: 1, missing: 1, rate: 50 });
    expect(result.dispatchers.find(r => r.id === "d")).toMatchObject({ completed: 3, expected: 4, rate: 75 });
    expect(result.dispatchers.find(r => r.id === "unassigned")).toMatchObject({ completed: 0, missing: 2 });
    expect(result.weekly.map(r => [r.expected, r.completed])).toEqual([[3, 1], [3, 2]]);
  });
  it("never reports NaN for no trucks or no weeks", () => {
    expect(buildPretripStatistics([], ["2026-09-28"], []).weekly[0].rate).toBe(0);
    expect(buildPretripStatistics(trucks, [], []).drivers[0].rate).toBe(0);
  });
});
