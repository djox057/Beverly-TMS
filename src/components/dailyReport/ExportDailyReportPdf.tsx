import { useState } from "react";
import { FileDown } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const OFFICES = ["CACAK", "KRAGUJEVAC", "BG 1st FLOOR", "BG 4th FLOOR"] as const;

// Match on-screen color mapping (R,G,B for PDF fill).
const COLOR_FILL: Record<string, [number, number, number]> = {
  orange: [251, 146, 60],
  cyan: [34, 211, 238],
  yellow: [253, 224, 71],
  red: [239, 68, 68],
  green: [34, 197, 94],
};

interface Entry {
  id: string;
  type: string;
  office: string | null;
  truck: string | null;
  note: string | null;
  color: string | null;
  created_at: string;
}

export const ExportDailyReportPdf = ({ date }: { date: Date }) => {
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchEntries = async (): Promise<Entry[]> => {
    const dateStr = format(date, "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("daily_report_entries")
      .select("id, type, office, truck, note, color, created_at")
      .eq("date", dateStr)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Entry[];
  };

  const generate = async (includeAfterhours: boolean) => {
    setBusy(true);
    try {
      const entries = await fetchEntries();

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 24;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Beverly Daily Report", pageW / 2, 30, { align: "center" });
      doc.setFontSize(10);
      doc.text(`DATE: ${format(date, "MM/dd/yyyy")}`, pageW - margin, 30, { align: "right" });

      let cursorY = 50;

      const drawSection = (
        title: string,
        rows: Entry[],
        opts: { columns?: 1 | 2 } = { columns: 2 }
      ) => {
        if (rows.length === 0) return;
        if (cursorY > pageH - 80) {
          doc.addPage();
          cursorY = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, cursorY, pageW - margin * 2, 16, "F");
        doc.setTextColor(0);
        doc.text(title, margin + 6, cursorY + 12);
        cursorY += 18;

        const body = rows.map((r) => [r.truck ?? "", r.note ?? ""]);
        autoTable(doc, {
          startY: cursorY,
          margin: { left: margin, right: margin },
          head: [["Truck#", "Note"]],
          body,
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak", lineColor: [180, 180, 180], lineWidth: 0.5 },
          headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 60, halign: "center" },
            1: { cellWidth: "auto" },
          },
          didParseCell: (data) => {
            if (data.section !== "body") return;
            const row = rows[data.row.index];
            const fill = row?.color ? COLOR_FILL[row.color] : undefined;
            if (fill) data.cell.styles.fillColor = fill;
          },
        });
        // @ts-ignore - lastAutoTable is added by plugin
        cursorY = (doc as any).lastAutoTable.finalY + 12;
      };

      // Offices: Empty & Late + Home for each
      for (const office of OFFICES) {
        const empty = entries.filter(
          (e) => e.office === office && e.type === "Empty & Late for delivery"
        );
        const home = entries.filter((e) => e.office === office && e.type === "Home");
        drawSection(`${office} — Empty & Late for delivery`, empty);
        drawSection(`${office} — Home`, home);
      }

      drawSection(
        "Maintenance",
        entries.filter((e) => e.type === "Maintenance")
      );
      drawSection(
        "Recoveries",
        entries.filter((e) => e.type === "Recoveries")
      );
      drawSection(
        "New driver",
        entries.filter((e) => e.type === "New driver")
      );
      if (includeAfterhours) {
        drawSection(
          "After Hours",
          entries.filter((e) => e.type === "Afterhours")
        );
      }

      doc.save(`Beverly_Daily_Report_${format(date, "yyyy-MM-dd")}.pdf`);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to export PDF", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setBusy(false);
      setAskOpen(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setAskOpen(true)}
        className="fixed bottom-6 right-6 z-50 shadow-lg gap-2"
        size="lg"
      >
        <FileDown className="h-4 w-4" />
        Export PDF
      </Button>
      <AlertDialog open={askOpen} onOpenChange={setAskOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Include Afterhours rows?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to include the Afterhours section in the exported PDF for{" "}
              {format(date, "MM/dd/yyyy")}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={busy} onClick={() => generate(false)}>
              No, exclude
            </Button>
            <AlertDialogAction disabled={busy} onClick={() => generate(true)}>
              Yes, include
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ExportDailyReportPdf;