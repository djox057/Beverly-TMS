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

const hartLayout = {
  loads: { start: 13, capacity: 3, total: 16 },
  deductions: { start: 20, capacity: 9, total: 29 },
  fuel: { start: 34, capacity: 10, total: 44 },
  credits: { start: 47, capacity: 2, total: 50 },
  header: {
    issueDate: "C2", payPeriod: "C3", invoice: "C4", driver: "C6", company: "C7",
    agreementStart: "C8", truck: "C9", agreementTerms: "C10",
  },
  creditDescription: "B",
  checkColumn: "I",
  checkRow: 57,
  printEnd: "J",
  lastRow: 58,
};

const gdLayout: typeof hartLayout = {
  loads: { start: 14, capacity: 7, total: 21 },
  credits: { start: 25, capacity: 1, total: 26 },
  deductions: { start: 30, capacity: 7, total: 37 },
  fuel: { start: 41, capacity: 14, total: 55 },
  header: {
    issueDate: "E4", payPeriod: "B12", invoice: "E3", driver: "E7", company: "J7",
    agreementStart: "J3", truck: "E5", agreementTerms: "J4",
  },
  creditDescription: "C",
  checkColumn: "J",
  checkRow: 58,
  printEnd: "L",
  lastRow: 64,
};

export function fillHartStatement(sheet: ExcelJS.Worksheet, data: HartStatementData) {
  return fillStatement(sheet, data, hartLayout);
}

export function fillGdStatement(sheet: ExcelJS.Worksheet, data: HartStatementData) {
  return fillStatement(sheet, data, gdLayout);
}

// Expand from the bottom up and rebuild merges explicitly: ExcelJS spliceRows
// does not move merged ranges or rewrite formulas reliably.
function fillStatement(sheet: ExcelJS.Worksheet, data: HartStatementData, layout: typeof hartLayout) {
  const { loads, deductions, fuel, credits } = layout;
  const sections = [
    { ...loads, count: data.loads.length },
    { ...deductions, count: data.deductions.length },
    { ...fuel, count: data.fuel.length },
    { ...credits, count: data.credits.length },
  ].sort((a, b) => a.start - b.start)
    .map(section => ({ ...section, extra: Math.max(0, section.count - section.capacity) }));
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
  for (const key of Object.keys(layout.header) as (keyof typeof layout.header)[]) {
    set(layout.header[key], data[key]);
  }
  for (const s of sections) {
    for (let r = row(s.start); r < row(s.start) + s.capacity + s.extra; r++) {
      for (let c = 1; c <= 10; c++) {
        // Keep the fixed deduction descriptions supplied in the template.
        if (s.start !== deductions.start || c !== 2) sheet.getCell(r, c).value = null;
      }
    }
  }
  data.loads.forEach((load, i) => {
    const r = row(loads.start) + i;
    sheet.mergeCells(`C${r}:D${r}`); sheet.mergeCells(`F${r}:G${r}`);
    [load.number, load.pickupDate, load.pickup, null, load.deliveryDate, load.delivery, null, load.miles, load.freight]
      .forEach((v, c) => { if (v !== null) set(`${String.fromCharCode(65 + c)}${r}`, v); });
    money(`I${r}`, load.freight);
    money(`J${r}`, { formula: `ROUND(I${r}*88%,2)`, result: Math.round((load.freight * .88 + Number.EPSILON) * 100) / 100 });
  });
  const entries = (list: Entry[], start: number, descriptionColumn: string) => list.forEach((entry, i) => {
    const r = row(start) + i;
    set(`${descriptionColumn}${r}`, entry.description);
    set(`I${r}`, entry.date);
    money(`J${r}`, entry.amount);
  });
  entries(data.deductions, deductions.start, "B");
  entries(data.credits, credits.start, layout.creditDescription);
  data.fuel.forEach((f, i) => {
    const r = row(fuel.start) + i;
    [f.number, f.date, f.location, f.city, f.state, f.fees, f.item, f.price, f.quantity, f.amount]
      .forEach((v, c) => set(`${String.fromCharCode(65 + c)}${r}`, v));
    for (const col of ["F", "H", "J"]) sheet.getCell(`${col}${r}`).numFmt = "$#,##0.00";
  });
  const sum = (col: string, section: typeof loads, count: number, result: number) => {
    const start = row(section.start);
    const end = start + Math.max(section.capacity, count) - 1;
    money(`${col}${row(section.total)}`, { formula: `SUM(${col}${start}:${col}${end})`, result });
  };
  const gross = data.loads.reduce((n, load) => n + load.freight, 0);
  const earnings = data.loads.reduce((n, load) => n + Math.round((load.freight * .88 + Number.EPSILON) * 100) / 100, 0);
  const deductionsTotal = data.deductions.reduce((n, entry) => n + entry.amount, 0);
  const fuelTotal = data.fuel.reduce((n, entry) => n + entry.amount, 0);
  const creditsTotal = data.credits.reduce((n, entry) => n + entry.amount, 0);
  sum("H", loads, data.loads.length, data.loads.reduce((n, load) => n + load.miles, 0));
  sheet.getCell(`H${row(loads.total)}`).numFmt = "#,##0.00";
  sum("I", loads, data.loads.length, gross);
  sum("J", loads, data.loads.length, earnings);
  sum("J", deductions, data.deductions.length, deductionsTotal);
  sum("J", fuel, data.fuel.length, fuelTotal);
  sum("J", credits, data.credits.length, creditsTotal);
  money(`${layout.checkColumn}${row(layout.checkRow)}`, {
    formula: `J${row(loads.total)}+J${row(credits.total)}-J${row(deductions.total)}-J${row(fuel.total)}`,
    result: earnings + creditsTotal - deductionsTotal - fuelTotal,
  });
  sheet.pageSetup.printArea = `A1:${layout.printEnd}${row(layout.lastRow)}`;
  return row(layout.lastRow);
}
