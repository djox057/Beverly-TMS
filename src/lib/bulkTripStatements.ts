import { parseStatementAmount, statementKey } from "./tripStatement";

export type StatementDetails = {
  driverName: string;
  truckNumber: string;
  weekStart: string;
  weekEnd: string;
  companyName: string;
  amount: number | null;
};

const datePattern = String.raw`\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})`;
const metadataLabel = /\b(?:driver\s+name\s*:?|driver\s*:|(?:truck|unit)\s*(?:number|no\.?|#)\s*:?|(?:company|compny|comapny)\s+name\s*:?|company\s*:|agreement\s*(?:start(?:\s*date)?|terms)\s*:?|issue\s*date\s*:?|pay\s*period\s*:?|invoice\s*:?|statement\s*#\s*:?)/i;
const normalizeName = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const normalizeStatementDriver = normalizeName;

function parseDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/);
  if (!match) return null;
  const month = +match[1], day = +match[2], year = +match[3] + (match[3].length === 2 ? 2000 : 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

export function statementWeekEnd(start: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return "";
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

/** Only statement labels supply identity/period. Issue dates and filenames are never pay weeks. */
export function extractPdfStatementDetails(lines: string[], amount: number | null): StatementDetails {
  const collect = (label: RegExp) => {
    const values: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = label.exec(lines[i]);
      if (!match) continue;
      let value = lines[i].slice(match.index + match[0].length).trim();
      // A label in a merged cell can appear on its own line.
      if (!value && lines[i + 1] && !metadataLabel.test(lines[i + 1])) value = lines[i + 1].trim();
      value = value.split(metadataLabel)[0].trim();
      if (value) values.push(value);
    }
    return values;
  };
  const unique = (values: string[], normalize = (s: string) => s.toLowerCase()) => {
    const keys = new Set(values.map(normalize));
    return keys.size === 1 ? values[0] : "";
  };
  const driverName = unique(collect(/\b(?:Driver\s+name\s*:?\s*|Driver\s*:\s*)/i), normalizeName);
  // Capture only the identifier; retain leading zeroes and don't interpret truck history in filenames.
  const truckNumber = unique(collect(/\b(?:Truck\s*(?:number|no\.?|#)|Unit\s*(?:number|no\.?|#))\s*:?\s*/i).map(v => v.match(/^#?\s*([\p{L}\p{N}][\p{L}\p{N}-]*)/u)?.[1] || "").filter(Boolean));
  const companyName = unique(collect(/\b(?:(?:Company|Compny|Comapny)\s+name\s*:?\s*|Company\s*:\s*)/i));
  const periods = collect(/\b(?:Pay\s*period|Trips)\s*:?\s*/i).map(value => {
    const match = value.match(new RegExp(`(${datePattern})\\s*(?:-|–|—|to|through)\\s*(${datePattern})`, "i"));
    if (!match) return null;
    const start = parseDate(match[1]), end = parseDate(match[2]);
    return start && end ? { start, end } : null;
  });
  const validPeriods = periods.filter((p): p is { start: string; end: string } => p !== null);
  const period = validPeriods.length && validPeriods.every(p => p.start === validPeriods[0].start && p.end === validPeriods[0].end) ? validPeriods[0] : null;
  return { driverName, truckNumber, weekStart: period?.start || "", weekEnd: period?.end || "", companyName, amount };
}

export type ImportDriver = { id: string; name: string | null; company_name: string | null };
export type ImportTruck = { truck_number: string };
export type BulkStatementRow = {
  id: string;
  file: File;
  driverName: string;
  truckNumber: string;
  weekStart: string;
  weekEnd: string;
  companyName: string;
  amount: string;
  selected: boolean;
  readError?: string;
  saveError?: string;
  saved?: boolean;
};

export function resolveStatementTarget(row: BulkStatementRow, drivers: ImportDriver[], trucks: ImportTruck[]) {
  const matches = drivers.filter(d => d.name && normalizeName(d.name) === normalizeName(row.driverName));
  const truckMatches = trucks.filter(t => t.truck_number.toLowerCase() === row.truckNumber.trim().toLowerCase());
  const issues: string[] = [];
  if (row.readError) issues.push(row.readError);
  if (matches.length !== 1) issues.push(matches.length > 1 ? "Driver name is ambiguous" : "Choose a matching driver");
  if (truckMatches.length !== 1) issues.push("Choose a matching truck (keep leading zeroes)");
  const weekEnd = statementWeekEnd(row.weekStart);
  if (!weekEnd || new Date(`${row.weekStart}T12:00:00Z`).getUTCDay() !== 2) issues.push("Week must start on Tuesday");
  if (row.weekEnd !== weekEnd) issues.push("Pay period must end on the following Monday");
  const amount = parseStatementAmount(row.amount);
  if (amount === null) issues.push("Enter the final paid amount");
  const driverName = matches.length === 1 ? matches[0].name! : row.driverName;
  const truckNumber = truckMatches.length === 1 ? truckMatches[0].truck_number : row.truckNumber;
  return { issues, driverName, truckNumber, weekStart: row.weekStart, amount,
    key: statementKey(truckNumber, driverName, row.weekStart) };
}

/** All copies of a duplicate stay blocked until the user selects just one. */
export function duplicateStatementKeys(rows: BulkStatementRow[], drivers: ImportDriver[], trucks: ImportTruck[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.selected || row.saved) continue;
    const target = resolveStatementTarget(row, drivers, trucks);
    if (!target.issues.length) counts.set(target.key, (counts.get(target.key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}
