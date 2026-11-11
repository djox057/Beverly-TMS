import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { BulkStatementRow, duplicateStatementKeys, extractPdfStatementDetails, resolveStatementTarget, statementWeekEnd } from "./bulkTripStatements";
import { extractPdfStatementAmount } from "./tripStatement";

const drivers = [{ id: "d1", name: "Edward Butcher", company_name: "UES" }, { id: "d2", name: "Donald Young", company_name: "BF" }];
const trucks = [{ truck_number: "3135" }, { truck_number: "03212" }, { truck_number: "3212" }];
const row = (patch: Partial<BulkStatementRow> = {}): BulkStatementRow => ({ id: "r1", file: new File(["x"], "3135 Edward Butcher 11-5-2026.pdf"), driverName: "Edward Butcher", truckNumber: "3135", weekStart: "2026-10-20", weekEnd: "2026-10-26", amount: "1294.03", companyName: "", selected: true, ...patch });

describe("bulk salary statement matching", () => {
  it("reads the pay period rather than the later issue date, filename date, or agreement date", () => {
    const lines = ["Issue date 11/5/26", "Pay Period 10/20/2026-10/26/2026", "Invoice 8756", "Driver name Edward Butcher", "Compny name", "Agreement start date 3/10/2026", "Truck number 3135", "Agreement terms $900/208weeks", "Total Earnings $7,000.00 $6,160.00", "NET PAY", "$1,294.03"];
    expect(extractPdfStatementDetails(lines, extractPdfStatementAmount(lines))).toEqual({ driverName: "Edward Butcher", truckNumber: "3135", weekStart: "2026-10-20", weekEnd: "2026-10-26", companyName: "", amount: 1294.03 });
  });
  it.each([
    ["BF_Prime", { F3: "8756", F4: "11/5/26", F5: "3135", K4: "3135", F7: "Driver LLC", J7: "Edward Butcher", B12: "10/20/2026-10/26/2026", J70: "$1,294.03" }],
    ["Beverly_Freight", { F5: "3135", K4: "3135", F7: "Driver LLC", J7: "Edward Butcher", B12: "10/20/2026-10/26/2026", J67: "$1,294.03" }],
    ["Company_Driver", { F5: "3135", F7: "Driver LLC", J7: "Edward Butcher", B12: "10/20/2026-10/26/2026", J50: "$1,294.03" }],
    ["United_Enterprise_Solutions", { C3: "10/20/2026-10/26/2026", C6: "Edward Butcher", C9: "3135", I68: "$1,294.03" }],
    ["AP_Silver_Trans", { D3: "10/20/2026-10/26/2026", C6: "Edward Butcher", C9: "3135", I72: "$1,294.03" }],
    ["BG_Inc", { B8: "10/20/2026-10/26/2026", F3: "Edward Butcher", F8: "3135", I68: "$1,294.03" }],
    ["BF_Prime_United", { C4: "10/20/2026-10/26/2026", B7: "Edward Butcher", F8: "3135", I62: "$1,294.03" }],
    ["Lale_Transport", { B11: "10/20/2026-10/26/2026", E5: "Edward Butcher", E8: "3135", I68: "$1,294.03" }],
    ["Jones_Freight", { B13: "10/20/2026-10/26/2026", I5: "Edward Butcher", I4: "3135", I64: "$1,294.03" }],
    ["Hart_Freight", { C3: "10/20/2026-10/26/2026", C6: "Edward Butcher", C9: "3135", I57: "$1,294.03" }],
  ])("understands the actual %s template labels and column order", (name, values) => {
    const book = XLSX.read(readFileSync(`src/assets/templates/${name}.xlsx`), { type: "buffer" });
    const sheet = book.Sheets[book.SheetNames[0]];
    Object.entries(values).forEach(([address, value]) => { sheet[address] = { t: "s", v: value }; });
    const lines = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" }).map(cells => cells.join(" ").replace(/\s+/g, " ").trim());
    expect(extractPdfStatementDetails(lines, extractPdfStatementAmount(lines))).toMatchObject({ driverName: "Edward Butcher", truckNumber: "3135", weekStart: "2026-10-20", weekEnd: "2026-10-26", amount: 1294.03 });
  });
  it("handles wrapped labels and repeated page headers, including a year boundary", () => {
    const lines = ["Driver name", "Edward Butcher", "Truck number", "03212", "Pay Period", "12/29/2026 – 1/4/2027", "Driver name Edward Butcher", "Truck number 03212", "Pay Period 12/29/2026–1/4/2027"];
    expect(extractPdfStatementDetails(lines, 0)).toMatchObject({ driverName: "Edward Butcher", truckNumber: "03212", weekStart: "2026-12-29", weekEnd: "2027-01-04", amount: 0 });
  });
  it("rejects multiple drivers, trucks and periods instead of picking the first", () => {
    const details = extractPdfStatementDetails(["Driver name Edward Butcher", "Driver name Donald Young", "Truck number 3135", "Truck number 03212", "Pay Period 10/20/2026-10/26/2026", "Pay Period 10/27/2026-11/2/2026"], null);
    expect(details).toMatchObject({ driverName: "", truckNumber: "", weekStart: "", weekEnd: "", amount: null });
    expect(extractPdfStatementDetails(["Issue date 11/12/2026", "Delivery 11/3/2026-11/9/2026"], 1).weekStart).toBe("");
  });
  it("rejects impossible dates and requires the actual Tuesday–Monday week", () => {
    expect(extractPdfStatementDetails(["Pay Period 2/30/2026-3/8/2026"], 1).weekStart).toBe("");
    expect(statementWeekEnd("2026-02-30")).toBe("");
    expect(resolveStatementTarget(row({ weekStart: "2026-10-19", weekEnd: "2026-10-25" }), drivers, trucks).issues).toContain("Week must start on Tuesday");
    expect(resolveStatementTarget(row({ weekEnd: "2026-11-02" }), drivers, trucks).issues).toContain("Pay period must end on the following Monday");
  });
  it("matches all companies case-insensitively while preserving exact truck identity", () => {
    expect(resolveStatementTarget(row({ driverName: " edward  butcher ", truckNumber: "03212", amount: "(125.00)" }), drivers, trucks)).toMatchObject({ driverName: "Edward Butcher", truckNumber: "03212", amount: -125, issues: [] });
    expect(resolveStatementTarget(row({ driverName: "Ed Butcher" }), drivers, trucks).issues).toContain("Choose a matching driver");
    expect(resolveStatementTarget(row({ truckNumber: "003212" }), drivers, trucks).issues.length).toBeGreaterThan(0);
    expect(resolveStatementTarget(row(), [...drivers, { ...drivers[0], id: "d3" }], trucks).issues).toContain("Driver name is ambiguous");
  });
  it("blocks all selected duplicate targets and permits deliberate choice of one file", () => {
    const first = row(), second = row({ id: "r2", driverName: "EDWARD BUTCHER" });
    expect(duplicateStatementKeys([first, second], drivers, trucks).size).toBe(1);
    expect(duplicateStatementKeys([first, { ...second, selected: false }], drivers, trucks).size).toBe(0);
    expect(duplicateStatementKeys([first, { ...second, saved: true }], drivers, trucks).size).toBe(0);
  });
});
