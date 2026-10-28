import { pretripWeekStart } from "./pretripDates";
import type { StatisticsRow } from "./pretripStatistics";

export type DailyDispatcherTruckCount = {
  dispatcher_id: string; date: string; truck_count: number | null; driver_count: number | null;
};
export type HistoricalTruckCounts = { counts: DailyDispatcherTruckCount[]; names: Record<string, string> };
type Statistics = { drivers: StatisticsRow[]; dispatchers: StatisticsRow[]; weekly: StatisticsRow[] };

/** Same source/formula as Analytics: sum(truck_count ?? driver_count ?? 0) / recorded days.
 * Calculate each dispatcher/week separately, then sum the weekly averages for a range.
 */
export function applyHistoricalExpectedCounts(stats: Statistics, weeks: string[], history: HistoricalTruckCounts): Statistics {
  const weekSet = new Set(weeks);
  const byWeek = new Map<string, Map<string, { total: number; days: number }>>();
  for (const record of history.counts) {
    const week = pretripWeekStart(record.date);
    if (!weekSet.has(week)) continue;
    const dispatchers = byWeek.get(week) ?? new Map();
    const count = dispatchers.get(record.dispatcher_id) ?? { total: 0, days: 0 };
    count.total += record.truck_count ?? record.driver_count ?? 0;
    count.days++;
    dispatchers.set(record.dispatcher_id, count);
    byWeek.set(week, dispatchers);
  }
  const averages = new Map<string, number>();
  for (const dispatchers of byWeek.values()) {
    for (const [id, count] of dispatchers) averages.set(id, (averages.get(id) ?? 0) + count.total / count.days);
  }
  const hasAllWeeks = weeks.every(week => byWeek.has(week));
  const existing = new Map(stats.dispatchers.map(row => [row.id, row]));
  const ids = new Set([...existing.keys(), ...averages.keys()]);
  const dispatchers = [...ids].map(id => {
    const row = existing.get(id) ?? { id, name: history.names[id] || "Unknown dispatcher", units: [], completed: 0, expected: 0, missing: 0, rate: 0 };
    const expected = averages.get(id) ?? 0;
    // No dispatcher snapshot means its denominator is unavailable, not today's fleet size.
    const expectedAvailable = hasAllWeeks && averages.has(id);
    return { ...row, expected, expectedAvailable, missing: Math.max(0, expected - row.completed), rate: expected > 0 ? row.completed / expected * 100 : 0 };
  }).sort((a, b) => Number(b.expectedAvailable) - Number(a.expectedAvailable) || b.rate - a.rate || a.name.localeCompare(b.name));
  const weekly = stats.weekly.map(row => {
    const expected = [...(byWeek.get(row.id)?.values() ?? [])].reduce((sum, count) => sum + count.total / count.days, 0);
    return { ...row, expected, expectedAvailable: byWeek.has(row.id), missing: Math.max(0, expected - row.completed), rate: expected > 0 ? row.completed / expected * 100 : 0 };
  });
  return { drivers: stats.drivers, dispatchers, weekly };
}
