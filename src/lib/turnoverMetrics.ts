import { addDays, endOfMonth, format, startOfMonth, subMonths, differenceInCalendarDays } from "date-fns";

export const TURNOVER_HISTORY_FROM = "2026-04-01";
export type TurnoverGroup = { month_start: string; dispatcher_id: string | null; dispatcher_name: string; office: string; driver_days: number; departures: number; excluded: number; reactivations: number; estimated: boolean };
export type TurnoverMonth = { month_start: string; expected_days: number; observed_days: number; legacy_days: number; partial_today: boolean };
export type TurnoverData = { available: boolean; start: string; end: string; historical_from: string; tracking_started: string; groups: TurnoverGroup[]; months: TurnoverMonth[]; dispatchers: { dispatcher_id: string; dispatcher_name: string; office: string }[]; missing_dates: string[] };
export type TurnoverFilter = { office?: string; dispatcher?: string };
export type TurnoverSummary = { driverDays: number; averageActive: number | null; departures: number; excluded: number; reactivations: number; rate: number | null; share: number | null; observedDays: number; expectedDays: number; estimated: boolean };
export type TurnoverRow = TurnoverSummary & { key: string; name: string; office: string; dispatcherId?: string | null };
export const dayString = (date: Date) => format(date,"yyyy-MM-dd");
export const dateFromDay = (value: string) => new Date(`${value}T12:00:00`);
const matches = (g: TurnoverGroup, filter: TurnoverFilter) => (!filter.office || g.office === filter.office) && (!filter.dispatcher || (g.dispatcher_id || "unassigned") === filter.dispatcher);

export function summarizeTurnover(data: TurnoverData, filter: TurnoverFilter = {}): TurnoverSummary {
  const rows = data.groups.filter(g => matches(g,filter));
  const driverDays = rows.reduce((s,g) => s+Number(g.driver_days),0);
  const departures = rows.reduce((s,g) => s+g.departures,0);
  const globalDepartures = data.groups.reduce((s,g) => s+g.departures,0);
  const observedDays = data.months.reduce((s,m) => s+m.observed_days,0);
  const expectedDays = data.months.reduce((s,m) => s+m.expected_days,0);
  const averageActive = observedDays ? driverDays/observedDays : null;
  return { driverDays,averageActive,departures,excluded: rows.reduce((s,g) => s+g.excluded,0),reactivations: rows.reduce((s,g) => s+g.reactivations,0),rate: averageActive != null && averageActive>0 ? departures/averageActive*100 : null,share: globalDepartures>0 ? departures/globalDepartures*100 : null,observedDays,expectedDays,estimated: rows.some(g => g.estimated) || observedDays<expectedDays || data.months.some(m => m.partial_today) };
}
export function turnoverRows(data: TurnoverData, mode: "office" | "dispatcher", filter: TurnoverFilter = {}): TurnoverRow[] {
  const keys = new Map<string,{ name: string; office: string; dispatcherId?: string | null }>();
  for (const g of data.groups.filter(g => matches(g,filter))) {
    const key = mode === "office" ? g.office : g.dispatcher_id || "unassigned";
    const old = keys.get(key);
    keys.set(key,{ name: mode === "office" ? g.office : g.dispatcher_name,office: old && old.office !== g.office ? "Multiple offices" : g.office,dispatcherId: g.dispatcher_id });
  }
  // Include staff with no departures or active drivers in the selected period.
  for (const d of data.dispatchers) {
    if (filter.office && d.office !== filter.office || filter.dispatcher && d.dispatcher_id !== filter.dispatcher) continue;
    const key = mode === "office" ? d.office : d.dispatcher_id;
    if (!keys.has(key)) keys.set(key,{ name: mode === "office" ? d.office : d.dispatcher_name,office: d.office,dispatcherId: d.dispatcher_id });
  }
  return [...keys].map(([key,meta]) => ({ key,...meta,...summarizeTurnover(data,{ ...filter,...(mode === "office" ? { office: key } : { dispatcher: key }) }) })).sort((a,b) => b.departures-a.departures || a.name.localeCompare(b.name));
}
export function previousTurnoverPeriod(start: string,end: string) {
  const from = dateFromDay(start),to = dateFromDay(end);
  if (from.getDate() === 1 && from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    const previous = startOfMonth(subMonths(from,1));
    const last = endOfMonth(previous);
    const through = to.getDate() === endOfMonth(to).getDate() ? last : addDays(previous,Math.min(to.getDate(),last.getDate())-1);
    return { start: dayString(previous),end: dayString(through) };
  }
  const previousEnd = addDays(from,-1);
  return { start: dayString(addDays(previousEnd,-differenceInCalendarDays(to,from))),end: dayString(previousEnd) };
}
export function monthlyTurnover(data: TurnoverData, filter: TurnoverFilter = {}) {
  return data.months.map(month => ({ month: month.month_start.slice(0,7),...summarizeTurnover({ ...data,groups: data.groups.filter(g => g.month_start === month.month_start),months: [month] },filter) }));
}
