import { differenceInCalendarDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";

export type TrendGranularity = "daily" | "weekly" | "monthly";
export type TrendMetrics = { freight: number; miles: number; driverPay: number; comm: number; rpm: number; commPct: number; freightPerDriver: number; driverPayPerDriver: number };
export type TrendPoint = TrendMetrics & { key: string; driverCount: number; elapsedFreight: number; elapsedMiles: number; elapsedDriverPay: number };

/** Calendar-day pace for an open period; recent completed periods for a future one. */
export function projectAnalyticsTrend(data: TrendPoint[], granularity: TrendGranularity, today: Date): TrendMetrics | null {
  if (granularity === "daily" || !data.length) return null;
  const bounds = (key: string) => {
    const date = new Date(`${key}${granularity === "monthly" ? "-01" : ""}T00:00:00`);
    return granularity === "weekly"
      ? { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) }
      : { start: startOfMonth(date), end: endOfMonth(date) };
  };
  const last = data[data.length - 1];
  const { start, end } = bounds(last.key);
  if (today > end) return null; // Never replace a completed period's actuals.
  const history = data.filter(point => bounds(point.key).end < today).slice(-4);
  let freight: number, miles: number, driverPay: number, drivers: number;
  if (today < start) {
    if (!history.length) return null; // Bookings alone are not a future forecast.
    const average = (key: "freight" | "miles" | "driverPay" | "driverCount") => history.reduce((sum, point) => sum + point[key], 0) / history.length;
    freight = Math.max(last.freight, average("freight"));
    miles = Math.max(last.miles, average("miles"));
    driverPay = Math.max(last.driverPay, average("driverPay"));
    drivers = Math.max(last.driverCount, average("driverCount"));
  } else {
    // Trucks operate seven days a week. Only elapsed-date loads establish pace;
    // later bookings in the same period provide a floor, not extra elapsed work.
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const elapsedDays = differenceInCalendarDays(today, start) + 1;
    if (elapsedDays >= totalDays) return null;
    const ratio = totalDays / elapsedDays;
    freight = Math.max(last.freight, last.elapsedFreight * ratio);
    miles = Math.max(last.miles, last.elapsedMiles * ratio);
    driverPay = Math.max(last.driverPay, last.elapsedDriverPay * ratio);
    drivers = last.driverCount;
  }
  const comm = freight - driverPay;
  return {
    freight: Math.round(freight), miles: Math.round(miles), driverPay: Math.round(driverPay), comm: Math.round(comm),
    rpm: miles > 0 ? Number((freight / miles).toFixed(2)) : 0,
    commPct: freight > 0 ? Number((comm / freight * 100).toFixed(1)) : 0,
    freightPerDriver: drivers > 0 ? Math.round(freight / drivers) : 0,
    driverPayPerDriver: drivers > 0 ? Math.round(driverPay / drivers) : 0,
  };
}
