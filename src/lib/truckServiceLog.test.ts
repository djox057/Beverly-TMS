import { describe, expect, it } from "vitest";
import { buildServiceEntries, calculateServiceLog, getServiceInterval, mileageTone, serviceSummary, type ServiceEntry, type ServiceTruck } from "./truckServiceLog";

const truck: ServiceTruck = { id: "t1", truck_number: "157", source: "BF TRUCK", make: "Freightliner", model: "Cascadia", year: 2026, vin: null, engine: null, is_active: true, miles: 168624, miles_updated_at: "2026-09-30T12:00:00Z", last_oil_change_miles: 148108, oil_change_date: "2026-07-30", air_filter: 112797, last_oc_invoice: null, oil_change_note: null, samsara_account: null, dispatcher_id: null, driver1_id: null };
const entry = (overrides: Partial<ServiceEntry>): ServiceEntry => ({ id: "1", source_key: null, log_date: "2026-07-30", entry_type: "Oil Change", odometer: 148108, oil_spec: null, facility: null, invoice: null, notes: null, created_at: "2026-07-30T12:00:00Z", ...overrides });

describe("truck service log rules", () => {
  it("keeps existing warning thresholds separate from service intervals", () => {
    expect(getServiceInterval("BF TRUCK")).toEqual({ miles: 30000 });
    expect(getServiceInterval(" TEL ")).toEqual({ miles: 30000 });
    expect(getServiceInterval(" M & K ")).toEqual({ miles: 40000 });
    expect(getServiceInterval("ryder")).toEqual({ miles: 50000 });
    expect(mileageTone(28000, "BF TRUCK")).toBe("yellow");
    expect(mileageTone(28001, "BF TRUCK")).toBe("red");
    expect(mileageTone(27999, "TEL")).toBe("yellow");
    expect(mileageTone(28000, "TEL")).toBe("red");
    expect(mileageTone(null, "BF TRUCK")).toBe("unknown");
    expect(mileageTone(-1, "BF TRUCK")).toBe("unknown");
  });
  it("reconciles the spreadsheet example with the live fields", () => {
    const entries = buildServiceEntries(truck, [], []);
    const result = serviceSummary(truck, entries, "2026-10-08");
    expect(result.sinceOil).toBe(20516);
    expect(result.nextDue).toBe(178108);
    expect(result.remaining).toBe(9484);
    expect(result).not.toHaveProperty("daysLeft");
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
  it("ignores elapsed days and uses mileage boundaries for service status", () => {
    const entries = buildServiceEntries(truck, [], []);
    expect(serviceSummary(truck, entries, "2026-10-28").status).toBe("READY / GOOD");
    expect(serviceSummary(truck, entries, "2026-10-29").status).toBe("READY / GOOD");
    expect(serviceSummary({ ...truck, miles: 178108 }, entries, "2026-10-08").status).toBe("SERVICE DUE");
    expect(serviceSummary({ ...truck, miles: 178109 }, entries, "2026-10-08").remaining).toBe(-1);
  });
  it("does not invent baseline or dates and exposes missing/invalid service data", () => {
    const missing = { ...truck, oil_change_date: null, last_oil_change_miles: null, air_filter: null };
    const result = serviceSummary(missing, buildServiceEntries(missing, [], []), "2026-10-08");
    expect(result.sinceOil).toBeNull();
    expect(result).not.toHaveProperty("targetDate");
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
  it("omits a rapidly corrected partial mileage value from the detail page while retaining its audit", () => {
    const live = { ...truck, miles: 491683, miles_updated_at: "2026-09-18T18:35:35Z" };
    const history = [
      { id: "previous", field: "miles", new_value: 489877, changed_at: "2026-09-10T18:49:17Z", changed_by: "author1" },
      { id: "partial", field: "miles", new_value: 489, changed_at: "2026-09-15T14:47:39Z", changed_by: "author1" },
      { id: "corrected", field: "miles", new_value: 489896, changed_at: "2026-09-15T14:47:43Z", changed_by: "author1" },
    ];
    const saved = [entry({ source_key: "xlsx:historical-oil", log_date: "2026-09-01", odometer: 470000 })];
    const rows = calculateServiceLog(buildServiceEntries(live, history, saved), live.source);
    expect(rows.some(e => e.source_key === "history:partial")).toBe(false);
    expect(rows.find(e => e.source_key === "history:corrected")?.miles_since_service).toBe(19896);
    expect(rows.find(e => e.source_key === "history:corrected")?.created_by).toBe("author1");
    expect(history).toHaveLength(3);
    expect(history[1].new_value).toBe(489);
    expect(live.miles).toBe(491683);
  });
  it("retains saved edits to automatic readings even when a raw value looks partial", () => {
    const history = [
      { id: "previous", field: "miles", new_value: 489877, changed_at: "2026-09-10T18:49:17Z", changed_by: "author1" },
      { id: "partial", field: "miles", new_value: 489, changed_at: "2026-09-15T14:47:39Z", changed_by: "author1" },
      { id: "corrected", field: "miles", new_value: 489896, changed_at: "2026-09-15T14:47:43Z", changed_by: "author1" },
    ];
    const saved = [entry({ source_key: "history:partial", entry_type: "Mileage Check", log_date: "2026-09-15", odometer: 489880, notes: "Verified manually" })];
    expect(buildServiceEntries(truck, history, saved).find(e => e.source_key === "history:partial")?.notes).toBe("Verified manually");
  });
  it("retains uncertain mileage drops, corrections by other authors, and later corrections", () => {
    const history = [
      { id: "previous", field: "miles", new_value: 489877, changed_at: "2026-09-10T18:49:17Z", changed_by: "author1" },
      { id: "partial", field: "miles", new_value: 489, changed_at: "2026-09-15T14:47:39Z", changed_by: "author1" },
      { id: "corrected", field: "miles", new_value: 489896, changed_at: "2026-09-15T14:47:43Z", changed_by: "author2" },
    ];
    const hasPartial = (h: typeof history) => buildServiceEntries(truck, h, []).some(e => e.source_key === "history:partial");
    expect(hasPartial(history)).toBe(true);
    expect(hasPartial(history.map(e => e.id === "corrected" ? { ...e, changed_by: "author1", changed_at: "2026-09-15T14:48:40Z" } : e))).toBe(true);
    expect(hasPartial(history.map(e => e.id === "partial" ? { ...e, new_value: 488 } : { ...e, changed_by: "author1" }))).toBe(true);
    expect(hasPartial(history.slice(1).map(e => ({ ...e, changed_by: "author1" })))).toBe(true);
  });
  it("keeps a partial reading omitted when metadata is added to its corrected event", () => {
    const history = [
      { id: "previous", field: "miles", new_value: 489877, changed_at: "2026-09-10T18:49:17Z", changed_by: "author1" },
      { id: "partial", field: "miles", new_value: 489, changed_at: "2026-09-15T14:47:39Z", changed_by: "author1" },
      { id: "corrected", field: "miles", new_value: 489896, changed_at: "2026-09-15T14:47:43Z", changed_by: "author1" },
    ];
    const saved = [entry({ source_key: "history:corrected", entry_type: "Mileage Check", log_date: "2026-09-15", odometer: 489896, notes: "Source invoice checked" })];
    const entries = buildServiceEntries(truck, history, saved);
    expect(entries.some(e => e.source_key === "history:partial")).toBe(false);
    expect(entries.find(e => e.source_key === "history:corrected")?.notes).toBe("Source invoice checked");
    expect(buildServiceEntries(truck, history, [entry({ ...saved[0], odometer: 488000 })]).some(e => e.source_key === "history:partial")).toBe(true);
  });
  it("uses an audited prior value to recognize a correction in the first mileage update", () => {
    const history = [
      { id: "partial", field: "miles", old_value: 133300, new_value: 13827, changed_at: "2026-09-14T14:10:49Z", changed_by: "author1" },
      { id: "corrected", field: "miles", old_value: 13827, new_value: 138274, changed_at: "2026-09-14T14:10:59Z", changed_by: "author1" },
    ];
    const entries = buildServiceEntries(truck, history, []);
    expect(entries.some(e => e.source_key === "history:partial")).toBe(false);
    expect(entries.find(e => e.source_key === "history:corrected")?.created_by).toBe("author1");
    expect(history).toHaveLength(2);
    expect(history[0].new_value).toBe(13827);
  });
  it("omits out-of-range steps in a linked audit correction and retains valid intermediate readings", () => {
    const history = [
      { id: "valid", field: "miles", old_value: 139231, new_value: 139250, changed_at: "2026-10-01T15:37:10Z", changed_by: "author1" },
      { id: "partial1", field: "miles", old_value: 139250, new_value: 1392, changed_at: "2026-10-01T15:37:15Z", changed_by: "author1" },
      { id: "partial2", field: "miles", old_value: 1392, new_value: 13925, changed_at: "2026-10-01T15:37:23Z", changed_by: "author1" },
      { id: "overshoot", field: "miles", old_value: 13925, new_value: 1392864, changed_at: "2026-10-01T15:37:35Z", changed_by: "author1" },
      { id: "corrected", field: "miles", old_value: 1392864, new_value: 139286, changed_at: "2026-10-01T15:37:53Z", changed_by: "author1" },
    ];
    const entries = buildServiceEntries(truck, history, []);
    expect(entries.some(e => ["history:partial1", "history:partial2", "history:overshoot"].includes(e.source_key!))).toBe(false);
    expect(entries.some(e => e.source_key === "history:valid")).toBe(true);
    expect(entries.some(e => e.source_key === "history:corrected")).toBe(true);
    expect(history).toHaveLength(5);
  });
  it("preserves linked audit corrections when the chain, author, time, or restored baseline is uncertain", () => {
    const history = [
      { id: "partial", field: "miles", old_value: 133300, new_value: 13827, changed_at: "2026-09-14T14:10:49Z", changed_by: "author1" },
      { id: "corrected", field: "miles", old_value: 13827, new_value: 138274, changed_at: "2026-09-14T14:10:59Z", changed_by: "author1" },
    ];
    const keepsPartial = (h: typeof history) => buildServiceEntries(truck, h, []).some(e => e.source_key === "history:partial");
    expect(keepsPartial(history.map(e => e.id === "corrected" ? { ...e, old_value: 13826 } : e))).toBe(true);
    expect(keepsPartial([{ id: "previous", field: "miles", old_value: 127000, new_value: 133300, changed_at: "2026-09-10T12:00:00Z", changed_by: "author1" }, ...history.map(e => e.id === "corrected" ? { ...e, old_value: 13826 } : e)])).toBe(true);
    expect(keepsPartial(history.map(e => e.id === "corrected" ? { ...e, changed_by: "author2" } : e))).toBe(true);
    expect(keepsPartial(history.map(e => e.id === "corrected" ? { ...e, changed_at: "2026-09-14T14:11:50Z" } : e))).toBe(true);
    expect(keepsPartial(history.map(e => e.id === "corrected" ? { ...e, new_value: 120000 } : e))).toBe(true);
    const edited = [entry({ source_key: "history:partial", entry_type: "Mileage Check", log_date: "2026-09-14", odometer: 133310, notes: "Verified" })];
    expect(buildServiceEntries(truck, history, edited).find(e => e.source_key === "history:partial")?.notes).toBe("Verified");
  });
  it("tracks air-filter mileage separately without affecting PM readiness", () => {
    for (const sinceFilter of [60000, 60001, 80000, 80001, -1]) {
      const base = { ...truck, air_filter: truck.miles! - sinceFilter };
      const result = serviceSummary(base, [], "2026-10-08");
      expect(result.status).toBe("READY / GOOD");
      expect(result.sinceFilter).toBe(sinceFilter);
    }
    const overdue = { ...truck, miles: 178109, air_filter: 178109 };
    expect(serviceSummary(overdue, [], "2026-10-08").status).toBe("SERVICE OVERDUE");
  });
  it("backdated records do not replace the newer live current reading", () => {
    const saved = [entry({ entry_type: "Mileage Check", log_date: "2026-08-01", odometer: 150000, created_at: "2026-10-08T12:00:00Z" })];
    const result = serviceSummary(truck, buildServiceEntries(truck, [], saved), "2026-10-08");
    expect(result.current).toBe(168624);
    expect(result.currentDate).toBe("2026-09-30");
  });
  it("older imported filter services do not replace a newer undated live filter", () => {
    const live = { ...truck, miles: 513773, air_filter: 475212, last_oil_change_miles: 502721, oil_change_date: "2026-09-03" };
    const saved = [entry({ source_key: "xlsx:older-filter", entry_type: "Air Filter + Oil change", log_date: "2026-04-08", odometer: 442342 })];
    const summary = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-13");
    expect(summary.sinceFilter).toBe(38561);
    expect(summary.sinceOil).toBe(11052);
    expect(summary.status).toBe("READY / GOOD");
  });
  it("older imported oil services do not replace newer live oil mileage without a date", () => {
    const live = { ...truck, miles: 434002, last_oil_change_miles: 416603, oil_change_date: null, air_filter: 416603 };
    const saved = [entry({ source_key: "xlsx:older-oil", log_date: "2025-09-09", odometer: 275225 })];
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-13");
    expect(result.sinceOil).toBe(17399);
    expect(result.nextDue).toBe(446603);
    expect(result.oilDate).toBeNull();
    expect(result.status).toBe("MISSING SERVICE DATA");
  });
  it("newer dated oil mileage supersedes older undated live service", () => {
    const live = { ...truck, oil_change_date: null };
    const saved = [entry({ source_key: "xlsx:newer-oil", log_date: "2026-09-01", odometer: 160000 })];
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-08");
    expect(result.sinceOil).toBe(8624);
    expect(result.oilDate).toBe("2026-09-01");
  });
  it("preserves an edited undated oil reading and does not invent its date on an equal match", () => {
    const live = { ...truck, oil_change_date: null };
    const oil = buildServiceEntries(live, [], []).find(e => e.source_key?.startsWith("live:oil:"))!;
    const saved = [entry({ ...oil, id: "edited-oil", odometer: 160000 }), entry({ source_key: "xlsx:equal-oil", log_date: "2026-09-01", odometer: 160000 })];
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-08");
    expect(result.sinceOil).toBe(8624);
    expect(result.oilDate).toBeNull();
  });
  it("older mileage checks cannot roll back a live mileage value whose date is missing", () => {
    const live = { ...truck, miles: 125000, miles_updated_at: null, last_oil_change_miles: null, oil_change_date: null };
    const saved = [entry({ source_key: "xlsx:older-mileage", entry_type: "Mileage Check", log_date: "2025-07-16", odometer: 12601 })];
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-08");
    expect(result.current).toBe(125000);
    expect(result.currentDate).toBeNull();
  });
  it("uses a higher dated mileage check when the live date is missing and fills absent live mileage", () => {
    const saved = [entry({ source_key: "xlsx:newer-mileage", entry_type: "Mileage Check", log_date: "2026-10-01", odometer: 170000 })];
    const live = { ...truck, miles_updated_at: null };
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-08");
    expect(result.current).toBe(170000);
    expect(result.currentDate).toBe("2026-10-01");
    expect(serviceSummary({ ...live, miles: null }, buildServiceEntries({ ...live, miles: null }, [], saved), "2026-10-08").current).toBe(170000);
  });
  it("respects an inline edit to undated live mileage when considering older history", () => {
    const live = { ...truck, miles: 125000, miles_updated_at: null, last_oil_change_miles: null, oil_change_date: null };
    const current = buildServiceEntries(live, [], []).find(e => e.current_reading)!;
    const saved = [entry({ ...current, id: "edited-current", odometer: 150000 }), entry({ source_key: "xlsx:older-mileage", entry_type: "Mileage Check", log_date: "2026-09-01", odometer: 140000 })];
    const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-08");
    expect(result.current).toBe(150000);
    expect(result.currentDate).toBeNull();
  });
  it("a newer dated filter service supersedes the older live filter reading", () => {
    const saved = [entry({ source_key: "xlsx:newer-filter", entry_type: "Air Filter", log_date: "2026-09-01", odometer: 160000 })];
    const summary = serviceSummary(truck, buildServiceEntries(truck, [], saved), "2026-10-08");
    expect(summary.sinceFilter).toBe(8624);
  });
  it("preserves an inline edit to the undated live filter reading", () => {
    const original = buildServiceEntries(truck, [], []);
    const filter = original.find(e => e.source_key?.startsWith("live:filter:"))!;
    const saved = [entry({ ...filter, id: "edited-filter", odometer: 160000 }), entry({ source_key: "xlsx:older-filter", entry_type: "Air Filter", odometer: 150000 })];
    expect(serviceSummary(truck, buildServiceEntries(truck, [], saved), "2026-10-08").sinceFilter).toBe(8624);
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
    expect(result).not.toHaveProperty("targetDate");
  });

});

describe("deleted service log rows", () => {
  it("keeps generated rows deleted after rebuilding without changing live truck readings", () => {
    const history = [{ id: "h1", field: "miles", new_value: truck.miles!, changed_at: truck.miles_updated_at! }];
    const original = buildServiceEntries(truck, history, []);
    const reading = original.find(row => row.source_key === "history:h1")!;
    const saved = [entry({ ...reading, id: "deleted1", is_deleted: true })];
    const remaining = buildServiceEntries(truck, history, saved);
    expect(remaining.some(row => row.entry_type === "Mileage Check")).toBe(false);
    expect(remaining.filter(row => row.entry_type === "Oil Change")).toHaveLength(1);
    expect(serviceSummary(truck, remaining).current).toBe(truck.miles);
    expect(history).toHaveLength(1);
  });
  it("excludes deleted manual/imported entries and keeps unrelated rows", () => {
    const saved = [entry({ id: "manual", is_deleted: true }), entry({ id: "imported", source_key: "xlsx:old", is_deleted: true }), entry({ id: "kept" })];
    const remaining = buildServiceEntries(truck, [], saved);
    expect(remaining.some(row => row.id === "manual" || row.id === "imported")).toBe(false);
    expect(remaining.some(row => row.id === "kept")).toBe(true);
  });
});

 it("keeps air filter history with authors and avoids duplicating the current reading", () => {
  const history = [
    { id: "af1", field: "air_filter", new_value: 100000, changed_at: "2026-08-01T12:00:00Z", changed_by: "user1" },
    { id: "af2", field: "air_filter", new_value: 112797, changed_at: "2026-09-01T12:00:00Z", changed_by: "user2" },
    { id: "af3", field: "air_filter", new_value: null, changed_at: "2026-09-02T12:00:00Z", changed_by: "user2" },
  ];
  const filters = buildServiceEntries(truck, history, []).filter(e => e.entry_type === "Air Filter");
  expect(filters).toHaveLength(2);
  expect(filters.map(e => [e.odometer, e.log_date, e.created_by])).toEqual([
    [100000, "2026-08-01", "user1"], [112797, "2026-09-01", "user2"],
  ]);
  const changed = buildServiceEntries({ ...truck, air_filter: 160000 }, history, []).filter(e => e.entry_type === "Air Filter");
  expect(changed).toHaveLength(3);
  expect(changed.find(e => e.odometer === 160000)?.log_date).toBeNull();
 });

it("uses miles alone for oil due and overdue regardless of elapsed months", () => {
  const base = { ...truck, miles: 110000, last_oil_change_miles: 100000, oil_change_date: "2025-01-01", air_filter: 100000 };
  for (const today of ["2025-04-01", "2026-10-14"]) {
    expect(serviceSummary(base, buildServiceEntries(base, [], []), today).status).toBe("READY / GOOD");
  }
  const due = { ...base, miles: 130000 };
  expect(serviceSummary(due, buildServiceEntries(due, [], []), "2026-10-14").status).toBe("SERVICE DUE");
  const overdue = { ...base, miles: 130001 };
  expect(serviceSummary(overdue, buildServiceEntries(overdue, [], []), "2026-10-14").status).toBe("SERVICE OVERDUE");
});

it("keeps screenshot truck 8551 ready despite its July oil date", () => {
  const live = { ...truck, truck_number: "8551", miles: 140199, miles_updated_at: "2026-10-15T13:03:42.440165Z", last_oil_change_miles: 122738, oil_change_date: "2026-07-04", air_filter: 139613 };
  const saved = [entry({ id: "filter8551", source_key: "xlsx:filter8551", entry_type: "Air Filter", log_date: "2026-08-19", odometer: 139613 })];
  const summary = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-15");
  expect(summary.sinceOil).toBe(17461);
  expect(summary.sinceFilter).toBe(586);
  expect(summary.status).toBe("READY / GOOD");
  expect(summary.interval).toEqual({ miles: 30000 });
  expect(summary).not.toHaveProperty("daysLeft");
  expect(summary).not.toHaveProperty("targetDate");
});


describe("oil services also count as mileage checks", () => {
  it.each(["Oil Change", "Air Filter + Oil change"] as const)("uses %s for current mileage and freshness", entry_type => {
    const saved = [entry({ entry_type, log_date: "2026-10-08", odometer: 170000 })];
    const result = serviceSummary(truck, buildServiceEntries(truck, [], saved), "2026-10-08");
    expect(result).toMatchObject({ current: 170000, currentDate: "2026-10-08", sinceOil: 0 });
  });
  it("recognizes live oil mileage on the same day without needing an extra mileage row", () => {
    const live = { ...truck, oil_change_date: "2026-09-30", last_oil_change_miles: 169000 };
    expect(serviceSummary(live, buildServiceEntries(live, [], []), "2026-10-08")).toMatchObject({ current: 169000, sinceOil: 0 });
  });
  it("does not replace newer mileage with backdated, undated or mileage-free oil services", () => {
    for (const extra of [{ log_date: "2026-09-01", odometer: 170000 }, { log_date: null, odometer: 170000 }, { log_date: "2026-10-08", odometer: null }]) {
      expect(serviceSummary(truck, buildServiceEntries(truck, [], [entry(extra)]), "2026-10-08").current).toBe(truck.miles);
    }
  });
});


it.each(["Oil Change", "Air Filter + Oil change"] as const)("counts future-dated %s in readiness and mileage", entry_type => {
  const live = { ...truck, miles: 405618, miles_updated_at: "2026-11-02T00:00:00Z", last_oil_change_miles: 405618, oil_change_date: "2026-11-02" };
  const saved = [entry({ entry_type, log_date: "2026-11-02", odometer: 405618 }), entry({ id: "old", log_date: "2026-06-18", odometer: 368128 })];
  const result = serviceSummary(live, buildServiceEntries(live, [], saved), "2026-10-30");
  expect(result).toMatchObject({ current: 405618, currentDate: "2026-11-02", oilDate: "2026-11-02", sinceOil: 0, status: "READY / GOOD" });
});
