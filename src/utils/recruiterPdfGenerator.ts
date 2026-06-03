import jsPDF from "jspdf";

export interface RecruiterStatementData {
  recruiterName: string;
  month: string; // YYYY-MM
  baseSalary: number;
  workDaysInMonth: number;
  perDayRate: number;
  extraDayDates: string[];
  lostDayDates: string[];
  withCardDays: number;
  withoutCardDays: number;
  withCardRate: number;
  withoutCardRate: number;
  foodAllowance: number;
  total: number;
}

const formatMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generateRecruiterStatementPdf = (data: RecruiterStatementData): Blob => {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 60;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Recruiter Salary Statement", pageW / 2, y, { align: "center" });
  y += 24;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(data.recruiterName, pageW / 2, y, { align: "center" });
  y += 16;
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(formatMonth(data.month), pageW / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 30;

  const left = 60;
  const right = pageW - 60;

  const row = (label: string, value: string, opts: { bold?: boolean; color?: [number, number, number] } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    if (opts.color) doc.setTextColor(...opts.color);
    doc.text(label, left, y);
    doc.text(value, right, y, { align: "right" });
    doc.setTextColor(0);
    y += 18;
  };

  const divider = () => {
    doc.setDrawColor(200);
    doc.line(left, y, right, y);
    y += 14;
  };

  doc.setFontSize(11);
  row("Base Salary", fmt$(data.baseSalary));
  row(`Workdays in month`, String(data.workDaysInMonth));
  row("Per-day rate", fmt$(data.perDayRate));
  divider();

  const extraAmt = data.extraDayDates.length * data.perDayRate;
  row(
    `Extra Days (+${data.extraDayDates.length})`,
    `+${fmt$(extraAmt)}`,
    { color: [0, 128, 0] },
  );
  if (data.extraDayDates.length) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    const days = data.extraDayDates.map((d) => {
      const [, m, day] = d.split("-").map(Number);
      return `${m}/${day}`;
    }).join(", ");
    doc.text(days, left + 12, y);
    y += 14;
    doc.setFontSize(11);
    doc.setTextColor(0);
  }

  const lostAmt = data.lostDayDates.length * data.perDayRate;
  row(
    `Days Off (-${data.lostDayDates.length})`,
    `-${fmt$(lostAmt)}`,
    { color: [200, 0, 0] },
  );
  if (data.lostDayDates.length) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    const days = data.lostDayDates.map((d) => {
      const [, m, day] = d.split("-").map(Number);
      return `${m}/${day}`;
    }).join(", ");
    doc.text(days, left + 12, y);
    y += 14;
    doc.setFontSize(11);
    doc.setTextColor(0);
  }
  divider();

  const withCardAmt = data.withCardDays * data.withCardRate;
  row(`With Card (${data.withCardDays} × ${fmt$(data.withCardRate)})`, fmt$(withCardAmt));
  const withoutCardAmt = data.withoutCardDays * data.withoutCardRate;
  row(
    `Without Card (${data.withoutCardDays} × ${fmt$(data.withoutCardRate)})`,
    fmt$(withoutCardAmt),
  );
  divider();

  y += 6;
  doc.setFontSize(14);
  row("Total", fmt$(data.total), { bold: true });

  return doc.output("blob");
};