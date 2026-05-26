import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import {
  generateRecruiterStatementPdf,
  RecruiterStatementData,
} from "@/utils/recruiterPdfGenerator";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: RecruiterStatementData;
}

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const formatDayList = (dates: string[]) =>
  dates
    .map((d) => {
      const [, m, day] = d.split("-").map(Number);
      return `${m}/${day}`;
    })
    .join(", ");

export default function RecruiterStatementPreviewDialog({ open, onOpenChange, data }: Props) {
  const extraAmt = data.extraDayDates.length * data.perDayRate;
  const lostAmt = data.lostDayDates.length * data.perDayRate;
  const withCardAmt = data.withCardDays * data.withCardRate;
  const withoutCardAmt = data.withoutCardDays * data.withoutCardRate;

  const handleDownload = () => {
    try {
      const blob = generateRecruiterStatementPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = data.recruiterName.replace(/\s+/g, "_");
      a.download = `Recruiter_Statement_${safeName}_${data.month}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  const Row = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${accent ?? ""}`}>{value}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{data.recruiterName}</DialogTitle>
          <p className="text-xs text-muted-foreground">{formatMonth(data.month)}</p>
        </DialogHeader>

        <div className="space-y-1">
          <Row label="Base Salary" value={fmt$(data.baseSalary)} />
          <Row label="Workdays in month" value={String(data.workDaysInMonth)} />
          <Row label="Per-day rate" value={fmt$(data.perDayRate)} />

          <div className="border-t my-2" />

          <Row
            label={`Extra Days (+${data.extraDayDates.length})`}
            value={`+${fmt$(extraAmt)}`}
            accent="text-green-600"
          />
          {data.extraDayDates.length > 0 && (
            <p className="text-xs text-muted-foreground pl-2">{formatDayList(data.extraDayDates)}</p>
          )}

          <Row
            label={`Days Off (-${data.lostDayDates.length})`}
            value={`-${fmt$(lostAmt)}`}
            accent="text-red-600"
          />
          {data.lostDayDates.length > 0 && (
            <p className="text-xs text-muted-foreground pl-2">{formatDayList(data.lostDayDates)}</p>
          )}

          <div className="border-t my-2" />

          <Row
            label={`With Card (${data.withCardDays} × ${fmt$(data.withCardRate)})`}
            value={fmt$(withCardAmt)}
          />
          <Row
            label={`Without Card (${data.withoutCardDays} × ${fmt$(data.withoutCardRate)})`}
            value={fmt$(withoutCardAmt)}
          />
          <Row label="Food Allowance" value={fmt$(data.foodAllowance)} />

          <div className="border-t my-2" />

          <div className="flex justify-between text-base font-bold pt-1">
            <span>Total</span>
            <span>{fmt$(data.total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownload}>
            <FileDown className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}