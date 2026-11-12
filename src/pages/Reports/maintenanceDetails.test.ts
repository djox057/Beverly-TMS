import { afterEach, expect, it, vi } from "vitest";
import { getMaintenanceIconStatus } from "./helpers";
import { getReportOilService } from "@/lib/fleetServiceSnapshot";

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

it("clears truck 9546's false overdue warning using the saved November 6 oil change", () => {
  const snapshot = { miles: 231107, last_oil_change_miles: 231107, oil_change_date: "2026-11-06" };
  const staleTruck = { miles: 231107, last_oil_change_miles: 186156, oil_change_date: "2026-05-20", source: "BF TRUCK", fleet_service_snapshot: snapshot };
  expect(getMaintenanceIconStatus({ ...staleTruck, truck_miles: staleTruck.miles }).oilMilesSince).toBe(44951);
  const corrected = getMaintenanceIconStatus({ ...staleTruck, ...getReportOilService(staleTruck) });
  expect(corrected).toMatchObject({ show: false, oilTriggered: false, oilMilesSince: 0 });
  // A genuinely overdue truck must still alert after resolving its snapshot.
  const overdue = { ...staleTruck, fleet_service_snapshot: { ...snapshot, miles: 262108 } };
  expect(getMaintenanceIconStatus({ ...overdue, ...getReportOilService(overdue) }))
    .toMatchObject({ show: true, color: "red", oilTriggered: true, oilMilesSince: 31001 });
});
