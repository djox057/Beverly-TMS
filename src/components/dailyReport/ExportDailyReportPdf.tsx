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
  home_date: string | null;
}

export const ExportDailyReportPdf = ({ date }: { date: Date }) => {
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchEntries = async (): Promise<Entry[]> => {
    const dateStr = format(date, "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("daily_report_entries")
        .select("id, type, office, truck, note, color, created_at, home_date")
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

      // Render a single section (title + table) inside the given box. Notes
      // wrap onto multiple lines; row heights are computed per-row. If the
      // overall content exceeds the available height, lines per row are
      // progressively capped until everything fits.
      const renderSection = (
        title: string,
        rows: Entry[],
        x: number,
        y: number,
        w: number,
        h: number,
        showDate = false
      ) => {
        const numColW = 16;
        const truckColW = Math.min(45, Math.max(32, w * 0.18));
        const dateColW = showDate ? 48 : 0;
        const noteColW = w - numColW - truckColW - dateColW;

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
        doc.text("#", x + numColW / 2, headY + 8.5, { align: "center" });
        doc.text("Truck#", x + numColW + 4, headY + 8.5);
        if (showDate) {
          doc.text("Date", x + numColW + truckColW + 3, headY + 8.5);
          doc.text("Note", x + numColW + truckColW + dateColW + 4, headY + 8.5);
        } else {
          doc.text("Note", x + numColW + truckColW + 4, headY + 8.5);
        }

        // Body
        const bodyTop = headY + TABLE_HEAD_H;
        const bodyH = h - SECTION_BAR_H - TABLE_HEAD_H;

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.setFont("helvetica", "normal");

        // Compute wrapped note lines per row, then derive row heights.
        // Try maxLines = 4, shrink down until everything fits in bodyH.
        const noteFontSize = 8;
        const lineH = 9; // per-line vertical space in pt
        const vPad = 4;  // total vertical padding inside a row
        const minRowH = 10;

        doc.setFontSize(noteFontSize);
        const wrappedAll: string[][] = rows.map((r) => {
          const noteText = (r.note ?? "").replace(/\s+/g, " ").trim();
          return doc.splitTextToSize(noteText, noteColW - 6) as string[];
        });

        let maxLines = 4;
        let visibleRows = rows.length;
        let rowHeights: number[] = [];
        while (maxLines >= 1) {
          rowHeights = wrappedAll.map((lines) => {
            const used = Math.min(lines.length || 1, maxLines);
            return Math.max(minRowH, used * lineH + vPad);
          });
          // Determine how many rows fit
          let total = 0;
          visibleRows = 0;
          for (let i = 0; i < rowHeights.length; i++) {
            if (total + rowHeights[i] > bodyH) break;
            total += rowHeights[i];
            visibleRows++;
          }
          if (visibleRows === rows.length) break;
          maxLines--;
        }
        if (maxLines < 1) maxLines = 1;

        let yy = bodyTop;
        for (let i = 0; i < visibleRows; i++) {
          const r = rows[i];
          const rowH = rowHeights[i];
          const fill = r.color ? COLOR_FILL[r.color] : undefined;
          if (fill) {
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.rect(x, yy, w, rowH, "F");
          }
          // cell borders
          doc.rect(x, yy, numColW, rowH);
          doc.rect(x + numColW, yy, truckColW, rowH);
          if (showDate) {
            doc.rect(x + numColW + truckColW, yy, dateColW, rowH);
            doc.rect(x + numColW + truckColW + dateColW, yy, noteColW, rowH);
          } else {
            doc.rect(x + numColW + truckColW, yy, noteColW, rowH);
          }

          // Row number
          doc.setFontSize(7.5);
          doc.setTextColor(90);
          doc.text(String(i + 1), x + numColW / 2, yy + rowH / 2 + 2.5, { align: "center" });

          // Truck number
          doc.setFontSize(8.5);
          doc.setTextColor(0);
          doc.text(r.truck ?? "", x + numColW + truckColW / 2, yy + rowH / 2 + 2.5, { align: "center" });

          // Date (Home only)
          if (showDate) {
            doc.setFontSize(8);
            doc.text(
              r.home_date ?? "",
              x + numColW + truckColW + dateColW / 2,
              yy + rowH / 2 + 2.5,
              { align: "center" }
            );
          }

          // Note (wrapped, top-aligned within the row)
          doc.setFontSize(noteFontSize);
          const lines = wrappedAll[i].slice(0, maxLines);
          const noteX = x + numColW + truckColW + dateColW + 3;
          for (let li = 0; li < lines.length; li++) {
            doc.text(lines[li], noteX, yy + vPad / 2 + 6 + li * lineH);
          }

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

      // Helper: render a single-office page (Empty & Late on top, Home below)
      const renderOfficePage = (office: string) => {
        drawPageHeader();
        const rowGap = 10;
        const availH = bottomY - topY;
        const rowH = (availH - rowGap) / 2;
        const w = pageW - margin * 2;

        renderSection(
          `${office} — Empty & Late`,
          get("Empty & Late for delivery", office),
          margin,
          topY,
          w,
          rowH
        );
        renderSection(
          `${office} — Home`,
          get("Home", office),
          margin,
          topY + rowH + rowGap,
          w,
          rowH,
          true
        );
      };

      // === One page per office ===
      OFFICES.forEach((office, idx) => {
        if (idx > 0) doc.addPage();
        renderOfficePage(office);
      });

      // === Final page: Others ===
      doc.addPage();
      drawPageHeader();
      {
        const gap = 10;
        const rowGap = 10;
        const availH = bottomY - topY;
        const rowH = (availH - rowGap) / 2;

        // Row 1 — always 2 columns
        const topCols = 2;
        const topColW = (pageW - margin * 2 - gap * (topCols - 1)) / topCols;
        renderSection("Maintenance", get("Maintenance", null), margin, topY, topColW, rowH);
        renderSection(
          "New Drivers",
          get("New driver", null),
          margin + topColW + gap,
          topY,
          topColW,
          rowH
        );

        // Row 2 — 3 cols if afterhours included, otherwise 2 (no afterhours table at all)
        const bottomY2 = topY + rowH + rowGap;
        if (includeAfterhours) {
          const botCols = 3;
          const botColW = (pageW - margin * 2 - gap * (botCols - 1)) / botCols;
          renderSection("After Hours", get("Afterhours", null), margin, bottomY2, botColW, rowH);
          renderSection(
            "Recoveries",
            get("Recoveries", null),
            margin + (botColW + gap),
            bottomY2,
            botColW,
            rowH
          );
          renderSection(
            "Safety",
            get("Safety", null),
            margin + (botColW + gap) * 2,
            bottomY2,
            botColW,
            rowH
          );
        } else {
          const botCols = 2;
          const botColW = (pageW - margin * 2 - gap * (botCols - 1)) / botCols;
          renderSection("Recoveries", get("Recoveries", null), margin, bottomY2, botColW, rowH);
          renderSection(
            "Safety",
            get("Safety", null),
            margin + botColW + gap,
            bottomY2,
            botColW,
            rowH
          );
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