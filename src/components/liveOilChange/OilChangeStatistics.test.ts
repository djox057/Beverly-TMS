import { expect, it } from "vitest";
import { dispatcherOilOverdueCounts, matchesStatisticsSelection, serviceCounts } from "./OilChangeStatistics";

it("uses source intervals and separates warnings, due, overdue, and invalid readings", () => {
  const trucks = [25000, 27000, 29000, 30000, 30001, -1].map(miles => ({ source: "BF TRUCK", miles, last_oil_change_miles: 0, air_filter: 0 }));
  expect(Object.values(serviceCounts(trucks, false))).toEqual([1, 1, 1, 1, 1, 1]);
  expect(serviceCounts([{ ...trucks[0], source: "RYDER", miles: 30001 }], false).Good).toBe(1);
});

it("uses existing air filter warnings and the 80000-mile interval", () => {
  const trucks = [60000, 60001, 80000, 80001, null].map(miles => ({ source: null, miles, last_oil_change_miles: 0, air_filter: 0 }));
  expect(Object.values(serviceCounts(trucks, true))).toEqual([1, 0, 1, 1, 1, 1]);
});

it("groups overdue oil trucks by dispatcher ID using source intervals, including zero counts and unassigned trucks", () => {
  const truck = { source: 'BF TRUCK', miles: 30001, last_oil_change_miles: 0, air_filter: null };
  const counts = dispatcherOilOverdueCounts([
    { ...truck, dispatcher_id: 'a', dispatcher_name: 'Alex' },
    { ...truck, dispatcher_id: 'a', dispatcher_name: 'Alex', miles: 40000 },
    { ...truck, dispatcher_id: 'a', dispatcher_name: 'Alex', miles: 30000 },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Alex', source: 'RYDER' },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Alex', miles: null },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Alex', miles: -1 },
    { ...truck, dispatcher_id: 'c', dispatcher_name: 'Emma', source: 'M&K', miles: 40001 },
    { ...truck, dispatcher_id: null },
  ]);
  expect(counts).toEqual([
    { id: 'a', name: 'Alex', overdue: 2, notUpdated: 3 },
    { id: 'c', name: 'Emma', overdue: 1, notUpdated: 1 },
    { id: null, name: 'No dispatcher', overdue: 1, notUpdated: 1 },
    { id: 'b', name: 'Alex', overdue: 0, notUpdated: 3 },
  ]);
  expect(dispatcherOilOverdueCounts([])).toEqual([]);
});

it("filters overdue trucks by dispatcher identity, including unassigned trucks", () => {
  const truck = { source: 'BF TRUCK', miles: 30001, last_oil_change_miles: 0, air_filter: null, dispatcher_id: 'a' };
  const selected = { category: 'oil' as const, status: 'Overdue', dispatcherId: 'a' };
  expect(matchesStatisticsSelection(truck, selected)).toBe(true);
  expect(matchesStatisticsSelection({ ...truck, dispatcher_id: 'b' }, selected)).toBe(false);
  expect(matchesStatisticsSelection({ ...truck, miles: 30000 }, selected)).toBe(false);
  expect(matchesStatisticsSelection({ ...truck, dispatcher_id: null }, { ...selected, dispatcherId: null })).toBe(true);
  expect(matchesStatisticsSelection(truck, { ...selected, dispatcherId: null })).toBe(false);
});

it('counts yellow and red mileage warnings independently of overdue oil and respects the early-update allowance', () => {
  const now = new Date('2026-10-20T15:00:00Z');
  const truck = { dispatcher_id: 'a', dispatcher_name: 'Alex', source: 'BF TRUCK', miles: 100, last_oil_change_miles: 0, air_filter: null };
  const rows = [null, '2026-09-19', '2026-10-11', '2026-10-12', '2026-10-20'].map(miles_updated_at => ({ ...truck, miles_updated_at }));
  expect(dispatcherOilOverdueCounts(rows, now)).toEqual([{ id: 'a', name: 'Alex', overdue: 0, notUpdated: 3 }]);
  expect(dispatcherOilOverdueCounts([{ ...truck, miles_updated_at: '2026-10-12' }], new Date('2026-10-19T15:00:00Z'))[0].notUpdated).toBe(0);
});
it('filters missing mileage updates to the selected dispatcher independently of oil overdue', () => {
  const truck = { dispatcher_id: 'a', source: 'BF TRUCK', miles: 100, last_oil_change_miles: 0, air_filter: null, miles_updated_at: null };
  const selection = { category: 'mileage' as const, status: 'Not updated', dispatcherId: 'a' };
  expect(matchesStatisticsSelection(truck, selection)).toBe(true);
  expect(matchesStatisticsSelection({ ...truck, dispatcher_id: 'b' }, selection)).toBe(false);
  expect(matchesStatisticsSelection({ ...truck, miles_updated_at: new Date().toISOString() }, selection)).toBe(false);
});
