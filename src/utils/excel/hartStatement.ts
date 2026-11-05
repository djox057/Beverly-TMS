import ExcelJS from "exceljs";

type Entry = { description: string; date: string; amount: number };
export interface HartStatementData {
  issueDate: string;
  payPeriod: string;
  invoice: string;
  driver: string;
  company: string;
  agreementStart: string;
  truck: string;
  agreementTerms: string;
  loads: { number: string; pickupDate: string; pickup: string; deliveryDate: string; delivery: string; miles: number; freight: number }[];
  deductions: Entry[];
  credits: Entry[];
  fuel: { number: string; date: string; location: string; city: string; state: string; fees: number; item: string; price: number; quantity: number; amount: number }[];
}

// Expand from the bottom up and rebuild merges explicitly: ExcelJS spliceRows
// does not move merged ranges or rewrite formulas reliably.
export function fillHartStatement(sheet: ExcelJS.Worksheet, data: HartStatementData) {
  const sections = [
    { start: 13, capacity: 3, count: data.loads.length },
    { start: 20, capacity: 9, count: data.deductions.length },
    { start: 34, capacity: 10, count: data.fuel.length },
    { start: 47, capacity: 2, count: data.credits.length },
  ].map(s => ({ ...s, extra: Math.max(0, s.count - s.capacity) }));
  const row = (r: number) => r + sections.reduce((n, s) => n + (r >= s.start + s.capacity ? s.extra : 0), 0);
  const merges = [...sheet.model.merges];
  merges.forEach(m => sheet.unMergeCells(m));
  for (const s of [...sections].reverse()) {
    if (!s.extra) continue;
    const sample = sheet.getRow(s.start);
    const styles = Array.from({ length: 10 }, (_, i) => structuredClone(sample.getCell(i + 1).style));
    sheet.spliceRows(s.start + s.capacity, 0, ...Array.from({ length: s.extra }, () => []));
    for (let r = s.start + s.capacity; r < s.start + s.capacity + s.extra; r++) {
      sheet.getRow(r).height = sample.height;
      styles.forEach((style, i) => { sheet.getCell(r, i + 1).style = structuredClone(style); });
    }
  }
  merges.forEach(m => sheet.mergeCells(m.replace(/([A-Z]+)(\d+)/g, (_, col, r) => `${col}${row(Number(r))}`)));
  const set = (address: string, value: ExcelJS.CellValue) => { sheet.getCell(address).value = value; };
  const money = (address: string, value: ExcelJS.CellValue) => {
    set(address, value); sheet.getCell(address).numFmt = "$#,##0.00";
  };
  [data.issueDate, data.payPeriod, data.invoice].forEach((v, i) => set(`C${i + 2}`, v));
  [data.driver, data.company, data.agreementStart, data.truck, data.agreementTerms].forEach((v, i) => set(`C${i + 6}`, v));
  for (const s of sections) {
    for (let r = row(s.start); r < row(s.start) + s.capacity + s.extra; r++) {
      for (let c = 1; c <= 10; c++) {
        // Keep the fixed deduction descriptions supplied in the template.
        if (s.start !== 20 || c !== 2) sheet.getCell(r, c).value = null;
      }
    }
  }
  data.loads.forEach((load, i) => {
    const r = row(13) + i;
    sheet.mergeCells(`C${r}:D${r}`); sheet.mergeCells(`F${r}:G${r}`);
    [load.number, load.pickupDate, load.pickup, null, load.deliveryDate, load.delivery, null, load.miles, load.freight]
      .forEach((v, c) => { if (v !== null) set(`${String.fromCharCode(65 + c)}${r}`, v); });
    money(`I${r}`, load.freight);
    money(`J${r}`, { formula: `ROUND(I${r}*88%,2)`, result: Math.round((load.freight * .88 + Number.EPSILON) * 100) / 100 });
  });
  const entries = (list: Entry[], start: number) => list.forEach((e, i) => {
    const r = row(start) + i;
    set(`B${r}`, e.description); set(`I${r}`, e.date); money(`J${r}`, e.amount);
  });
  entries(data.deductions, 20); entries(data.credits, 47);
  data.fuel.forEach((f, i) => {
    const r = row(34) + i;
    [f.number, f.date, f.location, f.city, f.state, f.fees, f.item, f.price, f.quantity, f.amount]
      .forEach((v, c) => { if (v !== null) set(`${String.fromCharCode(65 + c)}${r}`, v); });
    for (const col of ["F", "H", "J"]) sheet.getCell(`${col}${r}`).numFmt = "$#,##0.00";
  });
  const sum = (col: string, start: number, capacity: number, count: number, total: number, result: number) =>
    money(`${col}${row(total)}`, { formula: `SUM(${col}${row(start)}:${col}${row(start) + Math.max(capacity, count) - 1})`, result });
  const gross = data.loads.reduce((n, l) => n + l.freight, 0);
  const earnings = data.loads.reduce((n, l) => n + Math.round((l.freight * .88 + Number.EPSILON) * 100) / 100, 0);
  const deductions = data.deductions.reduce((n, e) => n + e.amount, 0);
  const fuel = data.fuel.reduce((n, e) => n + e.amount, 0);
  const credits = data.credits.reduce((n, e) => n + e.amount, 0);
  sum("H", 13, 3, data.loads.length, 16, data.loads.reduce((n, l) => n + l.miles, 0));
  sheet.getCell(`H${row(16)}`).numFmt = "#,##0.00";
  sum("I", 13, 3, data.loads.length, 16, gross);
  sum("J", 13, 3, data.loads.length, 16, earnings);
  sum("J", 20, 9, data.deductions.length, 29, deductions);
  sum("J", 34, 10, data.fuel.length, 44, fuel);
  sum("J", 47, 2, data.credits.length, 50, credits);
  money(`I${row(57)}`, { formula: `J${row(16)}+J${row(50)}-J${row(29)}-J${row(44)}`, result: earnings + credits - deductions - fuel });
  sheet.pageSetup.printArea = `A1:J${row(58)}`;
  return row(58);
}
