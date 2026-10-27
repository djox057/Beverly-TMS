import { afterEach, expect, it, vi } from "vitest";
import { getMaintenanceIconStatus } from "./helpers";

afterEach(() => vi.useRealTimers());
it("shows only the maintenance warning when oil mileage is below its warning threshold", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const status = getMaintenanceIconStatus({ truck_miles: 120000, last_oil_change_miles: 100000, source: "BF TRUCK", maintenance_check_date: "2026-10-04" });
  expect(status.show).toBe(true);
  expect(status.oilTriggered).toBe(false);
  expect(status.tooltip).not.toContain("Oil Change");
  expect(status.tooltip).toContain("Maintenance Check: Overdue");
});
it("shows miles since the last oil change in the compact warning", () => {
  const status = getMaintenanceIconStatus({ truck_miles: 136500, last_oil_change_miles: 100000, source: "M&K" });
  expect(status.tooltip).toBe("Oil Change: 36,500 mi since last change");
});
it("does not create an alert for oil mileage below the warning threshold", () => {
  expect(getMaintenanceIconStatus({ truck_miles: 120000, last_oil_change_miles: 100000 }).show).toBe(false);
});
