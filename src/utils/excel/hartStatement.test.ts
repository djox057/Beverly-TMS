// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { fillGdStatement, fillHartStatement, HartStatementData } from "./hartStatement";

const data = (count: number): HartStatementData => ({
  issueDate: "11/12/2026", payPeriod: "10/27/2026-11/2/2026", invoice: "20261026",
  driver: "Test Driver", company: "Hart Freight Solutions LLC", agreementStart: "1/1/2026",
  truck: "123", agreementTerms: "$500/100weeks",
  loads: Array.from({ length: count }, (_, i) => ({ number: `50000${i + 1}`, pickupDate: "10/27/2026", pickup: "Chicago, IL", deliveryDate: "10/28/2026", delivery: "Dallas, TX", miles: 1000, freight: 1000 })),
  deductions: Array.from({ length: count + 6 }, (_, i) => ({ description: `Deduction ${i}`, date: "11/2/2026", amount: 10 })),
  credits: Array.from({ length: count }, (_, i) => ({ description: `Credit ${i}`, date: "11/2/2026", amount: 20 })),
  fuel: Array.from({ length: count + 10 }, (_, i) => ({ number: `${i}`, date: "10/27/2026", location: "Fuel stop", city: "Chicago", state: "IL", fees: 1, item: "Diesel", price: 4, quantity: 10, amount: 40 })),
});

describe("Hart Freight statement", () => {
  for (const count of [0, 3, 15]) it(`preserves template, all entries and totals for ${count} loads`, async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile("src/assets/templates/Hart_Freight.xlsx");
    const sheet = workbook.getWorksheet(1)!;
    const input = data(count);
    fillHartStatement(sheet, input);
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    const output = reloaded.getWorksheet(1)!;
    expect(output.getCell("C6").value).toBe("Test Driver");
    expect(output.getImages()).toHaveLength(1);
    const values: ExcelJS.CellValue[] = [];
    output.eachRow(row => row.eachCell(cell => { values.push(cell.value); }));
    if (count) {
      expect(values).toContain(`50000${count}`);
      expect(values).toContain("Chicago, IL");
      expect(values).toContain("Dallas, TX");
      expect(values).toContain(`Credit ${count - 1}`);
    }
    expect(values).toContain(`Deduction ${count + 5}`);
    const net = values.find(v => typeof v === "object" && v && "formula" in v && /^J\d+\+J\d+-J\d+-J\d+$/.test(v.formula));
    expect(net).toMatchObject({ result: count * 880 + count * 20 - (count + 6) * 10 - (count + 10) * 40 });
    expect(values.filter(v => v === "Diesel")).toHaveLength(count + 10);
  });
});

describe("GD Trucking Solutions statement", () => {
  for (const count of [1, 15]) {
    it(`exports the branded layout and totals for ${count} loads`, async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile("src/assets/templates/GD_Trucking_Solutions.xlsx");
      const input = { ...data(count), company: "GD Trucking Solutions LLC" };
      const lastRow = fillGdStatement(workbook.getWorksheet(1)!, input);

      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
      const output = reloaded.getWorksheet(1)!;
      expect(output.getImages()).toHaveLength(1);
      expect(output.pageSetup.printArea).toBe(`A1:L${lastRow}`);
      expect(output.getCell("E3").value).toBe(input.invoice);
      expect(output.getCell("E4").value).toBe(input.issueDate);
      expect(output.getCell("E5").value).toBe(input.truck);
      expect(output.getCell("E7").value).toBe(input.driver);
      expect(output.getCell("J7").value).toBe(input.company);
      expect(output.getCell("J3").value).toBe(input.agreementStart);
      expect(output.getCell("J4").value).toBe(input.agreementTerms);
      expect(output.getCell("B12").value).toBe(input.payPeriod);
      expect(output.getCell("J14").value).toEqual({ formula: "ROUND(I14*88%,2)", result: 880 });

      const lastLoad = 13 + count;
      const extraLoads = Math.max(0, count - 7);
      const creditTotal = 26 + extraLoads + count - 1;
      const deductionTotal = 37 + extraLoads + (count - 1) * 2;
      const fuelTotal = 55 + extraLoads + (count - 1) * 2 + Math.max(0, count - 4);
      expect(output.getCell(`A${lastLoad}`).value).toBe(input.loads.at(-1)?.number);
      expect(output.getCell(`C${creditTotal - 1}`).value).toBe(input.credits.at(-1)?.description);
      expect(output.getCell(`B${deductionTotal - 1}`).value).toBe(input.deductions.at(-1)?.description);
      const fuelItems: string[] = [];
      output.eachRow(row => {
        if (row.getCell("G").value === "Diesel") fuelItems.push(String(row.getCell("A").value));
      });
      expect(fuelItems).toEqual(input.fuel.map(entry => entry.number));
      expect(output.getCell(`J${lastRow - 6}`).value).toEqual({
        formula: `J${21 + extraLoads}+J${creditTotal}-J${deductionTotal}-J${fuelTotal}`,
        result: count * 880 + count * 20 - (count + 6) * 10 - (count + 10) * 40,
      });
    });
  }
});
