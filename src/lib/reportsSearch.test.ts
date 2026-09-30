import { describe, expect, it } from "vitest";
import { filterReportGroups, matchesReportLoad, reportOrderBelongsToDrivers } from "./reportsSearch";

const team = { id: "truck-460", driverId: "a", driver: "Team", driver1Name: "John Smith", driver2Name: "Jane Doe",
  truckNumber: "460", trailerNumber: "T460", companyName: "Beverly", allOrders: [{ internal_load_number: "12345-BFP", broker_load_number: "BROKER-900" }] };
const other = { id: "truck-1460", driverId: "b", driver: "Sam Jones", truckNumber: "1460", trailerNumber: "800", companyName: "Prime", allOrders: [] };
const groups = [{ office: "BG", dispatcher: "Matt", trucks: [team] }, { office: "LALE", dispatcher: "Connor", trucks: [other] }];
const base = { today: "2026-09-30", driverIds: ["a", "b"] };

describe("Reports row search in coverage and office views", () => {
  it.each(["460", "john", "Jane", "team", "t460"])("narrows %s to one team row across office boundaries", unit => {
    expect(filterReportGroups(groups, { ...base, unit }).flatMap(g => g.trucks)).toEqual([team]);
  });
  it("matches numeric truck and trailer numbers exactly, with whitespace trimmed", () => {
    expect(filterReportGroups(groups, { ...base, unit: " 460 " }).flatMap(g => g.trucks)).toEqual([team]);
    expect(filterReportGroups(groups, { ...base, unit: "800" }).flatMap(g => g.trucks)).toEqual([other]);
    expect(filterReportGroups(groups, { ...base, unit: "46" })).toEqual([]);
  });
  it("never adds a driver outside either weekend or shift assignment scope", () => {
    for (const driverIds of [["a"], ["b"]]) {
      expect(filterReportGroups(groups, { ...base, driverIds, unit: driverIds[0] === "a" ? "1460" : "460" })).toEqual([]);
    }
  });
  it.each(["12345", "12345-bfp", "broker-900"])("finds internal/broker load %s", load => {
    expect(filterReportGroups(groups, { ...base, load }).flatMap(g => g.trucks)).toEqual([team]);
  });
  it("applies combined dispatch, company, location and row filters; clear restores scope", () => {
    expect(filterReportGroups(groups, { ...base, unit: "460", dispatch: "connor" })).toEqual([]);
    expect(filterReportGroups(groups, { ...base, company: "Prime", load: "900" })).toEqual([]);
    expect(filterReportGroups(groups, { ...base, proximity: new Map([[other.id, 2]]), unit: "460" })).toEqual([]);
    expect(filterReportGroups(groups, base).flatMap(g => g.trucks)).toEqual([team, other]);
    expect(filterReportGroups(groups, { ...base, offices: ["LALE"] }).flatMap(g => g.trucks)).toEqual([other]);
  });
  it("uses the same canceled-load eligibility for table rows and coverage lookup", () => {
    expect(matchesReportLoad({ canceled: true, broker_load_number: "900", pickup_datetime: "2026-09-29T23:00:00" }, "900", base.today)).toBe(false);
    expect(matchesReportLoad({ canceled: true, broker_load_number: "900", pickup_datetime: "2026-09-30T09:00:00" }, "900", base.today)).toBe(true);
  });
  it("maps recovery and yard loads as the Reports adapter does", () => {
    expect(reportOrderBelongsToDrivers({ driver1_id: "a" }, ["a"])).toBe(true);
    expect(reportOrderBelongsToDrivers({ driver1_id: "b", original_driver1_id: "a" }, ["a"])).toBe(false);
    expect(reportOrderBelongsToDrivers({ original_driver1_id: "a" }, ["a"])).toBe(true);
    expect(reportOrderBelongsToDrivers({ driver1_id: "b", is_recovery: true, order_transfers: [{ driver2_id: "a" }] }, ["a"])).toBe(true);
    expect(reportOrderBelongsToDrivers({ driver1_id: "b", is_recovery: false, order_transfers: [{ driver2_id: "a" }] }, ["a"])).toBe(false);
  });
});
