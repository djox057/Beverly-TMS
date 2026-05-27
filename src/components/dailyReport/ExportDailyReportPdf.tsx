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

      const headerH = 28;
      const topY = headerH + 8;
      const bottomY = pageH - margin;

      const NUM_COLS = 3;
      const gap = 10;
      const colW = (pageW - margin * 2 - gap * (NUM_COLS - 1)) / NUM_COLS;
      const truckColW = 48;
      const noteColW = colW - truckColW;

      const SECTION_BAR_H = 14;
      const TABLE_HEAD_H = 14;
      const ROW_H = 13;
      const SECTION_GAP = 8;

      const drawPageHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("Beverly Daily Report", pageW / 2, 22, { align: "center" });
        doc.setFontSize(9);
        doc.text(`DATE: ${format(date, "MM/dd/yyyy")}`, pageW - margin, 22, { align: "right" });
      };
      drawPageHeader();

      let col = 0;
      let cursorY = topY;

      const colX = (c: number) => margin + c * (colW + gap);

      // Build sections list
      type Section = { title: string; rows: Entry[] };
      const sections: Section[] = [];
      for (const office of OFFICES) {
        const empty = entries.filter(
          (e) => e.office === office && e.type === "Empty & Late for delivery"
        );
        const home = entries.filter((e) => e.office === office && e.type === "Home");
        if (empty.length) sections.push({ title: `${office} — Empty & Late`, rows: empty });
        if (home.length) sections.push({ title: `${office} — Home`, rows: home });
      }
      const extras: Array<[string, string]> = [
        ["Maintenance", "Maintenance"],
        ["Recoveries", "Recoveries"],
        ["New driver", "New driver"],
      ];
      if (includeAfterhours) extras.push(["After Hours", "Afterhours"]);
      for (const [title, type] of extras) {
        const r = entries.filter((e) => e.type === type);
        if (r.length) sections.push({ title, rows: r });
      }

      const measureNoteLines = (note: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(note || "", noteColW - 4) as string[];
        return Math.max(1, lines.length);
      };

      const sectionHeight = (s: Section) => {
        let h = SECTION_BAR_H + TABLE_HEAD_H;
        for (const r of s.rows) {
          const lines = measureNoteLines(r.note ?? "");
          h += Math.max(ROW_H, lines * 10 + 4);
        }
        return h;
      };

      const renderSection = (s: Section, x: number, y: number) => {
        // Section title bar
        doc.setFillColor(225, 225, 225);
        doc.rect(x, y, colW, SECTION_BAR_H, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(s.title, x + 4, y + 10);
        let yy = y + SECTION_BAR_H;

        // Table head
        doc.setFillColor(195, 195, 195);
        doc.rect(x, yy, colW, TABLE_HEAD_H, "F");
        doc.setFontSize(8);
        doc.text("Truck#", x + 4, yy + 10);
        doc.text("Note", x + truckColW + 4, yy + 10);
        yy += TABLE_HEAD_H;

        doc.setFont("helvetica", "normal");
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);

        for (const r of s.rows) {
          const lines = doc.splitTextToSize(r.note ?? "", noteColW - 4) as string[];
          const rowH = Math.max(ROW_H, lines.length * 10 + 4);
          const fill = r.color ? COLOR_FILL[r.color] : undefined;
          if (fill) {
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.rect(x, yy, colW, rowH, "F");
          }
          // borders
          doc.rect(x, yy, truckColW, rowH);
          doc.rect(x + truckColW, yy, noteColW, rowH);
          doc.setFontSize(8);
          doc.setTextColor(0);
          doc.text(r.truck ?? "", x + truckColW / 2, yy + rowH / 2 + 3, { align: "center" });
          doc.text(lines, x + truckColW + 3, yy + 10);
          yy += rowH;
        }
      };

      // Lay out sections into columns
      for (const s of sections) {
        let h = sectionHeight(s);
        const availableH = bottomY - cursorY;

        // If even an empty column can't fit it, we'll split. Simple split: render rows up to fit, then continue.
        if (h <= availableH) {
          renderSection(s, colX(col), cursorY);
          cursorY += h + SECTION_GAP;
          continue;
        }

        // Doesn't fit; move to next column / page
        col++;
        if (col >= NUM_COLS) {
          doc.addPage();
          drawPageHeader();
          col = 0;
        }
        cursorY = topY;
        const availH2 = bottomY - cursorY;

        if (h <= availH2) {
          renderSection(s, colX(col), cursorY);
          cursorY += h + SECTION_GAP;
          continue;
        }

        // Still too tall — split rows across columns
        let remaining = [...s.rows];
        let titleSuffix = 0;
        while (remaining.length) {
          const availH = bottomY - cursorY;
          let used = SECTION_BAR_H + TABLE_HEAD_H;
          let count = 0;
          for (const r of remaining) {
            const lines = measureNoteLines(r.note ?? "");
            const rh = Math.max(ROW_H, lines * 10 + 4);
            if (used + rh > availH) break;
            used += rh;
            count++;
          }
          if (count === 0) {
            // Move to next col/page
            col++;
            if (col >= NUM_COLS) {
              doc.addPage();
              drawPageHeader();
              col = 0;
            }
            cursorY = topY;
            continue;
          }
          const part: Section = {
            title: titleSuffix === 0 ? s.title : `${s.title} (cont.)`,
            rows: remaining.slice(0, count),
          };
          renderSection(part, colX(col), cursorY);
          cursorY += sectionHeight(part) + SECTION_GAP;
          remaining = remaining.slice(count);
          titleSuffix++;
        }
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