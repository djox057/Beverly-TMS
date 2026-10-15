import { expect, it } from "vitest";
import { parseServiceLogPaste, parseServiceLogRows } from "./serviceLogPaste";
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

it("parses the user's eleven-row mileage and oil-service block in order", () => {
  const dates = ["4/18/2024", "5/30/2024", "6/12/2024", "6/26/2024", "7/1/2024", "7/15/2024", "8/21/2024", "9/4/2024", "9/18/2024", "10/2/2024", "10/17/2024"];
  const miles = [16434, 35201, 38884, 45305, 48428, 52413, 68882, 74953, 81766, 87536, 93497];
  const text = dates.map((date, i) => [date, i === 5 ? "Oil Change" : "Mileage Check", miles[i].toLocaleString("en-US"), "0", "99999", "", i === 5 ? "Dealer / TA Petro" : "", ""].join("\t")).join("\r\n");
  const rows = parseServiceLogRows(text, "2026-10-15");
  expect(rows).toHaveLength(11);
  expect(rows.map(row => Number(row.odometer))).toEqual(miles);
  expect(rows[5]).toMatchObject({ log_date: "2024-07-15", entry_type: "Oil Change", facility: "Dealer / TA Petro" });
});
it("identifies the invalid row before anything can be saved", () => {
  expect(() => parseServiceLogRows(`${example}\n${example.replace("103,953", "bad")}`, "2026-10-15")).toThrow("Row 2:");
});
