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
}

const BLUE_COLOR = "0000FF";
const RED_COLOR = "FF0000";
const GREEN_COLOR = "008000";
const LIGHT_BLUE_BG = "DCE6F1";
const GRAY_HEADER_BG = "C0C0C0";

const createHorizontalLine = () => {
  return new Paragraph({
    border: {
      bottom: {
        color: BLUE_COLOR,
        size: 12,
        style: BorderStyle.SINGLE,
        space: 1,
      },
    },
    spacing: { after: 200 },
  });
};

export const generatePayrollDocument = async (data: PayrollData): Promise<Blob> => {
  const hasExtraDays = data.extraDays > data.lostDays;
  
  // Calculate check amount
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance + 
    (hasExtraDays ? data.extraDaysAmount : 0);

  // Format dates for display
  const extraDatesText = data.extraDayDates.length > 0 
    ? data.extraDayDates.join(", ") 
    : "";

  // Build table rows
  const tableRows: TableRow[] = [];

  // Header row - gray background, underlined text (not bold)
  tableRows.push(
    new TableRow({
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
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Salary 1% row - white description, light blue amount
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Salary 1%" })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `$${data.salary1Percent.toFixed(2)}` })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Bonus 5% row - white description, light blue amount
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Bonus 5%" })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `$${data.bonus5Percent.toFixed(2)}` })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Food allowance row - white description, light blue amount
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Food allowance" })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `$${data.foodAllowance.toFixed(2)}` })],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    })
  );

  // Extra days row (only if has extra days) - white description, light blue amount
  if (hasExtraDays) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `Worked additional days (${extraDatesText})` })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            shading: { fill: LIGHT_BLUE_BG, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `$${data.extraDaysAmount.toFixed(2)}` })],
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );
  }

  // Check amount row
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
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
                }),
              ],
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
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
                  color: GREEN_COLOR,
                  bold: true,
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
          // Header - Beverly Group LLC
          new Paragraph({
            children: [
              new TextRun({
                text: "Beverly Group LLC",
                italics: true,
                bold: true,
                color: BLUE_COLOR,
                size: 28,
              }),
            ],
          }),
          // PAYROLL STATEMENT - no underline
          new Paragraph({
            children: [
              new TextRun({
                text: "PAYROLL STATEMENT",
                bold: true,
                color: BLUE_COLOR,
                size: 32,
              }),
            ],
            spacing: { after: 400 },
          }),
          // Blue horizontal line
          createHorizontalLine(),
          // Empty line
          new Paragraph({ spacing: { after: 200 } }),
          // Blue horizontal line
          createHorizontalLine(),
          // Employee name - only "Employee" is underlined/italic
          new Paragraph({
            children: [
              new TextRun({
                text: "Employee",
                italics: true,
                underline: {},
              }),
              new TextRun({
                text: " name:",
              }),
              new TextRun({
                text: `  ${data.employeeName}`,
              }),
            ],
            spacing: { after: 100 },
          }),
          // Department - regular text, not bold
          new Paragraph({
            children: [
              new TextRun({
                text: "Department:",
                italics: true,
              }),
              new TextRun({
                text: " Dispatch",
              }),
            ],
            spacing: { after: 100 },
          }),
          // Pay period - regular text, not bold
          new Paragraph({
            children: [
              new TextRun({
                text: "Pay period:",
                italics: true,
              }),
              new TextRun({
                text: ` ${data.payPeriod}`,
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
