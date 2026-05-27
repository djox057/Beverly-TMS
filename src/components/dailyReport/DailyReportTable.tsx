import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

export interface DailyReportColumn {
  key: string;
  label: string;
  width: string; // e.g. "120px" or "1fr"
}

export interface DailyReportTableProps {
  title?: string;
  columns: DailyReportColumn[];
  initialRows?: number;
  className?: string;
  /** Date for which entries are stored */
  date: Date;
  /** Entry type label, e.g. "Home", "Empty & Late for delivery", "Maintenance" */
  type: string;
  /** Office name, if applicable (null for global tabs like Maintenance) */
  office?: string | null;
}

type Row = Record<string, string> & { __id: string; __persisted?: boolean };

const makeRow = (columns: DailyReportColumn[], id?: string): Row => {
  const r: any = { __id: id ?? crypto.randomUUID() };
  for (const c of columns) r[c.key] = "";
  return r as Row;
};

export const DailyReportTable = ({
  title,
  columns,
  initialRows = 10,
  className,
  date,
  type,
  office = null,
}: DailyReportTableProps) => {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialRows }, () => makeRow(columns))
  );
  const savedSnapshotRef = useRef<Record<string, string>>({});

  const dateStr = format(date, "yyyy-MM-dd");

  // Load entries for current date/type/office
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let q = supabase
        .from("daily_report_entries")
        .select("*")
        .eq("date", dateStr)
        .eq("type", type);
      if (office === null) q = q.is("office", null);
      else q = q.eq("office", office);

      const { data, error } = await q.order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("daily_report load", error);
        return;
      }
      const loaded: Row[] = (data ?? []).map((d: any) => {
        const r: any = { __id: d.id, __persisted: true };
        for (const c of columns) r[c.key] = (d as any)[c.key] ?? "";
        savedSnapshotRef.current[d.id] = JSON.stringify(
          Object.fromEntries(columns.map((c) => [c.key, (d as any)[c.key] ?? ""]))
        );
        return r as Row;
      });
      // Pad with empty rows up to initialRows
      const padCount = Math.max(0, initialRows - loaded.length);
      const padded = [
        ...loaded,
        ...Array.from({ length: padCount }, () => makeRow(columns)),
      ];
      setRows(padded);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, type, office]);

  const updateCell = (id: string, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.__id === id ? { ...r, [key]: value } : r))
    );
  };

  const isRowEmpty = (r: Row) => columns.every((c) => !((r[c.key] ?? "").trim()));

  const persistRow = async (id: string) => {
    const row = rows.find((r) => r.__id === id);
    if (!row) return;
    const payload: Record<string, any> = {
      date: dateStr,
      type,
      office,
    };
    for (const c of columns) payload[c.key] = (row[c.key] ?? "").trim() || null;

    const snapshotKey = JSON.stringify(
      Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? ""]))
    );

    if (row.__persisted) {
      // unchanged?
      if (savedSnapshotRef.current[id] === snapshotKey) return;
      // If now empty, delete
      if (isRowEmpty(row)) {
        const { error } = await supabase
          .from("daily_report_entries")
          .delete()
          .eq("id", id);
        if (error) {
          toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
          return;
        }
        delete savedSnapshotRef.current[id];
        setRows((prev) =>
          prev.map((r) => (r.__id === id ? { ...makeRow(columns), __id: id } : r))
        );
        return;
      }
      const { error } = await supabase
        .from("daily_report_entries")
        .update(payload)
        .eq("id", id);
      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        return;
      }
      savedSnapshotRef.current[id] = snapshotKey;
    } else {
      if (isRowEmpty(row)) return;
      const { data, error } = await supabase
        .from("daily_report_entries")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        toast({ title: "Failed to save", description: error?.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      savedSnapshotRef.current[(data as any).id] = snapshotKey;
      setRows((prev) =>
        prev.map((r) =>
          r.__id === id ? { ...r, __id: (data as any).id, __persisted: true } : r
        )
      );
    }
  };

  const addRow = () => setRows((prev) => [...prev, makeRow(columns)]);
  const deleteRow = async (id: string) => {
    const row = rows.find((r) => r.__id === id);
    if (row?.__persisted) {
      const { error } = await supabase
        .from("daily_report_entries")
        .delete()
        .eq("id", id);
      if (error) {
        toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
        return;
      }
      delete savedSnapshotRef.current[id];
    }
    setRows((prev) => prev.filter((r) => r.__id !== id));
  };

  const gridTemplate = `${columns.map((c) => c.width).join(" ")} 32px`;

  return (
    <div className={cn("border border-border rounded-md overflow-hidden bg-card", className)}>
      {title && (
        <div className="px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wide text-foreground border-b border-border">
          {title}
        </div>
      )}
      <div
        className="grid bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => (
          <div key={c.key} className="px-2 py-1.5 border-r border-border last:border-r-0">
            {c.label}
          </div>
        ))}
        <div />
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.__id}
            className="grid group hover:bg-muted/30"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((c) => (
              <div key={c.key} className="border-r border-border last:border-r-0 overflow-hidden">
                <Input
                  value={row[c.key] ?? ""}
                  onChange={(e) => updateCell(row.__id, c.key, e.target.value)}
                  onBlur={() => persistRow(row.__id)}
                  className="h-8 border-0 rounded-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/30"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => deleteRow(row.__id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex items-center justify-center transition-opacity"
              aria-label="Delete row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="px-2 py-1.5 border-t border-border bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          className="h-7 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add row
        </Button>
      </div>
    </div>
  );
};