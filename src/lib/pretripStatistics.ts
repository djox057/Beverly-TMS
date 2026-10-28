import { fromZonedTime } from "date-fns-tz";
import { pretripWeekStart, stepPretripDate } from "./pretripDates";

// Launch was Friday Sep 25; skip that partial Chicago calendar week.
export const PRETRIP_STATISTICS_START = "2026-09-28";
export type StatisticsTruck = {
  id: string; truck_number: string; driver1_id: string | null; driver2_id: string | null;
  driver_name?: string | null; driver2_name?: string | null;
  dispatcher_id?: string | null; dispatcher_name?: string | null;
};
export type CompletionEvidence = { truck_id: string | null; inspection_date: string | null };
export type StatisticsRow = { id: string; name: string; units: string[]; expected: number; completed: number; missing: number; rate: number };

export type DispatcherChange = {
  id: string; driver1_id: string | null; changed_at: string;
  dispatcher_id: string | null; old_dispatcher_id: string | null;
  dispatcher_name_snapshot: string | null; old_dispatcher_name_snapshot: string | null;
};
export type PretripDispatcherHistory = {
  drivers: Record<string, { dispatcher_id: string | null; created_at: string }>;
  changes: DispatcherChange[];
  names: Record<string, string>;
};

/** Reverse later changes, including the first change AFTER the selected range. */
export function dispatcherForWeek(driverId: string | null, week: string, history: PretripDispatcherHistory) {
  const cutoff = fromZonedTime(`${stepPretripDate(week, 1)}T00:00:00`, "America/Chicago").getTime();
  const driver = driverId ? history.drivers[driverId] : undefined;
  if (!driver || new Date(driver.created_at).getTime() >= cutoff) return { id: "unknown-history", name: "Unknown historical assignment" };
  let id = driver.dispatcher_id;
  let snapshot: string | null = null;
  const later = history.changes.filter(c => c.driver1_id === driverId && new Date(c.changed_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime() || b.id.localeCompare(a.id));
  for (const change of later) { id = change.old_dispatcher_id; snapshot = change.old_dispatcher_name_snapshot; }
  return {
    id: id || (snapshot ? `snapshot:${snapshot}` : "unassigned"),
    name: (id ? history.names[id] : null) || snapshot || (id ? "Unknown dispatcher" : "Unassigned"),
  };
}

export function statisticsWeeks(from: string, through: string): string[] {
  const weeks: string[] = [];
  for (let week = pretripWeekStart(from < PRETRIP_STATISTICS_START ? PRETRIP_STATISTICS_START : from); week <= through; week = stepPretripDate(week, 1)) weeks.push(week);
  return weeks;
}

/** One completion per truck/week, regardless of number or source of submissions. */
export function buildPretripStatistics(trucks: StatisticsTruck[], weeks: string[], evidence: CompletionEvidence[], history?: PretripDispatcherHistory) {
  const completed = new Set(evidence.filter(e => e.truck_id && e.inspection_date).map(e => `${e.truck_id}:${pretripWeekStart(e.inspection_date!)}`));
  const drivers = new Map<string, StatisticsRow>(), dispatchers = new Map<string, StatisticsRow>();
  const add = (map: Map<string, StatisticsRow>, id: string, name: string, truck: StatisticsTruck, count: number, expected = weeks.length) => {
    const row = map.get(id) ?? { id, name, units: [], expected: 0, completed: 0, missing: 0, rate: 0 };
    if (!row.units.includes(truck.truck_number)) row.units.push(truck.truck_number); row.expected += expected; row.completed += count;
    row.missing = row.expected - row.completed; row.rate = row.expected ? row.completed / row.expected * 100 : 0;
    map.set(id, row);
  };
  for (const truck of trucks) {
    const count = weeks.filter(week => completed.has(`${truck.id}:${week}`)).length;
    for (const id of new Set([truck.driver1_id, truck.driver2_id].filter(Boolean) as string[])) {
      add(drivers, id, (id === truck.driver1_id ? truck.driver_name : truck.driver2_name) || "Unknown driver", truck, count);
    }
    for (const week of weeks) {
      const dispatcher = history ? dispatcherForWeek(truck.driver1_id ?? truck.driver2_id, week, history)
        : { id: truck.dispatcher_id || "unassigned", name: truck.dispatcher_name || (truck.dispatcher_id ? "Unknown dispatcher" : "Unassigned") };
      add(dispatchers, dispatcher.id, dispatcher.name, truck, completed.has(`${truck.id}:${week}`) ? 1 : 0, 1);
    }
  }
  const weekly = weeks.map(week => {
    const count = trucks.filter(t => completed.has(`${t.id}:${week}`)).length;
    return { id: week, name: week, units: [], expected: trucks.length, completed: count, missing: trucks.length - count, rate: trucks.length ? count / trucks.length * 100 : 0 };
  });
  const sort = (rows: Map<string, StatisticsRow>) => [...rows.values()].sort((a,b) => b.rate - a.rate || a.name.localeCompare(b.name));
  return { drivers: sort(drivers), dispatchers: sort(dispatchers), weekly };
}
