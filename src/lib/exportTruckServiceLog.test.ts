import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildTruckServiceWorkbook } from "./exportTruckServiceLog";
import { calculateServiceLog, serviceSummary, type ServiceTruck, type ServiceEntry } from "./truckServiceLog";

it("exports the template layout with typed readings, complete history and current oil-only status", async () => {
  const truck: ServiceTruck = {
    id: "t1", truck_number: "0984", source: "BF TRUCK", make: "Peterbilt", model: "579", year: 2027,
    vin: "1XPBD49X7VD834656", engine: "X15", is_active: true, miles: 116308, miles_updated_at: "2026-10-06T12:00:00Z",
    last_oil_change_miles: 103138, oil_change_date: "2026-08-26", air_filter: 20000,
    last_oc_invoice: null, oil_change_note: null, samsara_account: "BF", dispatcher_id: null, driver1_id: null,
    start_miles: 0, baseline_start_date: "2024-01-01", baseline_note: "Starting baseline", oil_spec: "10W-30",
  };
  const entry = (changes: Partial<ServiceEntry>): ServiceEntry => ({ id: "e", source_key: null, log_date: "2026-08-26", entry_type: "Oil Change", odometer: 103138,
    oil_spec: "10W-30", facility: "Dealer / TA Petro", invoice: "INV-42", notes: "=literal note", created_at: "2026-08-26T12:00:00Z", created_by: "u1", ...changes });
  const entries = [entry({ log_date: "2024-01-01", entry_type: "Baseline Start", odometer: 0 }), entry({}), entry({ id: "pending", log_date: "2026-10-07", entry_type: "Mileage Check", odometer: null })];
  const rows = calculateServiceLog(entries, truck.source);
  const summary = serviceSummary(truck, entries, "2026-10-15");
  const book = buildTruckServiceWorkbook(truck, rows, summary, new Map([["u1", "Jane Maintenance"]]));
  const buffer = await book.xlsx.writeBuffer();
  const saved = new ExcelJS.Workbook(); await saved.xlsx.load(buffer);
  const sheet = saved.worksheets[0];
  expect(sheet.getCell("C3").value).toBe("0984");
  expect(sheet.getCell("B2").text).toContain("PETERBILT / 579");
  expect(sheet.getCell("B8").value).toBe(116308);
  expect(sheet.getCell("H8").value).toBe("READY / GOOD");
  expect(sheet.getCell("F9").value).toBe("Air filter due (ODO): 100,000 mi");
  expect(sheet.getCell("D13").value).toBe(0);
  expect(sheet.getCell("D14").value).toBe(103138);
  expect(sheet.getCell("F14").value).toBe(133138);
  expect(sheet.getCell("B14").value).toEqual(new Date("2026-08-26T00:00:00Z"));
  expect(sheet.getCell("I14").value).toBe("=literal note\nInvoice: INV-42\nAdded by: Jane Maintenance");
  expect(sheet.getCell("D15").value).toBeNull();
  expect(sheet.getCell("B2").fill).toMatchObject({ fgColor: { argb: "FF1E3989" } });
  expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 12 });
  expect(sheet.pageSetup.printArea).toBe("B2:I15");
});
