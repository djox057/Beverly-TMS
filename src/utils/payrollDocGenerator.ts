import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from "docx";

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

// Helper to create table cell with bottom border only
const createCell = (text: string, options?: { bold?: boolean; width?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType] }) => {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.DXA } : undefined,
    borders: {
      top: { style: BorderStyle.NIL },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.NIL },
      right: { style: BorderStyle.NIL },
    },
    children: [
      new Paragraph({
        alignment: options?.alignment || AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: options?.bold,
            size: 22, // 11pt
          }),
        ],
      }),
    ],
  });
};

export const generatePayrollDocument = async (data: PayrollData): Promise<Blob> => {
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance + data.extraDaysAmount;
  
  // Determine if we need extra days row or lost days row
  const hasExtraDays = data.extraDays > data.lostDays;
  const hasLostDays = data.lostDays > data.extraDays;
  const hasDifference = data.extraDays !== data.lostDays;

  // Build table rows
  const tableRows: TableRow[] = [
    // Header row
    new TableRow({
      children: [
        new TableCell({
          width: { size: 5000, type: WidthType.DXA },
          shading: { fill: "D9D9D9" },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Description",
                  bold: true,
                  underline: {},
                  size: 22,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          shading: { fill: "D9D9D9" },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Amount",
                  bold: true,
                  underline: {},
                  size: 22,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    // Salary 1% row (changed to Bonus 1%)
    createTableRow("Bonus 1%", `$${data.salary1Percent.toFixed(2)}`),
    // Bonus 5% row
    createTableRow("Bonus 5%", `$${data.bonus5Percent.toFixed(2)}`),
    // Food allowance row
    createTableRow("Food allowance", data.foodAllowance > 0 ? `$${data.foodAllowance.toFixed(2)}` : ""),
  ];

  // Add extra days row if applicable
  if (hasExtraDays && hasDifference) {
    const datesText = data.extraDayDates.length > 0 
      ? `Worked additional days ${data.extraDayDates.join(", ")}`
      : "Worked additional days";
    tableRows.push(createTableRow(datesText, `$${data.extraDaysAmount.toFixed(2)}`));
  }

  // Add lost days row if applicable (with no amount, just info)
  if (hasLostDays && hasDifference) {
    const datesText = data.lostDayDates.length > 0 
      ? `Days off ${data.lostDayDates.join(", ")}`
      : "Days off";
    tableRows.push(createTableRow(datesText, ""));
  }

  // Check amount row
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 5000, type: WidthType.DXA },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Check amount:",
                  bold: true,
                  underline: {},
                  size: 22,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `$${checkAmount.toFixed(2)}`,
                  bold: true,
                  color: "0000FF",
                  size: 22,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "Beverly Group LLC",
                bold: true,
                italics: true,
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "PAYROLL STATEMENT",
                bold: true,
                size: 32,
              }),
            ],
          }),
          new Paragraph({ children: [] }),
          // Red line separator
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 24, color: "FF0000" },
            },
            children: [],
          }),
          new Paragraph({ children: [] }),
          // Employee info
          new Paragraph({
            children: [
              new TextRun({
                text: "Employee name: ",
                bold: true,
                italics: true,
                size: 22,
              }),
              new TextRun({
                text: data.employeeName,
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Department: ",
                bold: true,
                italics: true,
                size: 22,
              }),
              new TextRun({
                text: "Dispatch",
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Pay period: ",
                bold: true,
                italics: true,
                size: 22,
              }),
              new TextRun({
                text: data.payPeriod,
                size: 22,
              }),
            ],
          }),
          new Paragraph({ children: [] }),
          // Red line separator
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 24, color: "FF0000" },
            },
            children: [],
          }),
          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),
          // Table
          new Table({
            width: { size: 8000, type: WidthType.DXA },
            rows: tableRows,
          }),
          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),
          // Disclaimer
          new Paragraph({
            children: [
              new TextRun({
                text: "***Due to the company policy discussing your salary at work is prohibited. If there are any problems and concerns they need to be discussed with the managers directly.",
                color: "FF0000",
                bold: true,
                underline: {},
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
};

function createTableRow(description: string, amount: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 5000, type: WidthType.DXA },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: description,
                size: 22,
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: amount,
                size: 22,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

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
