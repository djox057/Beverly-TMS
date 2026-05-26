import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { generatePayrollPdf, PayrollAdjustment } from "@/utils/payrollPdfGenerator";
import { toast } from "sonner";

export interface RecruiterStatementData {
  recruiterName: string;
  month: string; // YYYY-MM
  baseSalary: number;
  workDaysInMonth: number;
  perDayRate: number;
  extraDayDates: string[]; // YYYY-MM-DD
  lostDayDates: string[]; // YYYY-MM-DD
  withCardDays: number;
  withoutCardDays: number;
  withCardRate: number;
  withoutCardRate: number;
  foodAllowance: number;
  total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: RecruiterStatementData;
}

const formatMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const toMMDD = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
};

const buildPdf = async (data: RecruiterStatementData, previewOnly: boolean) => {
  const adjustments: PayrollAdjustment[] = [];
  if (data.withCardDays > 0) {
    adjustments.push({
      type: "addition",
      reason: `With Card (${data.withCardDays} × $${data.withCardRate})`,
      amount: data.withCardDays * data.withCardRate,
    });
  }
  if (data.withoutCardDays > 0) {
    adjustments.push({
      type: "addition",
      reason: `Without Card (${data.withoutCardDays} × $${data.withoutCardRate})`,
      amount: data.withoutCardDays * data.withoutCardRate,
    });
  }

  return generatePayrollPdf(
    {
      employeeName: data.recruiterName,
      payPeriod: formatMonth(data.month),
      salary1Percent: data.baseSalary,
      bonus5Percent: 0,
      foodAllowance: data.foodAllowance,
      extraDays: data.extraDayDates.length,
      lostDays: data.lostDayDates.length,
      extraDayDates: data.extraDayDates.map(toMMDD),
      lostDayDates: data.lostDayDates.map(toMMDD),
      extraDaysAmount: data.extraDayDates.length * data.perDayRate,
      perDayRate: data.perDayRate,
      adjustments,
    },
    { previewOnly },
  );
};

export default function RecruiterStatementPreviewDialog({ open, onOpenChange, data }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const blob = await buildPdf(data, true);
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoke = url;
        setPdfUrl(url);
      } catch (err: any) {
        toast.error("Failed to generate preview: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
      setPdfUrl(null);
    };
  }, [open, data]);

  const handleDownload = async () => {
    try {
      const blob = await buildPdf(data, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = data.recruiterName.replace(/\s+/g, "_");
      a.download = `Recruiter_Statement_${safeName}_${data.month}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {data.recruiterName} — {formatMonth(data.month)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded overflow-hidden bg-muted">
          {loading || !pdfUrl ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <iframe src={pdfUrl} title="Recruiter statement preview" className="w-full h-full" />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}