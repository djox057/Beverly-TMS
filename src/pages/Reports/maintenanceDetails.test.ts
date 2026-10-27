import { afterEach, expect, it, vi } from "vitest";
import { getMaintenanceIconStatus } from "./helpers";

afterEach(() => vi.useRealTimers());
it("keeps oil mileage and due odometer visible when only the maintenance check is overdue", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const status = getMaintenanceIconStatus({ truck_miles: 120000, last_oil_change_miles: 100000, source: "BF TRUCK", maintenance_check_date: "2026-10-04" });
  expect(status.show).toBe(true);
  expect(status.oilTriggered).toBe(false);
  expect(status.tooltip).toContain("20,000 mi since last change; 8,000 mi remaining; due at 128,000 mi");
  expect(status.tooltip).toContain("Maintenance Check: Overdue");
});
it("shows mileage overdue and the source-specific due odometer", () => {
  const status = getMaintenanceIconStatus({ truck_miles: 136500, last_oil_change_miles: 100000, source: "M&K" });
  expect(status.tooltip).toContain("1,500 mi overdue; due at 135,000 mi (35,000-mi interval)");
});
it("does not create an alert for oil mileage below the warning threshold", () => {
  expect(getMaintenanceIconStatus({ truck_miles: 120000, last_oil_change_miles: 100000 }).show).toBe(false);
});
