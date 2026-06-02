import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Info, PaintBucket, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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

// Row color palette (value stored in DB as `color`, label shown to user)
export const ROW_COLORS: { value: string; label: string; bg: string; swatch: string }[] = [
  { value: "orange", label: "Late", bg: "bg-orange-400/80 dark:bg-orange-500/70", swatch: "bg-orange-400" },
  { value: "cyan", label: "No load", bg: "bg-cyan-400/80 dark:bg-cyan-500/70", swatch: "bg-cyan-400" },
  { value: "yellow", label: "Problem", bg: "bg-yellow-300/90 dark:bg-yellow-400/70", swatch: "bg-yellow-400" },
  { value: "red", label: "Recovery", bg: "bg-red-500/80 dark:bg-red-600/70", swatch: "bg-red-500" },
  { value: "green", label: "Resolved", bg: "bg-green-500/80 dark:bg-green-600/70", swatch: "bg-green-500" },
];
const colorBg = (c?: string | null) => ROW_COLORS.find((x) => x.value === c)?.bg ?? "";

// Shared, lightweight cache of active truck numbers (refreshed on demand)
let activeTruckNumbersCache: string[] | null = null;
let activeTruckNumbersPromise: Promise<string[]> | null = null;
const loadActiveTruckNumbers = async (): Promise<string[]> => {
  if (activeTruckNumbersCache) return activeTruckNumbersCache;
  if (activeTruckNumbersPromise) return activeTruckNumbersPromise;
  activeTruckNumbersPromise = (async () => {
    const { data, error } = await supabase
      .from("trucks")
      .select("truck_number")
      .eq("is_active", true)
      .order("truck_number");
    if (error) {
      console.error("active trucks load", error);
      return [];
    }
    const nums = (data ?? [])
      .map((t: any) => String(t.truck_number ?? "").trim())
      .filter(Boolean);
    activeTruckNumbersCache = nums;
    return nums;
  })();
  return activeTruckNumbersPromise;
};

// Look up driver + dispatcher names for a given truck number (active trucks only).
const enrichTruck = async (
  truckNumber: string
): Promise<{ driver_name: string | null; dispatcher_name: string | null }> => {
  const num = truckNumber.trim();
  if (!num) return { driver_name: null, dispatcher_name: null };

  const { data: truck } = await supabase
    .from("trucks")
    .select("driver1_id")
    .eq("truck_number", num)
    .eq("is_active", true)
    .maybeSingle();

  if (!truck?.driver1_id) return { driver_name: null, dispatcher_name: null };

  const { data: driver } = await supabase
    .from("drivers")
    .select("name, dispatcher_id")
    .eq("id", truck.driver1_id)
    .maybeSingle();

  if (!driver) return { driver_name: null, dispatcher_name: null };

  let dispatcher_name: string | null = null;
  if (driver.dispatcher_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", driver.dispatcher_id)
      .maybeSingle();
    dispatcher_name = (prof?.full_name as string | null) ?? null;
  }

  return { driver_name: (driver.name as string | null) ?? null, dispatcher_name };
};

export interface DailyReportColumn {
  key: string;
  label: string;
  width: string; // e.g. "120px" or "1fr"
  /** When true, render an autocomplete suggestion list (active trucks) */
  autocompleteTrucks?: boolean;
  /** When true, mask input to MM/DD format and hide the expand-note button */
  mmddDate?: boolean;
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
  /** When true, disables editing (inputs, add/delete/color actions). */
  readOnly?: boolean;
  /** When set, only rows whose truck column matches (case-insensitive substring) are shown. */
  truckFilter?: string;
  /** When set, only rows with this color are shown. */
  colorFilter?: string | null;
  /** When true, ignore the `office` filter when loading rows (cross-office view). */
  ignoreOffice?: boolean;
}

type Row = { __id: string; __persisted?: boolean; [key: string]: any };

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
  readOnly = false,
  truckFilter = "",
  colorFilter = null,
  ignoreOffice = false,
}: DailyReportTableProps) => {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialRows }, () => makeRow(columns))
  );
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const savedSnapshotRef = useRef<Record<string, string>>({});
  const [truckOptions, setTruckOptions] = useState<string[]>(
    () => activeTruckNumbersCache ?? []
  );
  const datalistId = useRef(`trucks-dl-${Math.random().toString(36).slice(2)}`).current;

  // Load active truck numbers once for autocomplete
  useEffect(() => {
    let cancelled = false;
    if (columns.some((c) => c.autocompleteTrucks) && truckOptions.length === 0) {
      loadActiveTruckNumbers().then((nums) => {
        if (!cancelled) setTruckOptions(nums);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateStr = format(date, "yyyy-MM-dd");

  // Reusable loader (used by initial load and realtime refresh)
  const reload = async () => {
    let q = supabase
      .from("daily_report_entries")
      .select("*")
      .eq("date", dateStr)
      .eq("type", type);
    if (!ignoreOffice) {
      if (office === null) q = q.is("office", null);
      else q = q.eq("office", office);
    }

    const { data, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      console.error("daily_report load", error);
      return;
    }
    const loaded: Row[] = (data ?? []).map((d: any) => {
      const r: any = { __id: d.id, __persisted: true };
      for (const c of columns) r[c.key] = (d as any)[c.key] ?? "";
      r.driver_name = (d.driver_name as string | null) ?? null;
      r.dispatcher_name = (d.dispatcher_name as string | null) ?? null;
      r.color = (d.color as string | null) ?? null;
      r.office = (d.office as string | null) ?? null;
      savedSnapshotRef.current[d.id] = JSON.stringify(
        Object.fromEntries([
          ...columns.map((c) => [c.key, (d as any)[c.key] ?? ""]),
          ["__driver", (d.driver_name as string) ?? ""],
          ["__dispatcher", (d.dispatcher_name as string) ?? ""],
          ["__color", (d.color as string) ?? ""],
        ])
      );
      return r as Row;
    });
    setRows((prev) => {
      // Preserve any locally-focused empty unsaved rows the user is typing in
      const unsavedNonEmpty = prev.filter(
        (r) => !r.__persisted && columns.some((c) => (r[c.key] ?? "").trim())
      );
      const padCount = Math.max(
        0,
        initialRows - loaded.length - unsavedNonEmpty.length
      );
      return [
        ...loaded,
        ...unsavedNonEmpty,
        ...Array.from({ length: padCount }, () => makeRow(columns)),
      ];
    });
  };

  // Load + subscribe to realtime updates for current date/type/office
  useEffect(() => {
    reload();

    const filter =
      `date=eq.${dateStr}` +
      (office === null ? "" : ""); // office/type filters applied client-side below

    const channel = supabase
      .channel(
        `daily_report:${dateStr}:${type}:${ignoreOffice ? "any" : office ?? "null"}:${Math.random()
          .toString(36)
          .slice(2)}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_report_entries",
          filter,
        },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row) return;
          if (row.type !== type) return;
          if (!ignoreOffice && (row.office ?? null) !== (office ?? null)) return;
          reload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, type, office, ignoreOffice]);

  const updateCell = (id: string, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.__id === id ? { ...r, [key]: value } : r))
    );
  };

  const isRowEmpty = (r: Row) => columns.every((c) => !((r[c.key] ?? "").trim()));

  const persistRow = async (id: string) => {
    const row = (rowsRef.current.length ? rowsRef.current : rows).find(
      (r) => r.__id === id
    );
    if (!row) return;

    // Enrich driver/dispatcher from active truck assignment when applicable.
    const truckCol = columns.find((c) => c.autocompleteTrucks);
    let enriched: { driver_name: string | null; dispatcher_name: string | null } = {
      driver_name: (row.driver_name as string | null) ?? null,
      dispatcher_name: (row.dispatcher_name as string | null) ?? null,
    };
    if (truckCol) {
      const truckVal = ((row[truckCol.key] as string) ?? "").trim();
      enriched = truckVal
        ? await enrichTruck(truckVal)
        : { driver_name: null, dispatcher_name: null };
    }

    const payload: Record<string, any> = {
      date: dateStr,
      type,
      office,
      driver_name: enriched.driver_name,
      dispatcher_name: enriched.dispatcher_name,
      color: (row.color as string | null) ?? null,
    };
    for (const c of columns) payload[c.key] = (row[c.key] ?? "").trim() || null;

    const snapshotKey = JSON.stringify(
      Object.fromEntries([
        ...columns.map((c) => [c.key, row[c.key] ?? ""]),
        ["__driver", enriched.driver_name ?? ""],
        ["__dispatcher", enriched.dispatcher_name ?? ""],
        ["__color", (row.color as string) ?? ""],
      ])
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
      const { error } = await (supabase as any)
        .from("daily_report_entries")
        .update(payload)
        .eq("id", id);
      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        return;
      }
      savedSnapshotRef.current[id] = snapshotKey;
      setRows((prev) =>
        prev.map((r) =>
          r.__id === id
            ? {
                ...r,
                driver_name: enriched.driver_name,
                dispatcher_name: enriched.dispatcher_name,
              }
            : r
        )
      );
    } else {
      if (isRowEmpty(row)) return;
      const { data, error } = await (supabase as any)
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
          r.__id === id
            ? {
                ...r,
                __id: (data as any).id,
                __persisted: true,
                driver_name: enriched.driver_name,
                dispatcher_name: enriched.dispatcher_name,
              }
            : r
        )
      );
    }
  };

  const addRow = () => setRows((prev) => [...prev, makeRow(columns)]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [noteEditor, setNoteEditor] = useState<{
    rowId: string;
    colKey: string;
    colLabel: string;
    value: string;
  } | null>(null);
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

  const setRowColor = async (id: string, color: string | null) => {
    setRows((prev) => prev.map((r) => (r.__id === id ? { ...r, color } : r)));
    const row = rows.find((r) => r.__id === id);
    if (!row) return;
    if (row.__persisted) {
      const { error } = await (supabase as any)
        .from("daily_report_entries")
        .update({ color })
        .eq("id", id);
      if (error) {
        toast({ title: "Failed to save color", description: error.message, variant: "destructive" });
        return;
      }
      // refresh snapshot color key
      const snap = savedSnapshotRef.current[id];
      if (snap) {
        try {
          const obj = JSON.parse(snap);
          obj.__color = color ?? "";
          savedSnapshotRef.current[id] = JSON.stringify(obj);
        } catch {
          /* noop */
        }
      }
    } else if (color) {
      // Insert a new row carrying just the color (and any text already typed)
      const payload: Record<string, any> = {
        date: dateStr,
        type,
        office,
        color,
      };
      for (const c of columns) payload[c.key] = (row[c.key] ?? "").trim() || null;
      const { data, error } = await (supabase as any)
        .from("daily_report_entries")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        toast({ title: "Failed to save color", description: error?.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      savedSnapshotRef.current[(data as any).id] = JSON.stringify(
        Object.fromEntries([
          ...columns.map((c) => [c.key, row[c.key] ?? ""]),
          ["__driver", ""],
          ["__dispatcher", ""],
          ["__color", color],
        ])
      );
      setRows((prev) =>
        prev.map((r) =>
          r.__id === id ? { ...r, __id: (data as any).id, __persisted: true, color } : r
        )
      );
    }
  };

  const gridTemplate = readOnly
    ? `32px ${columns.map((c) => c.width).join(" ")}`
    : `32px ${columns.map((c) => c.width).join(" ")} 28px 28px`;

  const truckColKey = columns.find((c) => c.autocompleteTrucks)?.key;
  const filtering = !!truckFilter.trim() || !!colorFilter;
  const truckFilterNorm = truckFilter.trim().toLowerCase();
  const visibleRows = filtering
    ? rows.filter((r) => {
        if (!r.__persisted) return false;
        if (truckFilterNorm && truckColKey) {
          const v = String(r[truckColKey] ?? "").toLowerCase();
          const dn = String(r.driver_name ?? "").toLowerCase();
          if (!v.includes(truckFilterNorm) && !dn.includes(truckFilterNorm)) return false;
        }
        if (colorFilter && (r.color ?? null) !== colorFilter) return false;
        return true;
      })
    : rows;

  // When aggregating across offices, sort so rows from the same office cluster
  // together; we'll inject a small header row before each office group.
  const renderedRows = ignoreOffice
    ? [...visibleRows].sort((a, b) => {
        const ao = (a.office ?? "") as string;
        const bo = (b.office ?? "") as string;
        return ao.localeCompare(bo);
      })
    : visibleRows;

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
        <div className="px-1 py-1.5 border-r border-border text-center">#</div>
        {columns.map((c) => (
          <div key={c.key} className="px-2 py-1.5 border-r border-border last:border-r-0">
            {c.label}
          </div>
        ))}
        {!readOnly && <div />}
      </div>
      <div className="divide-y divide-border">
        {renderedRows.length === 0 && filtering && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matching rows</div>
        )}
        {renderedRows.map((row, idx) => {
          const prev = idx > 0 ? renderedRows[idx - 1] : null;
          const showOfficeHeader =
            ignoreOffice && (!prev || (prev.office ?? "") !== (row.office ?? ""));
          return (
          <div key={row.__id + "__wrap"}>
          {showOfficeHeader && (
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-muted/70 text-muted-foreground border-y border-border">
              {(row.office as string | null) ?? "—"}
            </div>
          )}
          <div
            key={row.__id}
            className={cn("grid group hover:bg-muted/30", colorBg(row.color as string | null))}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-1 py-1.5 border-r border-border text-center text-xs font-light text-foreground/80">
              {idx + 1}
            </div>
            {columns.map((c) => (
              <div key={c.key} className="border-r border-border last:border-r-0 overflow-hidden">
                {c.autocompleteTrucks ? (() => {
                  const hasInfo =
                    !!((row[c.key] as string) ?? "").trim() &&
                    !!(row.driver_name || row.dispatcher_name);
                  return (
                  <div className="relative h-8">
                    <Input
                      value={row[c.key] ?? ""}
                      onChange={(e) => !readOnly && updateCell(row.__id, c.key, e.target.value)}
                      onBlur={() => !readOnly && persistRow(row.__id)}
                      readOnly={readOnly}
                      list={datalistId}
                      autoComplete="off"
                      className={cn(
                        "h-8 border-0 rounded-none text-sm bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/30",
                        hasInfo ? "px-1 pr-5" : "px-1"
                      )}
                    />
                    {hasInfo && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                              aria-label="Show driver and dispatcher"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3 text-xs space-y-1.5" align="start">
                            <div className="font-semibold text-foreground border-b border-border pb-1.5 mb-1">
                              Truck #{row[c.key]}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Driver: </span>
                              <span className="font-medium">{row.driver_name || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Dispatcher: </span>
                              <span className="font-medium">{row.dispatcher_name || "—"}</span>
                            </div>
                          </PopoverContent>
                        </Popover>
                    )}
                  </div>
                  );
                })() : (
                  <div className="relative h-8">
                    <Input
                      value={row[c.key] ?? ""}
                      onChange={(e) => {
                        if (readOnly) return;
                        let v = e.target.value;
                        if (c.mmddDate) {
                          // Allow only digits, auto-insert slash after 2 digits, max MM/DD
                          const digits = v.replace(/\D/g, "").slice(0, 4);
                          v = digits.length <= 2
                            ? digits
                            : `${digits.slice(0, 2)}/${digits.slice(2)}`;
                        }
                        updateCell(row.__id, c.key, v);
                      }}
                      onBlur={() => !readOnly && persistRow(row.__id)}
                      readOnly={readOnly}
                      placeholder={c.mmddDate ? "MM/DD" : undefined}
                      inputMode={c.mmddDate ? "numeric" : undefined}
                      maxLength={c.mmddDate ? 5 : undefined}
                      className={cn(
                        "h-8 border-0 rounded-none text-sm bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/30",
                        c.mmddDate ? "px-0.5 text-center" : "pl-3 pr-7"
                      )}
                    />
                    {!c.mmddDate && (
                    <button
                      type="button"
                      onClick={() =>
                        setNoteEditor({
                          rowId: row.__id,
                          colKey: c.key,
                          colLabel: c.label,
                          value: (row[c.key] as string) ?? "",
                        })
                      }
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Expand ${c.label}`}
                      title={`Open ${c.label}`}
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!readOnly && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary flex items-center justify-center transition-opacity"
                  aria-label="Color row"
                >
                  <PaintBucket className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2 text-xs" align="end">
                <div className="space-y-1">
                  {ROW_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setRowColor(row.__id, c.value)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted",
                        row.color === c.value && "bg-muted"
                      )}
                    >
                      <span className={cn("h-3 w-3 rounded-sm", c.swatch)} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                  {row.color && (
                    <button
                      type="button"
                      onClick={() => setRowColor(row.__id, null)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-muted text-muted-foreground border-t border-border mt-1 pt-1.5"
                    >
                      Clear color
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            )}
            {!readOnly && (
            <button
              type="button"
              onClick={() => {
                const isEmpty =
                  !row.__persisted && isRowEmpty(row) && !row.color;
                if (isEmpty) {
                  deleteRow(row.__id);
                } else {
                  setConfirmDeleteId(row.__id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex items-center justify-center transition-opacity"
              aria-label="Delete row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            )}
          </div>
          </div>
          );
        })}
      </div>
      {!readOnly && (
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
      )}
      {columns.some((c) => c.autocompleteTrucks) && (
        <datalist id={datalistId}>
          {truckOptions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteRow(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={noteEditor !== null}
        onOpenChange={(open) => !open && setNoteEditor(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {noteEditor?.colLabel ?? "Note"}
              {(() => {
                const r = rows.find((x) => x.__id === noteEditor?.rowId);
                const truckKey = columns.find((c) => c.autocompleteTrucks)?.key;
                const truck = r && truckKey ? (r[truckKey] as string) : "";
                return truck ? ` — Truck #${truck}` : "";
              })()}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteEditor?.value ?? ""}
            onChange={(e) =>
              setNoteEditor((prev) => (prev ? { ...prev, value: e.target.value } : prev))
            }
            readOnly={readOnly}
            rows={10}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteEditor(null)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button
                onClick={async () => {
                  if (!noteEditor) return;
                  const { rowId, colKey, value } = noteEditor;
                  // Update state and rowsRef synchronously so persistRow sees latest value
                  setRows((prev) => {
                    const next = prev.map((r) =>
                      r.__id === rowId ? { ...r, [colKey]: value } : r
                    );
                    rowsRef.current = next;
                    return next;
                  });
                  setNoteEditor(null);
                  await persistRow(rowId);
                }}
              >
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};