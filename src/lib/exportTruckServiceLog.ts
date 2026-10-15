import ExcelJS from "exceljs";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";
import { serviceSummary, type ServiceTruck, type calculateServiceLog } from "@/lib/truckServiceLog";

type LogRow = ReturnType<typeof calculateServiceLog>[number];
const blue = "FF1E3989";
const dateValue = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : null;
const miles = (value: number | null | undefined) => value == null ? "" : `${value.toLocaleString("en-US")} mi`;

/** A snapshot of the displayed truck log, using the supplied workbook's B:I layout. */
export function buildTruckServiceWorkbook(truck: ServiceTruck, rows: LogRow[], summary: ReturnType<typeof serviceSummary>, authors: Map<string, string>) {
  const book = new ExcelJS.Workbook();
  book.creator = "Beverly TMS";
  const sheet = book.addWorksheet(`Truck ${truck.truck_number}`.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31), {
    views: [{ state: "frozen", ySplit: 12, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "12:12" },
  });
  [3.88, 14.5, 23, 17, 18, 18, 21, 23, 46, 3.88].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  const end = Math.max(15, 12 + rows.length);
  for (let r = 2; r <= end; r++) {
    sheet.getRow(r).height = 22;
    for (let c = 2; c <= 9; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: "Arial", size: 10, color: { argb: "FF0F1628" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = Object.fromEntries(["top", "bottom", "left", "right"].map(edge => [edge, { style: "thin", color: { argb: "FFE0E5EF" } }]));
    }
  }
  sheet.mergeCells("B2:I2");
  const title = sheet.getCell("B2");
  title.value = `${[truck.make, truck.model].filter(Boolean).join(" / ").toUpperCase()} • TRUCK ${truck.truck_number} • FLEET MAINTENANCE & OIL CHANGE SYSTEM`;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
  title.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 32;
  const metadata = [
    ["Truck Unit:", truck.truck_number, "Model Year:", truck.year, "Make / Model:", [truck.make, truck.model].filter(Boolean).join(" / "), "Fleet Status:", truck.is_active ? "ACTIVE" : "INACTIVE"],
    ["VIN:", truck.vin, "Engine Type:", truck.engine, "Oil Specification:", truck.oil_spec ?? null, "Service Interval:", miles(summary.interval.miles)],
    ["Telematics / ELD:", truck.samsara_account ? `SAMSARA / ${truck.samsara_account}` : null, "Baseline Start:", dateValue(summary.baseline?.log_date), "Baseline Odometer:", summary.baseline?.odometer ?? null, "Baseline Note:", summary.baseline?.notes ?? null],
  ];
  metadata.forEach((values, index) => {
    const r = index + 3; sheet.getRow(r).height = 32;
    values.forEach((value, i) => {
      const cell = sheet.getCell(r, i + 2); cell.value = value;
      if (typeof value === "string") cell.numFmt = "@";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8FA" } };
      cell.font = { name: "Arial", size: i % 2 === 0 ? 9 : 10, bold: true, color: { argb: i % 2 === 0 ? "FF475468" : "FF0F1628" } };
    });
  });
  sheet.getCell("E5").numFmt = "m/d/yyyy";
  sheet.getCell("G5").numFmt = "#,##0";
  const airDue = summary.current != null && summary.sinceFilter != null && summary.sinceFilter >= 0 ? summary.current - summary.sinceFilter + 80000 : null;
  const cards = [
    { col: 2, title: "CURRENT ODOMETER", value: summary.current, fill: "FFEFF4FF", color: blue, lines: [`Baseline: ${miles(summary.baseline?.odometer)}`, `Last update: ${summary.currentDate ?? ""}`] },
    { col: 4, title: "MILES SINCE LAST OIL CHANGE", value: summary.sinceOil, fill: "FFEFFCF4", color: "FF13522C", lines: [`Last change: ${summary.oilDate ?? ""}`, `PM interval target: ${miles(summary.interval.miles)}`] },
    { col: 6, title: "NEXT SERVICE DUE (ODO)", value: summary.nextDue, fill: "FFFDFBE8", color: "FF703E12", lines: [`Air filter due (ODO): ${airDue == null ? "Unknown" : miles(airDue)}`, `${summary.remaining != null && summary.remaining < 0 ? "Overdue" : "Miles remaining"}: ${miles(summary.remaining == null ? null : Math.abs(summary.remaining))}`] },
    { col: 8, title: "FLEET PM READINESS", value: summary.status, fill: "FFEDF1FF", color: "FF372FA2", lines: ["Based on oil-change mileage only", `Exported: ${chicagoTodayISO()}`] },
  ];
  for (const card of cards) {
    for (let r = 7; r <= 10; r++) {
      sheet.mergeCells(r, card.col, r, card.col + 1);
      const cell = sheet.getCell(r, card.col);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: card.fill } };
      cell.font = { name: "Arial", size: r === 8 ? 18 : 9, bold: r <= 8, color: { argb: card.color } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.value = r === 7 ? card.title : r === 8 ? card.value : card.lines[r - 9];
      if (r === 8 && typeof card.value === "number") cell.numFmt = '#,##0" mi"';
    }
  }
  sheet.getRow(7).height = 22; sheet.getRow(8).height = 32;
  sheet.getRow(9).height = 28; sheet.getRow(10).height = 25;
  const headers = ["Log Date", "Entry Type", "Total Odometer", "Miles Since Service", "Next Due (mi)", "Oil Grade / Spec", "Service Facility", "Notes / Samsara Telematics"];
  headers.forEach((value, index) => {
    const cell = sheet.getCell(12, index + 2); cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  });
  sheet.getRow(12).height = 32;
  rows.forEach((entry, index) => {
    const r = index + 13;
    const notes = [entry.notes, entry.invoice ? `Invoice: ${entry.invoice}` : null, entry.created_by ? `Added by: ${authors.get(entry.created_by) ?? "Unknown user"}` : null].filter(Boolean).join("\n");
    const values = [dateValue(entry.log_date), entry.entry_type, entry.odometer, entry.miles_since_service, entry.next_due, entry.oil_spec, entry.facility, notes];
    const service = entry.entry_type !== "Mileage Check";
    values.forEach((value, i) => {
      const cell = sheet.getCell(r, i + 2); cell.value = value;
      if (typeof value === "string") cell.numFmt = "@";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: entry.entry_type === "Baseline Start" ? "FFABC6F0" : service ? "FFEFFCF4" : index % 2 ? "FFF8F9FB" : "FFFFFFFF" } };
      cell.font = { name: "Arial", size: 10, bold: service, color: { argb: "FF0F1628" } };
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: i >= 2 && i <= 4 ? "right" : "left", indent: 1 };
      if (i === 0) cell.numFmt = "m/d/yyyy";
      if (i >= 2 && i <= 4) cell.numFmt = "#,##0";
    });
    sheet.getRow(r).height = Math.min(409, Math.max(22, ...[notes, entry.facility ?? "", entry.oil_spec ?? ""].map(value => value.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 42)), 0) * 14 + 6)));
  });
  sheet.pageSetup.printArea = `B2:I${end}`;
  return book;
}

export async function exportTruckServiceLog(truck: ServiceTruck, rows: LogRow[], summary: ReturnType<typeof serviceSummary>, authors: Map<string, string>) {
  const book = buildTruckServiceWorkbook(truck, rows, summary, authors);
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = `Truck-${truck.truck_number.replace(/[^a-zA-Z0-9_-]/g, "-")}-Service-Log-${chicagoTodayISO()}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
