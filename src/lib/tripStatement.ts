import type { WorkBook, WorkSheet } from "xlsx";

export const STATEMENT_MAX_BYTES = 20 * 1024 * 1024;
export const STATEMENT_BUCKET = "trip-statements";
export const statementKey = (truck: string, driver: string, week: string) => JSON.stringify([truck, driver, week]);

export function parseStatementAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && Math.abs(amount) < 1e10 ? Math.round(amount * 100) / 100 : null;
}

const paymentLabel = (text: string) => /^(netpay|checkamount|amountpaid|totalpay|netamount|balancedue|totaldue)[:.]?$/.test(text.toLowerCase().replace(/\s/g, ""));

/** Evaluate only the arithmetic/SUM used by our statement templates. Never execute workbook code. */
function cellNumber(sheet: WorkSheet, address: string, seen = new Set<string>()): number | null {
  const cell = sheet[address];
  if (!cell) return 0;
  if (cell.t === "e") return null;
  if (!cell.f && (cell.t === "z" || cell.v === undefined || cell.v === "")) return 0;
  if (cell.t !== "z" && cell.v !== undefined && cell.v !== "") return typeof cell.v === "number" && Number.isFinite(cell.v) ? cell.v : parseStatementAmount(cell.v);
  if (!cell.f || seen.has(address) || seen.size > 1000) return null;
  const next = new Set(seen).add(address);
  const source = cell.f.replace(/^=/, "").replace(/\$/g, "").toUpperCase();
  const tokens = source.match(/SUM|[A-Z]+\d+|\d+(?:\.\d+)?|[()+\-*/,:]/g) || [];
  if (tokens.join("") !== source.replace(/\s/g, "")) return null;
  let i = 0;
  const ref = (s: string) => /^[A-Z]+\d+$/.test(s || "");
  function atom(): number {
    const token = tokens[i++];
    if (token === "+") return atom();
    if (token === "-") return -atom();
    if (token === "(") { const n = expression(); if (tokens[i++] !== ")") throw Error(); return n; }
    if (token === "SUM") {
      if (tokens[i++] !== "(") throw Error();
      let n = 0;
      do {
        if (ref(tokens[i]) && tokens[i + 1] === ":" && ref(tokens[i + 2])) {
          const a = tokens[i++];
          i++; // colon
          const b = tokens[i++];
          const ma = a.match(/^([A-Z]+)(\d+)$/)!, mb = b.match(/^([A-Z]+)(\d+)$/)!;
          if (ma[1] !== mb[1] || +mb[2] - +ma[2] > 10000 || +mb[2] < +ma[2]) throw Error();
          for (let row = +ma[2]; row <= +mb[2]; row++) {
            const value = cellNumber(sheet, `${ma[1]}${row}`, next);
            if (value === null) throw Error();
            n += value;
          }
        } else n += expression();
      } while (tokens[i] === "," && ++i);
      if (tokens[i++] !== ")") throw Error();
      return n;
    }
    if (ref(token)) { const n = cellNumber(sheet, token, next); if (n === null) throw Error(); return n; }
    if (!/^\d+(?:\.\d+)?$/.test(token || "")) throw Error();
    return Number(token);
  }
  function product(): number { let n = atom(); while (["*", "/"].includes(tokens[i])) { const op = tokens[i++], b = atom(); n = op === "*" ? n * b : n / b; } return n; }
  function expression(): number { let n = product(); while (["+", "-"].includes(tokens[i])) { const op = tokens[i++], b = product(); n = op === "+" ? n + b : n - b; } return n; }
  try { const n = expression(); return i === tokens.length && Number.isFinite(n) ? n : null; } catch { return null; }
}

export function extractWorkbookStatementAmount(book: WorkBook): number | null {
  const candidates: number[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!") || !paymentLabel(String(cell.v ?? ""))) continue;
      const match = address.match(/^([A-Z]+)(\d+)$/);
      if (!match) continue;
      const column = match[1].split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const row = Number(match[2]) - 1;
      const encodeColumn = (c: number): string => c < 26 ? String.fromCharCode(65 + c) : encodeColumn(Math.floor(c / 26) - 1) + encodeColumn(c % 26);
      let found: number | null = null;
      // Final amount is either right of the label or directly below the merged label.
      for (let dr = 0; dr <= 2 && found === null; dr++) {
        for (let dc = dr === 0 ? 1 : 0; dc <= 3; dc++) {
          const ref = `${encodeColumn(column + dc)}${row + dr + 1}`;
          const candidate = sheet[ref];
          if (!candidate || (!candidate.f && (candidate.t === "z" || candidate.v === undefined || candidate.v === ""))) continue;
          found = cellNumber(sheet, ref);
          if (found !== null) break;
        }
      }
      if (found !== null) candidates.push(Math.round(found * 100) / 100);
    }
  }
  return candidates.length && candidates.every(n => n === candidates[0]) ? candidates[0] : null;
}

export function extractPdfStatementAmount(lines: string[]): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].match(/\b(?:NET\s*PAY|CHECK\s*AMOUNT|AMOUNT\s*PAID|TOTAL\s*PAY|NET\s*AMOUNT|BALANCE\s*DUE|TOTAL\s*DUE)\b\s*:?/i);
    if (!label) continue;
    const after = lines[i].slice(label.index! + label[0].length);
    const text = [after, ...lines.slice(i + 1, i + 3)].join(" ");
    const match = text.match(/\(?-?\s*\$?\s*\d[\d,]*\.\d{2}\s*\)?/);
    const n = match ? parseStatementAmount(match[0]) : null;
    if (n !== null) candidates.push(n);
  }
  return candidates.length && candidates.every(n => n === candidates[0]) ? candidates[0] : null;
}

export async function readStatement(file: File): Promise<{ amount: number | null; workbook?: WorkBook }> {
  if (file.size > STATEMENT_MAX_BYTES) throw new Error("Statement must be 20 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, sheetStubs: true });
    return { amount: extractWorkbookStatementAmount(workbook), workbook };
  }
  if (extension !== "pdf") throw new Error("Choose a PDF or XLSX statement.");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30) throw new Error("Statement must have 30 pages or fewer.");
    const lines: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const rows = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        rows.set(y, [...(rows.get(y) || []), { x: item.transform[4], text: item.str }]);
      }
      lines.push(...[...rows].sort((a, b) => b[0] - a[0]).map(([, row]) => row.sort((a, b) => a.x - b.x).map(t => t.text).join(" ")));
    }
    return { amount: extractPdfStatementAmount(lines) };
  } finally { await task.destroy(); }
}
