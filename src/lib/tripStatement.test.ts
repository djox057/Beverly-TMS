import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractWorkbookStatementAmount, extractPdfStatementAmount, parseStatementAmount, statementKey } from "./tripStatement";
const book = (rows: unknown[][]) => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), "Statement"); return w; };
describe("statement totals", () => {
  it("uses final net pay below the label, after all gross totals", () => {
    expect(extractWorkbookStatementAmount(book([["Freight", 7000], ["Total Earnings", 6160], ["Total Deductions", 2235], ["Total Fuel", 3150.97], ["Total Credits", 520], ["NET PAY"], [1294.03]]))).toBe(1294.03);
  });
  it("skips merged blank cells beside NET PAY and reads the amount below", () => {
    const w = book([["NET PAY", { t: "z", v: 0 }], [1294.03, { t: "z", v: 0 }]]);
    expect(extractWorkbookStatementAmount(w)).toBe(1294.03);
  });
  it("evaluates uncached arithmetic and SUM formulas without running workbook code", () => {
    const w = book([[7000, { t: "n", f: "A1*0.88" }], [2235], [3150.97], [520], ["Check Amount", { t: "n", f: "SUM((B1+SUM(A4:A4))-A2-A3)" }]]);
    expect(extractWorkbookStatementAmount(w)).toBe(1294.03);
  });
  it("retains full precision of formula inputs and supports negative/zero totals", () => {
    expect(extractWorkbookStatementAmount(book([["NET PAY"], [{ t: "n", f: "1.239*10" }]]))).toBe(12.39);
    expect(extractWorkbookStatementAmount(book([["NET PAY", -42.1]]))).toBe(-42.1);
    expect(extractWorkbookStatementAmount(book([["NET PAY", 0]]))).toBe(0);
  });
  it("requires manual entry for missing, ambiguous, unsupported or cyclic results", () => {
    expect(extractWorkbookStatementAmount(book([["Total Earnings", 7000], ["Page", 1]]))).toBeNull();
    expect(extractWorkbookStatementAmount(book([["NET PAY", 12], ["NET PAY", 14]]))).toBeNull();
    expect(extractWorkbookStatementAmount(book([["NET PAY", { t: "n", f: "WEBSERVICE(\"https://example.com\")" }]]))).toBeNull();
    expect(extractWorkbookStatementAmount(book([["NET PAY", { t: "n", f: "B1+1" }]]))).toBeNull();
  });
  it("extracts PDF net pay with separate dollar/amount and ignores later page numbers", () => {
    expect(extractPdfStatementAmount(["Total Earnings $7,000.00 $6,160.00", "Total Fuel $3,150.97", "NET PAY", "$ 1,294.03", "Page 1"])).toBe(1294.03);
    expect(extractPdfStatementAmount(["Check Amount ($125.00)"])).toBe(-125);
    expect(extractPdfStatementAmount(["NET PAY $0.00"])).toBe(0);
    expect(extractPdfStatementAmount(["Total $500.00", "1"])).toBeNull();
  });
  it("validates payment input and distinguishes week/driver/truck identities", () => {
    expect(parseStatementAmount(" ")).toBeNull();
    expect(parseStatementAmount("$1,294.03")).toBe(1294.03);
    expect(parseStatementAmount("(100.50)")).toBe(-100.5);
    expect(parseStatementAmount("12.345")).toBeNull();
    expect(statementKey("a_b", "c", "2026-10-20")).not.toBe(statementKey("a", "b_c", "2026-10-20"));
  });
});
