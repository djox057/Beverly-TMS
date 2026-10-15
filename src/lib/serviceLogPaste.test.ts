import { expect, it } from "vitest";
import { parseServiceLogPaste } from "./serviceLogPaste";
const example = "11/18/2024\tOil Change\t103,953\t0\t133,953\t\tDealer / TA Petro\t";
it("maps spreadsheet columns and ignores calculated mileage values", () => {
  expect(parseServiceLogPaste(example, "2026-10-15")).toEqual({ log_date: "2024-11-18", entry_type: "Oil Change", odometer: "103953", oil_spec: "", facility: "Dealer / TA Petro", invoice: "", notes: "" });
});
it("handles quoted multiline notes, ISO dates and trailing line breaks", () => {
  const row = '2024-11-18\tOil Change\t103953\t999\t999\t10W-30\tShop\tINV-1\t"Line one\nLine two"\r\n';
  expect(parseServiceLogPaste(row, "2026-10-15")).toMatchObject({ notes: "Line one\nLine two", invoice: "INV-1", oil_spec: "10W-30" });
});
it.each([example.replace("11/18/2024", "02/31/2024"), example.replace("11/18/2024", "11/18/2030"), example.replace("103,953", "-1"), example.replace("103,953", "103,95"), example.replace("Oil Change", "Baseline Start"), `${example}\n${example}`])("rejects invalid or multiple rows", text => {
  expect(() => parseServiceLogPaste(text, "2026-10-15")).toThrow();
});
