import { useState } from "react";
import { FileDown } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
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
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
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

      const headerH = 26;
      const topY = headerH + 6;
      const bottomY = pageH - margin;

      const SECTION_BAR_H = 13;
      const TABLE_HEAD_H = 12;

      const drawPageHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(0);
        doc.text("Beverly Daily Report", pageW / 2, 20, { align: "center" });
        doc.setFontSize(9);
        doc.text(`DATE: ${format(date, "MM/dd/yyyy")}`, pageW - margin, 20, { align: "right" });
      };

      // Render a single section (title + table) inside the given box. Rows
      // shrink-to-fit: row height is derived from box height so 15+ rows
      // still fit cleanly within their cell.
      const renderSection = (
        title: string,
        rows: Entry[],
        x: number,
        y: number,
        w: number,
        h: number
      ) => {
        const truckColW = Math.min(56, Math.max(40, w * 0.22));
        const noteColW = w - truckColW;

        // Title bar
        doc.setFillColor(60, 60, 60);
        doc.rect(x, y, w, SECTION_BAR_H, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255);
        doc.text(title, x + 4, y + 9);

        // Table head
        const headY = y + SECTION_BAR_H;
        doc.setFillColor(220, 220, 220);
        doc.rect(x, headY, w, TABLE_HEAD_H, "F");
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text("Truck#", x + 4, headY + 8.5);
        doc.text("Note", x + truckColW + 4, headY + 8.5);

        // Body
        const bodyTop = headY + TABLE_HEAD_H;
        const bodyH = h - SECTION_BAR_H - TABLE_HEAD_H;
        const rowCount = Math.max(rows.length, 1);
        // Cap row height so very short lists don't have huge empty rows
        const rowH = Math.min(16, Math.max(10, bodyH / Math.max(rowCount, 1)));
        const visibleRows = Math.min(rows.length, Math.floor(bodyH / rowH));

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.setFont("helvetica", "normal");

        let yy = bodyTop;
        for (let i = 0; i < visibleRows; i++) {
          const r = rows[i];
          const fill = r.color ? COLOR_FILL[r.color] : undefined;
          if (fill) {
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.rect(x, yy, w, rowH, "F");
          }
          // cell borders
          doc.rect(x, yy, truckColW, rowH);
          doc.rect(x + truckColW, yy, noteColW, rowH);

          // Truck number
          doc.setFontSize(rowH >= 13 ? 8.5 : 7.5);
          doc.setTextColor(0);
          doc.text(r.truck ?? "", x + truckColW / 2, yy + rowH / 2 + 2.5, { align: "center" });

          // Note (truncate to fit width, single line within the row)
          doc.setFontSize(rowH >= 13 ? 8 : 7);
          const noteText = (r.note ?? "").replace(/\s+/g, " ").trim();
          const fitted = (doc.splitTextToSize(noteText, noteColW - 6) as string[])[0] ?? "";
          doc.text(fitted, x + truckColW + 3, yy + rowH / 2 + 2.5);

          yy += rowH;
        }

        // If we had to clip rows, show a small "+N more" indicator
        if (visibleRows < rows.length) {
          const extra = rows.length - visibleRows;
          doc.setFontSize(7);
          doc.setTextColor(80);
          doc.text(`+${extra} more…`, x + w - 4, y + h - 3, { align: "right" });
        }

        // Outer border around the section
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.5);
        doc.rect(x, y, w, h);
      };

      const get = (type: string, office: string | null) =>
        entries.filter((e) => e.type === type && (e.office ?? null) === office);

      // === Page 1: 4 offices × (Empty&Late / Home) — 4 cols × 2 rows ===
      drawPageHeader();
      {
        const cols = OFFICES.length;
        const gap = 6;
        const colW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
        const rowGap = 8;
        const availH = bottomY - topY;
        const rowH = (availH - rowGap) / 2;

        OFFICES.forEach((office, idx) => {
          const x = margin + idx * (colW + gap);
          renderSection(
            `${office} — Empty & Late`,
            get("Empty & Late for delivery", office),
            x,
            topY,
            colW,
            rowH
          );
          renderSection(
            `${office} — Home`,
            get("Home", office),
            x,
            topY + rowH + rowGap,
            colW,
            rowH
          );
        });
      }

      // === Page 2: 2 × 2 — Maintenance / After Hours | New driver / Recoveries ===
      doc.addPage();
      drawPageHeader();
      {
        const cols = 2;
        const gap = 10;
        const colW = (pageW - margin * 2 - gap) / cols;
        const rowGap = 10;
        const availH = bottomY - topY;
        const rowH = (availH - rowGap) / 2;

        // Left column
        renderSection("Maintenance", get("Maintenance", null), margin, topY, colW, rowH);
        renderSection(
          "After Hours",
          includeAfterhours ? get("Afterhours", null) : [],
          margin,
          topY + rowH + rowGap,
          colW,
          rowH
        );

        // Right column
        const rightX = margin + colW + gap;
        renderSection("New Drivers", get("New driver", null), rightX, topY, colW, rowH);
        renderSection(
          "Recoveries",
          get("Recoveries", null),
          rightX,
          topY + rowH + rowGap,
          colW,
          rowH
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