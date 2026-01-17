import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

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

export const generatePayrollDocument = async (data: PayrollData): Promise<Blob> => {
  // Determine which template to use based on extra days
  const hasExtraDays = data.extraDays > data.lostDays;
  const templatePath = hasExtraDays 
    ? "/templates/Dispatch_salary_extra_day.docx"
    : "/templates/Dispatch_Sample.docx";

  // Fetch the template
  const response = await fetch(templatePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.statusText}`);
  }
  const templateArrayBuffer = await response.arrayBuffer();
  
  // Load template into PizZip
  const zip = new PizZip(templateArrayBuffer);
  
  // Create docxtemplater instance
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Calculate check amount
  const checkAmount = data.salary1Percent + data.bonus5Percent + data.foodAllowance + 
    (hasExtraDays ? data.extraDaysAmount : 0);

  // Format dates for display
  const extraDatesText = data.extraDayDates.length > 0 
    ? data.extraDayDates.join(", ") 
    : "";
  const lostDatesText = data.lostDayDates.length > 0 
    ? data.lostDayDates.join(", ") 
    : "";

  // Set template data - these placeholders need to match the template
  doc.setData({
    employee_name: data.employeeName,
    pay_period: data.payPeriod,
    salary_1_percent: `$${data.salary1Percent.toFixed(2)}`,
    bonus_5_percent: `$${data.bonus5Percent.toFixed(2)}`,
    food_allowance: data.foodAllowance > 0 ? `$${data.foodAllowance.toFixed(2)}` : "",
    extra_days_amount: hasExtraDays ? `$${data.extraDaysAmount.toFixed(2)}` : "",
    extra_days_dates: extraDatesText,
    lost_days_dates: lostDatesText,
    check_amount: `$${checkAmount.toFixed(2)}`,
  });

  // Render the document
  doc.render();

  // Generate output
  const output = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return output;
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
