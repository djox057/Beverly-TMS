import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

type Row = Record<string, string> & { __id: string };

const makeRow = (columns: DailyReportColumn[]): Row => {
  const r: any = { __id: crypto.randomUUID() };
  for (const c of columns) r[c.key] = "";
  return r as Row;
};

export const DailyReportTable = ({
  title,
  columns,
  initialRows = 10,
  className,
}: DailyReportTableProps) => {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialRows }, () => makeRow(columns))
  );

  const updateCell = (id: string, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.__id === id ? { ...r, [key]: value } : r))
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeRow(columns)]);
  const deleteRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.__id !== id));

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