import jsPDF from "jspdf";

// Export the adjustment type for use in other components
export interface PayrollAdjustment {
  type: "addition" | "charge";
  reason: string;
  amount: number;
}

interface PayrollData {
  employeeName: string;
  payPeriod: string;
  salary1Percent: number;
  bonus5Percent: number;
  foodAllowance: number;
  extraDays: number;
  lostDays: number;
  extraDayDates: string[];
  lostDayDates: string[];
  extraDaysAmount: number;
  dispatcherBonus?: number;
  perDayRate?: number; // Per-workday rate for lost days calculation
  sickDayDates?: string[]; // Dates marked as PTO
  totalSickDaysAvailable?: number; // Max PTO days per year (3)
  adjustments?: PayrollAdjustment[]; // Extra pay and charges
  isDeletedUser?: boolean; // If true, add future month salary/bonus rows
  futureMonthLabel?: string; // e.g., "February" for the next month
  futureSalary1Percent?: number; // Salary 1% for next month
  futureBonus5Percent?: number; // Bonus 5% for next month
}

const BLACK_COLOR = "#000000";
const LINE_COLOR = "#2596BE";
const RED_COLOR = "#FF0000";
const LIGHT_BLUE_BG = "#DCE6F1";
const GRAY_HEADER_BG = "#C0C0C0";

export const generatePayrollPdf = async (data: PayrollData): Promise<Blob> => {
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
  
  // Custom adjustments
  const adjustments = data.adjustments || [];
  const totalAdditions = adjustments
    .filter(a => a.type === "addition")
    .reduce((sum, a) => sum + a.amount, 0);
  const totalCharges = adjustments
    .filter(a => a.type === "charge")
    .reduce((sum, a) => sum + a.amount, 0);
  
  // Calculate amounts
  const perDayRate = data.perDayRate ?? 0;
  const extraDaysAdd = hasExtraDays ? data.extraDaysAmount : 0;
  const daysOffDeduction = nonSickDaysOff * perDayRate;
  
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance + 
    extraDaysAdd - daysOffDeduction + (data.dispatcherBonus ?? 0) + totalAdditions - totalCharges;

  const extraDatesText = data.extraDayDates.length > 0 
    ? data.extraDayDates.join(", ") 
    : "";

  const sickDatesText = sickDayDates.length > 0 
    ? sickDayDates.join(", ") 
    : "";

  const nonSickDaysOffText = nonSickDaysOffDates.length > 0 
    ? nonSickDaysOffDates.join(", ") 
    : "";

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 25;
  let y = 25;

  // Header - Beverly Group LLC (bold italic)
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(14);
  doc.setTextColor(BLACK_COLOR);
  doc.text("Beverly Group LLC", margin, y);
  y += 8;

  // PAYROLL STATEMENT (bold)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PAYROLL STATEMENT", margin, y);
  y += 12;

  // Blue horizontal line
  doc.setDrawColor(LINE_COLOR);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Employee info
  doc.setFontSize(11);
  doc.setTextColor(BLACK_COLOR);
  
  doc.setFont("helvetica", "bold");
  doc.text("Employee name:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`  ${data.employeeName}`, margin + 32, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Department:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(" Dispatch", margin + 26, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Pay period:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(` ${data.payPeriod}`, margin + 24, y);
  y += 8;

  // Blue horizontal line
  doc.setDrawColor(LINE_COLOR);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Table
  const tableX = margin;
  const tableWidth = pageWidth - 2 * margin;
  const col1Width = tableWidth / 2;
  const col2Width = tableWidth / 2;
  const rowHeight = 10;

  // Helper to draw a table row
  const drawRow = (
    text1: string, 
    text2: string, 
    bgColor1: string | null, 
    bgColor2: string | null,
    isHeader: boolean = false,
    text2Color: string = BLACK_COLOR,
    text2Bold: boolean = false,
    noBorders: boolean = false
  ) => {
    // Draw cell backgrounds
    if (bgColor1) {
      doc.setFillColor(bgColor1);
      doc.rect(tableX, y, col1Width, rowHeight, "F");
    }
    if (bgColor2) {
      doc.setFillColor(bgColor2);
      doc.rect(tableX + col1Width, y, col2Width, rowHeight, "F");
    }

    // Draw borders
    if (!noBorders) {
      doc.setDrawColor("#000000");
      doc.setLineWidth(0.2);
      doc.rect(tableX, y, col1Width, rowHeight);
      doc.rect(tableX + col1Width, y, col2Width, rowHeight);
    } else {
      // Only draw border around second cell
      doc.setDrawColor("#000000");
      doc.setLineWidth(0.2);
      doc.rect(tableX + col1Width, y, col2Width, rowHeight);
    }

    // Draw text
    doc.setFontSize(12);
    doc.setTextColor(BLACK_COLOR);
    
    if (isHeader) {
      doc.setFont("helvetica", "normal");
      // Underlined header text
      const text1Width = doc.getTextWidth(text1);
      const text2Width = doc.getTextWidth(text2);
      const text1X = tableX + col1Width / 2 - text1Width / 2;
      const text2X = tableX + col1Width + col2Width / 2 - text2Width / 2;
      
      doc.text(text1, text1X, y + 7);
      doc.line(text1X, y + 8, text1X + text1Width, y + 8);
      
      doc.text(text2, text2X, y + 7);
      doc.line(text2X, y + 8, text2X + text2Width, y + 8);
    } else if (noBorders) {
      // Check amount row - right aligned description
      doc.setFont("helvetica", "bold");
      const text1Width = doc.getTextWidth(text1);
      doc.text(text1, tableX + col1Width - text1Width - 3, y + 7);
      // Underline the "Check amount:" text
      doc.line(tableX + col1Width - text1Width - 3, y + 8, tableX + col1Width - 3, y + 8);
      
      doc.setTextColor(text2Color);
      if (text2Bold) doc.setFont("helvetica", "bold");
      const text2Width = doc.getTextWidth(text2);
      doc.text(text2, tableX + col1Width + col2Width / 2 - text2Width / 2, y + 7);
    } else {
      doc.setFont("helvetica", "normal");
      // Center text in cells
      const text1Width = doc.getTextWidth(text1);
      const text2Width = doc.getTextWidth(text2);
      doc.text(text1, tableX + col1Width / 2 - text1Width / 2, y + 7);
      
      doc.setTextColor(text2Color);
      if (text2Bold) doc.setFont("helvetica", "bold");
      doc.text(text2, tableX + col1Width + col2Width / 2 - text2Width / 2, y + 7);
    }

    y += rowHeight;
  };

  // Header row
  drawRow("Description", "Amount", GRAY_HEADER_BG, GRAY_HEADER_BG, true);

  // Salary 1% row
  drawRow("Salary 1%", `$${data.salary1Percent.toFixed(2)}`, "#FFFFFF", LIGHT_BLUE_BG);

  // Bonus 5% row
  drawRow("Bonus 5%", `$${data.bonus5Percent.toFixed(2)}`, "#FFFFFF", LIGHT_BLUE_BG);

  // Food allowance row (only if > 0)
  if (data.foodAllowance > 0) {
    drawRow("Food allowance", `$${data.foodAllowance.toFixed(2)}`, "#FFFFFF", LIGHT_BLUE_BG);
  }

  // Extra days row (if applicable - independent)
  if (hasExtraDays) {
    drawRow(
      `Worked additional days (${extraDatesText})`, 
      `$${data.extraDaysAmount.toFixed(2)}`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG
    );
  }

  // PTO row (if any PTO days used) - shows $0.00
  if (hasSickDays) {
    drawRow(
      `Days off ${sickDatesText} used ${sickDayDates.length} of ${totalSickDaysAvailable} PTO days`, 
      `$0.00`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG
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
    
    drawRow(
      daysOffLabel, 
      `-$${daysOffDeduction.toFixed(2)}`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG,
      false,
      BLACK_COLOR  // BLACK, not red
    );
  }

  // Performance bonus row (if applicable)
  if (hasDispatcherBonus) {
    drawRow(
      "Performance Bonus", 
      `$${data.dispatcherBonus!.toFixed(2)}`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG
    );
  }

  // Custom adjustments rows (additions and charges)
  for (const adjustment of adjustments) {
    if (adjustment.type === "addition") {
      drawRow(
        `Extra pay: ${adjustment.reason || "Extra Pay"}`,
        `$${adjustment.amount.toFixed(2)}`,
        "#FFFFFF",
        LIGHT_BLUE_BG
      );
    } else {
      drawRow(
        `Charge: ${adjustment.reason || "Charge"}`,
        `-$${adjustment.amount.toFixed(2)}`,
        "#FFFFFF",
        LIGHT_BLUE_BG,
        false,
        BLACK_COLOR
      );
    }
  }

  // Future month rows for deleted users
  const futureSalary = data.isDeletedUser && data.futureSalary1Percent ? data.futureSalary1Percent : 0;
  const futureBonus = data.isDeletedUser && data.futureBonus5Percent ? data.futureBonus5Percent : 0;
  
  if (data.isDeletedUser && data.futureMonthLabel) {
    // Salary 1% for next month
    if (futureSalary > 0) {
      drawRow(
        `Salary 1% for ${data.futureMonthLabel}`,
        `$${futureSalary.toFixed(2)}`,
        "#FFFFFF",
        LIGHT_BLUE_BG
      );
    }
    
    // Bonus 5% for next month
    if (futureBonus > 0) {
      drawRow(
        `Bonus 5% for ${data.futureMonthLabel}`,
        `$${futureBonus.toFixed(2)}`,
        "#FFFFFF",
        LIGHT_BLUE_BG
      );
    }
  }

  // Recalculate check amount to include future salary/bonus
  const totalCheckAmount = checkAmount + futureSalary + futureBonus;

  // Check amount row
  drawRow(
    "Check amount:", 
    `$${totalCheckAmount.toFixed(2)}`, 
    null, 
    "#FFFFFF", 
    false, 
    RED_COLOR, 
    true, 
    true
  );

  y += 20;

  // Disclaimer
  doc.setFontSize(9);
  doc.setTextColor(RED_COLOR);
  doc.setFont("helvetica", "italic");
  const disclaimer = "***Due to the company policy discussing your salary at work is prohibited. If there are any problems and concerns they need to be discussed with the managers directly.";
  const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - 2 * margin);
  doc.text(splitDisclaimer, margin, y);

  return doc.output("blob");
};

export const downloadPayrollPdf = async (data: PayrollData, filename: string) => {
  const blob = await generatePayrollPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
