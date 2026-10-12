import { expect, it } from "vitest";
import { chicagoTodayISO, daysSinceMileageUpdate, getMileageUpdateStatus } from "./mileageUpdateStatus";

it.each([
  ["2026-10-12T04:59:59Z", "2026-10-11"],
  ["2026-10-12T05:00:00Z", "2026-10-12"],
  ["2026-03-08T07:59:59Z", "2026-03-08"],
  ["2026-03-08T08:00:00Z", "2026-03-08"],
  ["2026-11-01T06:59:59Z", "2026-11-01"],
  ["2026-11-01T07:00:00Z", "2026-11-01"],
])("formats Chicago calendar dates correctly at timezone/DST boundaries: %s", (instant, expected) => {
  expect(chicagoTodayISO(new Date(instant))).toBe(expected);
});
it("keeps the existing freshness deadlines, grace period, and overdue boundary", () => {
  const now = new Date("2026-10-20T15:00:00Z");
  expect(getMileageUpdateStatus(null, now)).toBe("red");
  expect(getMileageUpdateStatus("2026-09-19", now)).toBe("red");
  expect(getMileageUpdateStatus("2026-09-20", now)).toBe("yellow");
  expect(getMileageUpdateStatus("2026-10-11", now)).toBe("yellow");
  expect(getMileageUpdateStatus("2026-10-12", now)).toBe("none");
  expect(daysSinceMileageUpdate("2026-10-12", now)).toBe(8);
});
