import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  Packer,
  convertInchesToTwip,
  TableLayoutType,
  VerticalAlign,
  ShadingType,
} from "docx";

interface PayrollData {
  employeeName: string;
  payPeriod: string; // e.g., "December, 2025"
  salary1Percent: number;
  bonus5Percent: number;
  foodAllowance: number;
  extraDays: number;
  lostDays: number;
  extraDayDates: string[]; // Array of date strings like "12/16", "12/19"
  lostDayDates: string[]; // Array of date strings
  extraDaysAmount: number; // Additional amount earned from extra days
  dispatcherBonus?: number; // Monthly performance bonus (1st place $1000, etc.)
  perDayRate?: number; // Per-workday rate for lost days calculation
  sickDayDates?: string[]; // Dates marked as PTO
  totalSickDaysAvailable?: number; // Max PTO days per year (3)
  office?: string; // Dispatcher's office for conditional logic
  usedPtoDaysYearly?: number; // Total PTO days used this year (cumulative)
}

const BLACK_COLOR = "000000";
const LINE_COLOR = "2596BE"; // #2596be for horizontal lines
const RED_COLOR = "FF0000";
const LIGHT_BLUE_BG = "DCE6F1";
const GRAY_HEADER_BG = "C0C0C0";

// Text sizes (in half-points, so 24 = 12pt, 28 = 14pt, etc.)
const HEADER_SIZE = 32; // Beverly Group LLC
const TITLE_SIZE = 36; // PAYROLL STATEMENT
const BODY_SIZE = 26; // Employee info text (increased by ~4px)
const TABLE_SIZE = 28; // Table text (30% bigger)
const TABLE_ROW_HEIGHT = 480; // 20% taller rows (in twips, ~0.33 inches)

const createHorizontalLine = () => {
  return new Paragraph({
    border: {
      bottom: {
        color: LINE_COLOR,
        size: 12,
        style: BorderStyle.SINGLE,
        space: 1,
      },
    },
    spacing: { after: 200 },
  });
};

export const generatePayrollDocument = async (data: PayrollData): Promise<Blob> => {
  const sickDayDates = data.sickDayDates || [];
  const totalSickDaysAvailable = data.totalSickDaysAvailable ?? 3;
  
  // Independent visibility - both can show at the same time
  const hasExtraDays = data.extraDays > 0;
  const hasSickDays = sickDayDates.length > 0;
  
  // Non-sick days off are the ones that get deducted
  const nonSickDaysOffDates = data.lostDayDates.filter(d => !sickDayDates.includes(d));
  const nonSickDaysOff = nonSickDaysOffDates.length;
  const hasNonSickDaysOff = nonSickDaysOff > 0;
  
  const hasDispatcherBonus = (data.dispatcherBonus ?? 0) > 0;
  
  // Calculate amounts
  const perDayRate = data.perDayRate ?? 0;
  const extraDaysAdd = hasExtraDays ? data.extraDaysAmount : 0;
  const daysOffDeduction = nonSickDaysOff * perDayRate;
  
  // Calculate check amount
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance + 
    extraDaysAdd - daysOffDeduction + (data.dispatcherBonus ?? 0);

  // Format dates for display
  const extraDatesText = data.extraDayDates.length > 0 
    ? data.extraDayDates.join(", ") 
    : "";

  const sickDatesText = sickDayDates.length > 0 
    ? sickDayDates.join(", ") 
    : "";

  const nonSickDaysOffText = nonSickDaysOffDates.length > 0 
    ? nonSickDaysOffDates.join(", ") 
    : "";

  // Build table rows
  const tableRows: TableRow[] = [];

  // Header row - gray background, underlined text (not bold), taller height
  tableRows.push(
    new TableRow({
      height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: GRAY_HEADER_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Description",
                  underline: {},
                  size: TABLE_SIZE,
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: GRAY_HEADER_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Amount",
                  underline: {},
                  size: TABLE_SIZE,
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Salary 1% row - white description, light blue amount, taller height
  tableRows.push(
    new TableRow({
      height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Salary 1%", size: TABLE_SIZE })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `$${data.salary1Percent.toFixed(2)}`, size: TABLE_SIZE })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Bonus 5% row - white description, light blue amount, taller height
  tableRows.push(
    new TableRow({
      height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Bonus 5%", size: TABLE_SIZE })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `$${data.bonus5Percent.toFixed(2)}`, size: TABLE_SIZE })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Food allowance row - white description, light blue amount, taller height (only if > 0)
  if (data.foodAllowance > 0) {
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "Food allowance", size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$${data.foodAllowance.toFixed(2)}`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // Extra days row (if applicable - independent)
  // Special case: split out 1/10 for January 2026 as "Help moving to new office" (Kragujevac only)
  const isJan2026 = data.payPeriod.toLowerCase().includes("january") && data.payPeriod.includes("2026");
  const isKragujevac = data.office === "KRAGUJEVAC";
  const movingDayDates = isJan2026 && isKragujevac ? data.extraDayDates.filter(d => d === "1/10") : [];
  const regularExtraDayDates = isJan2026 && isKragujevac ? data.extraDayDates.filter(d => d !== "1/10") : data.extraDayDates;
  const perDayRateForExtra = data.extraDayDates.length > 0 ? data.extraDaysAmount / data.extraDayDates.length : 0;

  if (movingDayDates.length > 0) {
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `Help moving to new office (${movingDayDates.join(", ")})`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$${(perDayRateForExtra * movingDayDates.length).toFixed(2)}`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }
  if (regularExtraDayDates.length > 0) {
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `Worked additional days (${regularExtraDayDates.join(", ")})`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$${(perDayRateForExtra * regularExtraDayDates.length).toFixed(2)}`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // PTO row (if any PTO days used) - shows $0.00
  if (hasSickDays) {
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `Days off ${sickDatesText} used ${data.usedPtoDaysYearly ?? sickDayDates.length} of ${totalSickDaysAvailable} PTO days`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$0.00`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // Non-sick days off row (deducted) - BLACK text, not red
  // Only show if there are actually days to deduct AND the deduction is meaningful (> $0.005)
  if (hasNonSickDaysOff && daysOffDeduction > 0.005) {
    // If there are sick days, show just the dates on a new line
    // Otherwise, show full "Days off (dates)" format
    const daysOffLabel = hasSickDays 
      ? nonSickDaysOffText 
      : `Days off (${nonSickDaysOffText})`;
    
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: daysOffLabel, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `-$${daysOffDeduction.toFixed(2)}`, size: TABLE_SIZE, color: BLACK_COLOR })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // Dispatcher performance bonus row (only if has bonus)
  if (hasDispatcherBonus) {
    tableRows.push(
      new TableRow({
        height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "Performance Bonus", size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$${data.dispatcherBonus!.toFixed(2)}`, size: TABLE_SIZE })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // Check amount row - RED amount, taller height
  tableRows.push(
    new TableRow({
      height: { value: TABLE_ROW_HEIGHT, rule: "atLeast" as const },
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NIL },
            bottom: { style: BorderStyle.NIL },
            left: { style: BorderStyle.NIL },
            right: { style: BorderStyle.NIL },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Check amount:",
                  bold: true,
                  underline: {},
                  size: TABLE_SIZE,
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE },
            bottom: { style: BorderStyle.SINGLE },
            left: { style: BorderStyle.SINGLE },
            right: { style: BorderStyle.SINGLE },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `$${checkAmount.toFixed(2)}`,
                  color: RED_COLOR,
                  bold: true,
                  size: TABLE_SIZE,
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: [
          // Header - Beverly Group LLC (black)
          new Paragraph({
            children: [
              new TextRun({
                text: "Beverly Group LLC",
                italics: true,
                bold: true,
                color: BLACK_COLOR,
                size: HEADER_SIZE,
              }),
            ],
          }),
          // PAYROLL STATEMENT - no underline (black)
          new Paragraph({
            children: [
              new TextRun({
                text: "PAYROLL STATEMENT",
                bold: true,
                color: BLACK_COLOR,
                size: TITLE_SIZE,
              }),
            ],
            spacing: { after: 400 },
          }),
          // Blue horizontal line (only 1 line, removed 2nd)
          createHorizontalLine(),
          // Employee name - bold, not italic
          new Paragraph({
            children: [
              new TextRun({
                text: "Employee name:",
                bold: true,
                size: BODY_SIZE,
              }),
              new TextRun({
                text: `  ${data.employeeName}`,
                size: BODY_SIZE,
              }),
            ],
            spacing: { after: 100 },
          }),
          // Department - bold, not italic
          new Paragraph({
            children: [
              new TextRun({
                text: "Department:",
                bold: true,
                size: BODY_SIZE,
              }),
              new TextRun({
                text: " Dispatch",
                size: BODY_SIZE,
              }),
            ],
            spacing: { after: 100 },
          }),
          // Pay period - bold, not italic
          new Paragraph({
            children: [
              new TextRun({
                text: "Pay period:",
                bold: true,
                size: BODY_SIZE,
              }),
              new TextRun({
                text: ` ${data.payPeriod}`,
                size: BODY_SIZE,
              }),
            ],
            spacing: { after: 200 },
          }),
          // Blue horizontal line
          createHorizontalLine(),
          // Empty line before table
          new Paragraph({ spacing: { after: 200 } }),
          // Main table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: tableRows,
          }),
          // Empty space before disclaimer
          new Paragraph({ spacing: { after: 800 } }),
          // Disclaimer
          new Paragraph({
            children: [
              new TextRun({
                text: "***Due to the company policy discussing your salary at work is prohibited. If there are any problems and concerns they need to be discussed with the managers directly.",
                color: RED_COLOR,
                italics: true,
                underline: {},
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
};

export const downloadPayrollDoc = async (data: PayrollData, filename: string) => {
  const blob = await generatePayrollDocument(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
