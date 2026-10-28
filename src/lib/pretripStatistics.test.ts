import { describe, expect, it } from "vitest";
import { buildPretripStatistics, dispatcherForWeek, statisticsWeeks, type StatisticsTruck } from "./pretripStatistics";
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

describe("historical dispatcher attribution", () => {
  const history = {
    drivers: { a: { dispatcher_id: "new", created_at: "2026-01-01T00:00:00Z" } },
    names: { old: "Old dispatcher", middle: "Middle dispatcher", new: "New dispatcher" },
    changes: [
      { id: "later", driver1_id: "a", changed_at: "2026-10-20T12:00:00Z", dispatcher_id: "new", old_dispatcher_id: "middle", dispatcher_name_snapshot: null, old_dispatcher_name_snapshot: null },
      { id: "earlier", driver1_id: "a", changed_at: "2026-10-06T12:00:00Z", dispatcher_id: "middle", old_dispatcher_id: "old", dispatcher_name_snapshot: null, old_dispatcher_name_snapshot: null },
    ],
  };
  it("uses a different dispatcher per week, even when the first known change is after the selected range", () => {
    const result = buildPretripStatistics([trucks[0]], ["2026-09-28", "2026-10-05"], [{ truck_id: "one", inspection_date: "2026-09-29" }], history);
    expect(result.dispatchers.find(r => r.id === "old")).toMatchObject({ name: "Old dispatcher", expected: 1, completed: 1, missing: 0 });
    expect(result.dispatchers.find(r => r.id === "middle")).toMatchObject({ expected: 1, completed: 0, missing: 1 });
    expect(result.dispatchers.some(r => r.id === "new" || r.id === "d")).toBe(false);
    expect(result.dispatchers.reduce((sum, r) => sum + r.expected, 0)).toBe(2);
    expect(result.drivers.find(r => r.id === "b")).toMatchObject({ expected: 2, completed: 1 });
  });
  it("keeps an explicit old null as unassigned and uses name snapshots for deleted dispatchers", () => {
    const change = { ...history.changes[0], old_dispatcher_id: null, old_dispatcher_name_snapshot: null };
    expect(dispatcherForWeek("a", "2026-09-28", { ...history, changes: [change] })).toEqual({ id: "unassigned", name: "Unassigned" });
    expect(dispatcherForWeek("a", "2026-09-28", { ...history, changes: [{ ...change, old_dispatcher_name_snapshot: "Former dispatcher" }] })).toEqual({ id: "snapshot:Former dispatcher", name: "Former dispatcher" });
  });
  it("uses Chicago week boundaries across daylight saving and ignores other drivers", () => {
    const change = { ...history.changes[0], changed_at: "2026-11-02T06:00:00Z", old_dispatcher_id: "old" };
    expect(dispatcherForWeek("a", "2026-10-26", { ...history, changes: [change] }).id).toBe("old");
    expect(dispatcherForWeek("a", "2026-11-02", { ...history, changes: [change] }).id).toBe("new");
    expect(dispatcherForWeek("a", "2026-09-28", { ...history, changes: [{ ...change, driver1_id: "other" }] }).id).toBe("new");
  });
  it("uses unchanged driver assignments, secondary-only drivers, and labels unavailable history", () => {
    expect(dispatcherForWeek("a", "2026-09-28", { ...history, changes: [] }).id).toBe("new");
    const result = buildPretripStatistics([trucks[1]], ["2026-09-28"], [], { ...history, drivers: { c: history.drivers.a }, changes: [] });
    expect(result.dispatchers[0].id).toBe("new");
    expect(dispatcherForWeek("missing", "2026-09-28", history).id).toBe("unknown-history");
    expect(dispatcherForWeek("a", "2026-09-28", { ...history, drivers: { a: { dispatcher_id: "new", created_at: "2026-10-20T00:00:00Z" } } }).id).toBe("unknown-history");
  });
});
