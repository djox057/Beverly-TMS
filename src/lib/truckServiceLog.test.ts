import { describe, expect, it } from "vitest";
import { buildServiceEntries, calculateServiceLog, getServiceInterval, mileageTone, serviceSummary, type ServiceEntry, type ServiceTruck } from "./truckServiceLog";

const truck: ServiceTruck = { id: "t1", truck_number: "157", source: "BF TRUCK", make: "Freightliner", model: "Cascadia", year: 2026, vin: null, engine: null, is_active: true, miles: 168624, miles_updated_at: "2026-09-30T12:00:00Z", last_oil_change_miles: 148108, oil_change_date: "2026-07-30", air_filter: 112797, last_oc_invoice: null, oil_change_note: null, samsara_account: null, dispatcher_id: null, driver1_id: null };
const entry = (overrides: Partial<ServiceEntry>): ServiceEntry => ({ id: "1", source_key: null, log_date: "2026-07-30", entry_type: "Oil Change", odometer: 148108, oil_spec: null, facility: null, invoice: null, notes: null, created_at: "2026-07-30T12:00:00Z", ...overrides });

describe("truck service log rules", () => {
  it("keeps existing warning thresholds separate from service intervals", () => {
    expect(getServiceInterval("BF TRUCK")).toEqual({ miles: 30000, days: 90 });
    expect(getServiceInterval(" M & K ")).toEqual({ miles: 40000, days: 120 });
    expect(getServiceInterval("ryder")).toEqual({ miles: 50000, days: 120 });
    expect(mileageTone(28000, "BF TRUCK")).toBe("yellow");
    expect(mileageTone(28001, "BF TRUCK")).toBe("red");
    expect(mileageTone(null, "BF TRUCK")).toBe("unknown");
    expect(mileageTone(-1, "BF TRUCK")).toBe("unknown");
  });
  it("reconciles the spreadsheet example with the live fields", () => {
    const entries = buildServiceEntries(truck, [], []);
    const result = serviceSummary(truck, entries, "2026-10-08");
    expect(result.sinceOil).toBe(20516);
    expect(result.nextDue).toBe(178108);
    expect(result.remaining).toBe(9484);
    expect(result.daysLeft).toBe(20);
    expect(result.status).toBe("READY / GOOD");
  });
  it("combined oil/filter service resets both and recognizes its date", () => {
    const entries = [entry({ entry_type: "Air Filter + Oil change", log_date: "2026-09-01", odometer: 160000 }), entry({ id: "2", entry_type: "Mileage Check", log_date: "2026-09-02", odometer: 162000 })];
    const rows = calculateServiceLog(entries, "M&K");
    expect(rows[0].next_due).toBe(200000);
    expect(rows[1].miles_since_service).toBe(2000);
    expect(rows[1].miles_since_filter).toBe(2000);
    const result = serviceSummary(truck, entries, "2026-10-08");
    expect(result.oilDate).toBe("2026-09-01");
    expect(result.sinceOil).toBe(8624);
    expect(result.sinceFilter).toBe(8624);
  });
  it("time alone can make service overdue and boundaries are due", () => {
    const entries = buildServiceEntries(truck, [], []);
    expect(serviceSummary(truck, entries, "2026-10-28").status).toBe("SERVICE DUE");
    expect(serviceSummary(truck, entries, "2026-10-29").status).toBe("SERVICE OVERDUE");
    expect(serviceSummary({ ...truck, miles: 178108 }, entries, "2026-10-08").status).toBe("SERVICE DUE");
    expect(serviceSummary({ ...truck, miles: 178109 }, entries, "2026-10-08").remaining).toBe(-1);
  });
  it("does not invent baseline or dates and exposes missing/invalid service data", () => {
    const missing = { ...truck, oil_change_date: null, last_oil_change_miles: null, air_filter: null };
    const result = serviceSummary(missing, buildServiceEntries(missing, [], []), "2026-10-08");
    expect(result.sinceOil).toBeNull();
    expect(result.targetDate).toBeNull();
    expect(result.baseline).toBeUndefined();
    expect(result.status).toBe("MISSING SERVICE DATA");
    expect(serviceSummary({ ...truck, miles: 100000 }, [], "2026-10-08").status).toBe("CHECK ODOMETER");
  });
  it("keeps notes on the original reading when live mileage changes", () => {
    const oldEntries = buildServiceEntries(truck, [], []);
    const reading = oldEntries.find(e => e.entry_type === "Mileage Check")!;
    const saved = entry({ ...reading, id: "stored", notes: "Original reading photo verified" });
    const entries = buildServiceEntries({ ...truck, miles: 170000, miles_updated_at: "2026-10-08T12:00:00Z" }, [], [saved]);
    expect(entries.find(e => e.odometer === 168624)?.notes).toBe(saved.notes);
    expect(entries.find(e => e.odometer === 170000)?.notes).toBeNull();
  });
  it("adds historical mileage checks without inventing oil-service dates", () => {
    const history = [{ id: "h1", field: "miles", new_value: 168624, changed_at: truck.miles_updated_at! }, { id: "h2", field: "last_oil_change_miles", new_value: 148108, changed_at: "2026-09-30T14:00:00Z" }];
    const entries = buildServiceEntries(truck, history, []);
    expect(entries.filter(e => e.entry_type === "Mileage Check")).toHaveLength(1);
    expect(entries.filter(e => e.entry_type === "Oil Change")).toHaveLength(1);
  });
  it("separates air-filter warning at 60k from actual replacement at 80k", () => {
    const base = { ...truck, air_filter: truck.miles! - 60000 };
    expect(serviceSummary(base, [], "2026-10-08").status).toBe("READY / GOOD");
    expect(serviceSummary({ ...base, air_filter: truck.miles! - 60001 }, [], "2026-10-08").status).toBe("DUE SOON");
    expect(serviceSummary({ ...base, air_filter: truck.miles! - 80000 }, [], "2026-10-08").status).toBe("SERVICE DUE");
    expect(serviceSummary({ ...base, air_filter: truck.miles! - 80001 }, [], "2026-10-08").status).toBe("SERVICE OVERDUE");
  });
  it("backdated records do not replace the newer live current reading", () => {
    const saved = [entry({ entry_type: "Mileage Check", log_date: "2026-08-01", odometer: 150000, created_at: "2026-10-08T12:00:00Z" })];
    const result = serviceSummary(truck, buildServiceEntries(truck, [], saved), "2026-10-08");
    expect(result.current).toBe(168624);
    expect(result.currentDate).toBe("2026-09-30");
  });
  it("uses truck start miles, baseline date and note without inventing a date", () => {
    const base = { ...truck, start_miles: 0, baseline_start_date: null, baseline_note: "Start", baseline_created_by: "author1" };
    const entries = buildServiceEntries(base, [], []);
    expect(entries.find(e => e.source_key === "truck:baseline")).toMatchObject({ odometer: 0, log_date: null, notes: "Start", created_by: "author1" });
    expect(serviceSummary(base, entries).baseline?.odometer).toBe(0);
  });
  it("applies inline overrides and retains the original reading author", () => {
    const history = [{ id: "h1", field: "miles", new_value: 160000, changed_at: "2026-09-01T12:00:00Z", changed_by: "original" }];
    const override = entry({ source_key: "history:h1", entry_type: "Mileage Check", odometer: 161000, log_date: "2026-09-02", created_by: "editor" });
    const entries = buildServiceEntries(truck, history, [override]);
    expect(entries.find(e => e.source_key === "history:h1")).toMatchObject({ odometer: 161000, log_date: "2026-09-02", created_by: "original" });
    expect(truck.miles).toBe(168624);
  });

  it("uses edited current mileage and permits clearing a linked service date", () => {
    const original = buildServiceEntries(truck, [], []);
    const current = original.find(e => e.current_reading)!;
    const oil = original.find(e => e.entry_type === "Oil Change")!;
    const entries = buildServiceEntries(truck, [], [entry({ ...current, id: "a", odometer: 170000 }), entry({ ...oil, id: "b", log_date: null })]);
    const result = serviceSummary(truck, entries, "2026-10-08");
    expect(result.current).toBe(170000);
    expect(result.sinceOil).toBe(21892);
    expect(result.targetDate).toBeNull();
  });

});
