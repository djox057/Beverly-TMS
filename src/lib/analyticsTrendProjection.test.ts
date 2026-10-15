import { expect, it } from "vitest";
import { projectAnalyticsTrend, type TrendPoint } from "./analyticsTrendProjection";
const point = (key: string, freight: number, extra: Partial<TrendPoint> = {}): TrendPoint => ({ key, freight, miles: freight / 3, driverPay: freight * .8, comm: freight * .2, rpm: 3, commPct: 20, freightPerDriver: freight / 10, driverPayPerDriver: freight * .08, driverCount: 10, elapsedFreight: freight, elapsedMiles: freight / 3, elapsedDriverPay: freight * .8, ...extra });
const thursday = new Date("2026-10-15T12:00:00");
it("forecasts next week from completed history instead of multiplying sparse future bookings", () => {
  const result = projectAnalyticsTrend([point("2026-09-28", 2400000), point("2026-10-05", 2600000), point("2026-10-12", 2200000), point("2026-10-19", 15405)], "weekly", thursday);
  expect(result).toMatchObject({ freight: 2500000, rpm: 3, commPct: 20, freightPerDriver: 250000 });
});
it("does not scale the entire booked current week as if all loads already happened", () => {
  const result = projectAnalyticsTrend([point("2026-10-12", 2000000, { elapsedFreight: 1000000, elapsedMiles: 300000, elapsedDriverPay: 800000 })], "weekly", thursday);
  expect(result?.freight).toBe(2000000); // floor beats 1M * 7/4, not 2M * 5/4
});
it("uses seven calendar days for a trucking week", () => {
  const result = projectAnalyticsTrend([point("2026-10-12", 1000000)], "weekly", thursday);
  expect(result?.freight).toBe(1750000);
});
it("leaves completed periods and the final day as actual values", () => {
  expect(projectAnalyticsTrend([point("2026-10-05", 100)], "weekly", thursday)).toBeNull();
  expect(projectAnalyticsTrend([point("2026-10-12", 100)], "weekly", new Date("2026-10-18T12:00:00"))).toBeNull();
});
it("does not invent a future estimate without completed history", () => {
  expect(projectAnalyticsTrend([point("2026-10-19", 15405)], "weekly", thursday)).toBeNull();
});
it("uses only the latest four completed periods and respects known bookings", () => {
  const data = [point("2026-08-31", 999999), point("2026-09-07", 100), point("2026-09-14", 200), point("2026-09-21", 300), point("2026-09-28", 400), point("2026-10-19", 50)];
  expect(projectAnalyticsTrend(data, "weekly", thursday)?.freight).toBe(250);
  data[data.length - 1].freight = 600;
  expect(projectAnalyticsTrend(data, "weekly", thursday)?.freight).toBe(600);
});
it("handles current and future months separately", () => {
  expect(projectAnalyticsTrend([point("2026-10", 1500)], "monthly", thursday)?.freight).toBe(3100);
  expect(projectAnalyticsTrend([point("2026-09", 3000), point("2026-10", 100), point("2026-11", 10)], "monthly", thursday)?.freight).toBe(3000);
});
it("leaves daily charts unchanged", () => {
  expect(projectAnalyticsTrend([point("2026-10-15", 100)], "daily", thursday)).toBeNull();
});
