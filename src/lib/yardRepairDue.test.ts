import { describe, expect, it } from "vitest";
import { chicagoToday, getActiveMandatoryYardRepairAlerts, hasActiveMandatoryYardRepairDueWithin, hasOverdueTruckRequirement, isPastDue, type DueTask } from "./yardRepairDue";

const task = (service_type: DueTask["service_type"], due_date: string, status: DueTask["status"] = "pending"): DueTask => ({ service_type, due_date, status });
describe("yard repair deadlines", () => {
  it("uses Chicago's calendar date on both sides of midnight, including DST", () => {
    expect(chicagoToday(new Date("2026-10-06T04:59:00Z"))).toBe("2026-10-05");
    expect(chicagoToday(new Date("2026-10-06T05:00:00Z"))).toBe("2026-10-06");
    expect(chicagoToday(new Date("2026-12-06T05:59:00Z"))).toBe("2026-12-05");
    expect(chicagoToday(new Date("2026-12-06T06:00:00Z"))).toBe("2026-12-06");
  });
  it("does not treat today, future dates, or missing dates as overdue", () => {
    for (const date of [null, undefined, "", "2026-10-05", "2026-10-06"]) expect(isPastDue(date, "2026-10-05")).toBe(false);
    expect(isPastDue("2026-10-04", "2026-10-05")).toBe(true);
  });
  it("turns truck numbers red only for open overdue mandatory repairs or DOT", () => {
    expect(hasOverdueTruckRequirement([task("mandatory_yard_repair", "2026-10-04")], null, null, "2026-10-05")).toBe(true);
    expect(hasOverdueTruckRequirement([task("dot", "2026-10-04", "in_progress")], null, null, "2026-10-05")).toBe(true);
    expect(hasOverdueTruckRequirement([task("oil_change", "2026-10-04")], null, null, "2026-10-05")).toBe(false);
    expect(hasOverdueTruckRequirement([task("mandatory_yard_repair", "2026-10-04", "completed"), task("dot", "2026-10-04", "cancelled")], null, null, "2026-10-05")).toBe(false);
  });
  it("shows every active mandatory yard repair, regardless of due date, but hides closed tasks", () => {
    const alerts = getActiveMandatoryYardRepairAlerts([
      task("mandatory_yard_repair", "2026-10-14"),
      task("mandatory_yard_repair", "2026-10-31", "in_progress"),
      task("mandatory_yard_repair", "2026-10-04", "completed"),
      task("mandatory_yard_repair", "2026-10-04", "cancelled"),
      task("dot", "2026-10-04"),
    ]);
    expect(alerts).toHaveLength(2);
    expect(alerts.map(item => item.due_date)).toEqual(["2026-10-14", "2026-10-31"]);
  });
  it("keeps existing truck/trailer DOT expiration active independently of task completion", () => {
    const completed = [task("dot", "2026-10-04", "completed")];
    expect(hasOverdueTruckRequirement(completed, "2026-10-04", null, "2026-10-05")).toBe(true);
    expect(hasOverdueTruckRequirement([], null, "2026-10-04", "2026-10-05")).toBe(true);
    expect(hasOverdueTruckRequirement([], "2026-10-05", "2026-10-06", "2026-10-05")).toBe(false);
  });
});

  it("turns the alert icon red within five days, and truck/driver labels red within two days", () => {
    const active = (due: string, status: DueTask["status"] = "pending") => task("mandatory_yard_repair", due, status);
    const today = "2026-10-08";
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-13")], today, 5)).toBe(true);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-14")], today, 5)).toBe(false);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-10")], today, 2)).toBe(true);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-11")], today, 2)).toBe(false);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-07")], today, 2)).toBe(true);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-08", "completed")], today, 5)).toBe(false);
    expect(hasActiveMandatoryYardRepairDueWithin([active("2026-10-08", "cancelled")], today, 5)).toBe(false);
  });
