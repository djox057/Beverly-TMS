import Papa from "papaparse";
import { entryTypes, type EntryType } from "./truckServiceLog";

export function parseServiceLogRows(text: string, today: string) {
  const parsed = Papa.parse<string[]>(text, { delimiter: "\t", skipEmptyLines: "greedy" });
  if (parsed.errors.length || !parsed.data.length) throw new Error("Paste complete spreadsheet rows.");
  return parsed.data.map((values, index) => {
    try { return parseRow(values.map(value => value.trim()), today); }
    catch (error) { throw new Error(`Row ${index + 1}: ${error instanceof Error ? error.message : "Invalid row."}`); }
  });
}

export function parseServiceLogPaste(text: string, today: string) {
  const rows = parseServiceLogRows(text, today);
  if (rows.length !== 1) throw new Error("Expected one spreadsheet row.");
  return rows[0];
}

function parseRow(columns: string[], today: string) {
  if (columns.length < 8 || columns.length > 11) throw new Error("Copy the row from Log Date through Invoice (optionally including Notes).");
  const rawDate = columns[0];
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(rawDate);
  const iso = us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : rawDate;
  const date = new Date(`${iso}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso || iso > today) throw new Error("Enter a valid log date that is not in the future (MM/DD/YYYY or YYYY-MM-DD).");
  const entry_type = entryTypes.find(type => type.toLowerCase() === columns[1].toLowerCase()) as EntryType | undefined;
  if (!entry_type || entry_type === "Baseline Start") throw new Error("Paste a valid service entry type, such as Oil Change or Mileage Check.");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(columns[2])) throw new Error("Total Odometer must be a whole, non-negative number.");
  const odometer = Number(columns[2].replace(/,/g, ""));
  if (!Number.isSafeInteger(odometer)) throw new Error("Total Odometer is too large.");
  // Spreadsheet columns 4 and 5 are calculated by the service log, never imported.
  return { log_date: iso, entry_type, odometer: String(odometer), oil_spec: columns[5], facility: columns[6], invoice: columns[7], notes: columns[8] ?? "" };
}
