import jsPDF from "jspdf";

// Export the adjustment type for use in other components
export interface PayrollAdjustment {
  type: "addition" | "charge" | "penalty";
  reason: string;
  amount: number;
  // Only used when type === "penalty". When false, the penalty is shown as a
  // warning only and does NOT deduct from the check amount.
  applied?: boolean;
  // When set, `amount` is dynamic: it must be recomputed by the caller as
  // (current base) * percent / 100 before being passed in. Base = salary1Percent
  // (gross*0.01) + bonus5Percent (comm*0.05). When undefined, `amount` is a
  // frozen dollar value entered directly by the user.
  percent?: number;
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
  usedPtoDaysYearly?: number; // Total PTO days used this year (cumulative)
  isDeletedUser?: boolean; // If true, add future month salary/bonus rows
  futureMonthLabel?: string; // e.g., "February" for the next month
  futureSalary1Percent?: number; // Salary 1% for next month
  futureBonus5Percent?: number; // Bonus 5% for next month
  office?: string; // Dispatcher's office for conditional logic
}

interface GeneratePayrollPdfOptions {
  previewOnly?: boolean;
}

const BLACK_COLOR = "#000000";
const LINE_COLOR = "#2596BE";
const RED_COLOR = "#FF0000";
const LIGHT_BLUE_BG = "#DCE6F1";
const GRAY_HEADER_BG = "#C0C0C0";

export const generatePayrollPdf = async (
  data: PayrollData,
  options: GeneratePayrollPdfOptions = {}
): Promise<Blob> => {
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
  const totalAppliedPenalties = adjustments
    .filter(a => a.type === "penalty" && a.applied === true)
    .reduce((sum, a) => sum + a.amount, 0);
  
  // Calculate amounts
  const perDayRate = data.perDayRate ?? 0;
  const extraDaysAdd = hasExtraDays ? data.extraDaysAmount : 0;
  const daysOffDeduction = nonSickDaysOff * perDayRate;
  
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance +
    extraDaysAdd - daysOffDeduction + (data.dispatcherBonus ?? 0) +
    totalAdditions - totalCharges - totalAppliedPenalties;

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

  // Helper to draw a table row with auto-wrapping for long text
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
    // Measure text to determine if wrapping is needed
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const maxText1Width = col1Width - 6; // 3mm padding each side
    const maxText2Width = col2Width - 6;
    
    const text1Lines = doc.splitTextToSize(text1, maxText1Width) as string[];
    
    doc.setFont("helvetica", text2Bold ? "bold" : "normal");
    const text2Lines = doc.splitTextToSize(text2, maxText2Width) as string[];
    
    const maxLines = Math.max(text1Lines.length, text2Lines.length);
    const lineHeight = 5; // mm per line of text
    const currentRowHeight = Math.max(rowHeight, maxLines * lineHeight + 4); // 2mm padding top+bottom

    // Draw cell backgrounds
    if (bgColor1) {
      doc.setFillColor(bgColor1);
      doc.rect(tableX, y, col1Width, currentRowHeight, "F");
    }
    if (bgColor2) {
      doc.setFillColor(bgColor2);
      doc.rect(tableX + col1Width, y, col2Width, currentRowHeight, "F");
    }

    // Draw borders
    if (!noBorders) {
      doc.setDrawColor("#000000");
      doc.setLineWidth(0.2);
      doc.rect(tableX, y, col1Width, currentRowHeight);
      doc.rect(tableX + col1Width, y, col2Width, currentRowHeight);
    } else {
      doc.setDrawColor("#000000");
      doc.setLineWidth(0.2);
      doc.rect(tableX + col1Width, y, col2Width, currentRowHeight);
    }

    // Draw text
    doc.setFontSize(12);
    doc.setTextColor(BLACK_COLOR);
    
    const textYBase = y + (currentRowHeight - maxLines * lineHeight) / 2 + lineHeight - 0.5;
    
    if (isHeader) {
      doc.setFont("helvetica", "normal");
      const text1Width = doc.getTextWidth(text1);
      const text2Width = doc.getTextWidth(text2);
      const text1X = tableX + col1Width / 2 - text1Width / 2;
      const text2X = tableX + col1Width + col2Width / 2 - text2Width / 2;
      
      doc.text(text1, text1X, y + 7);
      doc.line(text1X, y + 8, text1X + text1Width, y + 8);
      
      doc.text(text2, text2X, y + 7);
      doc.line(text2X, y + 8, text2X + text2Width, y + 8);
    } else if (noBorders) {
      doc.setFont("helvetica", "bold");
      const text1Width = doc.getTextWidth(text1);
      doc.text(text1, tableX + col1Width - text1Width - 3, textYBase);
      doc.line(tableX + col1Width - text1Width - 3, textYBase + 1, tableX + col1Width - 3, textYBase + 1);
      
      doc.setTextColor(text2Color);
      if (text2Bold) doc.setFont("helvetica", "bold");
      const text2Width = doc.getTextWidth(text2);
      doc.text(text2, tableX + col1Width + col2Width / 2 - text2Width / 2, textYBase);
    } else {
      // Multi-line centered text for col1
      doc.setFont("helvetica", "normal");
      for (let i = 0; i < text1Lines.length; i++) {
        const lw = doc.getTextWidth(text1Lines[i]);
        doc.text(text1Lines[i], tableX + col1Width / 2 - lw / 2, textYBase + i * lineHeight);
      }
      
      // Col2 text (usually single line, centered vertically)
      doc.setTextColor(text2Color);
      if (text2Bold) doc.setFont("helvetica", "bold");
      for (let i = 0; i < text2Lines.length; i++) {
        const lw = doc.getTextWidth(text2Lines[i]);
        doc.text(text2Lines[i], tableX + col1Width + col2Width / 2 - lw / 2, textYBase + i * lineHeight);
      }
    }

    y += currentRowHeight;
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
  // Special case: split out 1/10 for January 2026 as "Help moving to new office" (Kragujevac only)
  const isJan2026 = data.payPeriod.toLowerCase().includes("january") && data.payPeriod.includes("2026");
  const isKragujevac = data.office === "KRAGUJEVAC";
  const movingDayDates = isJan2026 && isKragujevac ? data.extraDayDates.filter(d => d === "1/10") : [];
  const regularExtraDayDates = isJan2026 && isKragujevac ? data.extraDayDates.filter(d => d !== "1/10") : data.extraDayDates;
  const perDayRateForExtra = data.extraDayDates.length > 0 ? data.extraDaysAmount / data.extraDayDates.length : 0;

  if (movingDayDates.length > 0) {
    drawRow(
      `Help moving to new office (${movingDayDates.join(", ")})`, 
      `$${(perDayRateForExtra * movingDayDates.length).toFixed(2)}`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG
    );
  }
  if (regularExtraDayDates.length > 0) {
    drawRow(
      `Worked additional days (${regularExtraDayDates.join(", ")})`, 
      `$${(perDayRateForExtra * regularExtraDayDates.length).toFixed(2)}`, 
      "#FFFFFF", 
      LIGHT_BLUE_BG
    );
  }

  // PTO row (if any PTO days used) - shows $0.00
  if (hasSickDays) {
    const yearlyPtoUsed = data.usedPtoDaysYearly ?? sickDayDates.length;
    drawRow(
      `Days off ${sickDatesText} used ${yearlyPtoUsed} of ${totalSickDaysAvailable} PTO days`, 
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
    } else if (adjustment.type === "charge") {
      drawRow(
        `Charge: ${adjustment.reason || "Charge"}`,
        `-$${adjustment.amount.toFixed(2)}`,
        "#FFFFFF",
        LIGHT_BLUE_BG,
        false,
        BLACK_COLOR
      );
    } else if (adjustment.type === "penalty") {
      if (adjustment.applied) {
        drawRow(
          `Penalty: ${adjustment.reason || "Penalty"}`,
          `-$${adjustment.amount.toFixed(2)}`,
          "#FFFFFF",
          LIGHT_BLUE_BG,
          false,
          BLACK_COLOR
        );
      } else {
        const warningText = adjustment.amount > 0
          ? `Warning: ${adjustment.reason || "Penalty"}. If this happens again, penalty will be $${adjustment.amount.toFixed(2)}.`
          : `Warning: ${adjustment.reason || "Penalty"}`;
        drawRow(
          warningText,
          `$0.00`,
          "#FFFFFF",
          LIGHT_BLUE_BG
        );
      }
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

  if (options.previewOnly) {
    y += splitDisclaimer.length * 4 + 6;
    doc.setFontSize(12);
    doc.setTextColor(RED_COLOR);
    doc.setFont("helvetica", "bolditalic");
    const previewNotice =
      "***This is NOT an official payroll statement. Changes may still be made. The only official statement is the one sent to you via email from statements@beverlyfreight.net.";
    const splitPreviewNotice = doc.splitTextToSize(previewNotice, pageWidth - 2 * margin);
    doc.text(splitPreviewNotice, margin, y);
  }

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
