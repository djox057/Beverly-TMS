import { describe, expect, it } from "vitest";
import { applyFleetServiceSnapshot, type FleetServiceSnapshot } from "./fleetServiceSnapshot";

const snapshot: FleetServiceSnapshot = {
  miles: 46975, miles_updated_at: "2026-10-29", last_oil_change_miles: 46975,
  oil_change_date: "2026-10-29", air_filter: 0, last_oc_invoice: "4011244277",
  fleet_pm_readiness: "READY / GOOD", oil_log_entry_id: "oil-entry", air_filter_log_entry_id: null,
};

describe("fleet service snapshot", () => {
  it("shows truck 4651's saved oil service consistently with its readiness", () => {
    const raw = { id: "4651", miles: 44980, last_oil_change_miles: 0, oil_change_date: null, last_oc_invoice: null, fleet_service_snapshot: snapshot };
    const displayed = applyFleetServiceSnapshot(raw);
    expect(displayed).toMatchObject({ miles: 46975, last_oil_change_miles: 46975, oil_change_date: "2026-10-29", last_oc_invoice: "4011244277", fleet_pm_readiness: "READY / GOOD" });
    expect(displayed.miles! - displayed.last_oil_change_miles!).toBe(0);
    expect(raw.miles).toBe(44980);
  });
  it("preserves cleared values and newer realtime snapshots", () => {
    const next = { ...snapshot, miles: 50000, last_oc_invoice: null, air_filter: null };
    expect(applyFleetServiceSnapshot({ last_oc_invoice: "old", air_filter: 1000, fleet_service_snapshot: next })).toMatchObject({ miles: 50000, last_oc_invoice: null, air_filter: null });
  });
});
