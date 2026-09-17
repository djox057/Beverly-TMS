import { useEffect, useMemo, useRef, useState } from "react";

// Clamps text to two lines; when truncated, clicking opens the full text.
function ClampedText({ text, onShowFull }: { text: string; onShowFull?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const clickable = truncated && !!onShowFull;
  return (
    <span
      ref={ref}
      onClick={clickable ? onShowFull : undefined}
      title={clickable ? "Click to view full text" : undefined}
      className={`line-clamp-2 whitespace-pre-wrap break-words text-xs ${
        clickable ? "cursor-pointer hover:text-primary" : ""
      }`}
    >
      {text || "—"}
    </span>
  );
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeTable } from "@/hooks/realtimeBus";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { TranslatableComplaintText } from "@/components/complaints/TranslatableComplaintText";
import { useDriverTruckOptions } from "./useDriverTruckOptions";
import {
  HR_PROBLEM_LABELS,
  HR_PROBLEM_TYPES,
  HR_SEARCH_RANGES,
  problemLabel,
  type HrProblemType,
  type HrReport,
} from "./hrReportTypes";

const chicagoDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "numeric",
    day: "numeric",
  });

const chicagoTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const chicagoDateKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const HISTORY_PAGE_SIZE = 25;

type EditTarget = {
  id: string;
  field: "driver_name" | "truck_number" | "problem" | "reason" | "updates";
};

export function HrReportsBoard() {
  const { user, profile } = useAuthContext();
  const queryClient = useQueryClient();
  const { driverOptions, truckOptions, truckByName, nameByTruck } = useDriverTruckOptions();
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewFull, setViewFull] = useState<{ title: string; text: string } | null>(null);
  const savingRef = useRef(false);

  // history filters
  const [historySearch, setHistorySearch] = useState("");
  const [searchRange, setSearchRange] = useState("0.3");
  const [fDriver, setFDriver] = useState("");
  const [fTruck, setFTruck] = useState("");
  const [fDate, setFDate] = useState("");
  const [fProblem, setFProblem] = useState("");
  const [onlyNotReviewed, setOnlyNotReviewed] = useState(false);
  const [page, setPage] = useState(0);
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["hr-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_reports")
        .select(
          "id, driver_name, truck_number, problem_type, problem_other, reason, updates, is_pinned, is_resolved, resolved_at, archived, archived_at, reviewed, reviewed_at, reviewed_by_name, created_by, created_by_name, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as HrReport[];
    },
  });

  // live updates for everyone
  useEffect(() => {
    return subscribeTable(
      "hr_reports",
      () => queryClient.invalidateQueries({ queryKey: ["hr-reports"] }),
      () => queryClient.invalidateQueries({ queryKey: ["hr-reports"] }),
      "hr-reports",
    );
  }, [queryClient]);

  const reindex = async (id: string, row: Partial<HrReport>) => {
    const text = [row.driver_name, row.truck_number, problemLabel(row as HrReport), row.reason, row.updates]
      .filter(Boolean)
      .join(" · ");
    try {
      await supabase.functions.invoke("hr-report-search", {
        body: { action: "index", id, text },
      });
    } catch (e) {
      console.error("hr report indexing failed:", e);
    }
  };

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HrReport> }) => {
      const { data, error } = await supabase
        .from("hr_reports")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as HrReport;
    },
    onSuccess: (row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["hr-reports"] });
      const touchesText =
        "reason" in vars.patch ||
        "updates" in vars.patch ||
        "driver_name" in vars.patch ||
        "truck_number" in vars.patch ||
        "problem_type" in vars.patch ||
        "problem_other" in vars.patch;
      if (touchesText) void reindex(row.id, row);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const createRow = useMutation({
    mutationFn: async (values: {
      driver_name: string;
      truck_number: string;
      problem_type: string;
      problem_other: string | null;
      reason: string;
      updates: string | null;
    }) => {
      const { data, error } = await supabase
        .from("hr_reports")
        .insert({
          ...values,
          created_by: user?.id ?? null,
          created_by_name: profile?.full_name ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as HrReport;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["hr-reports"] });
      void reindex(row.id, row);
      setAddOpen(false);
      toast.success("Entry added");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not add entry"),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-reports"] });
      setDeleteId(null);
      toast.success("Entry deleted");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  const active = useMemo(
    () =>
      reports
        .filter((r) => !r.archived)
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return a.created_at < b.created_at ? 1 : -1;
        }),
    [reports],
  );

  const historyAll = useMemo(() => reports.filter((r) => r.archived), [reports]);

  const runSemanticSearch = async (query: string) => {
    if (!query.trim()) {
      setSemanticIds(null);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("hr-report-search", {
        body: { action: "search", query, threshold: Number(searchRange) },
      });
      if (error) throw error;
      setSemanticIds(((data?.matches || []) as { id: string }[]).map((m) => m.id));
    } catch (e) {
      console.error(e);
      toast.error("Meaning search unavailable — showing word matches");
      setSemanticIds(null);
    } finally {
      setSearching(false);
    }
  };

  const history = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    const semantic = semanticIds ? new Set(semanticIds) : null;
    return historyAll.filter((r) => {
      if (fDriver && !r.driver_name.toLowerCase().includes(fDriver.toLowerCase())) return false;
      if (fTruck && !r.truck_number.toLowerCase().includes(fTruck.toLowerCase())) return false;
      if (fDate && chicagoDateKey(r.created_at) !== fDate) return false;
      if (fProblem && r.problem_type !== fProblem) return false;
      if (onlyNotReviewed && r.reviewed) return false;
      if (!q) return true;
      const words =
        r.driver_name.toLowerCase().includes(q) ||
        r.truck_number.toLowerCase().includes(q) ||
        problemLabel(r).toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        (r.updates || "").toLowerCase().includes(q);
      return words || (semantic ? semantic.has(r.id) : false);
    });
  }, [historyAll, historySearch, semanticIds, fDriver, fTruck, fDate, fProblem, onlyNotReviewed]);

  const pageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const pageRows = history.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [historySearch, fDriver, fTruck, fDate, fProblem, onlyNotReviewed]);

  const startEdit = (row: HrReport, field: EditTarget["field"]) => {
    setEdit({ id: row.id, field });
    setDraft(field === "problem" ? (row.problem_other ?? "") : ((row[field] as string | null) ?? ""));
  };

  const cancelEdit = () => setEdit(null);

  const commitEdit = () => {
    if (!edit || savingRef.current) return;
    const row = reports.find((r) => r.id === edit.id);
    const current = ((row?.[edit.field] as string | null) ?? "") || "";
    const next = draft;
    setEdit(null);
    if (!row || current === next) return;
    savingRef.current = true;
    updateRow.mutate(
      { id: row.id, patch: { [edit.field]: next } as Partial<HrReport> },
      { onSettled: () => (savingRef.current = false) },
    );
  };

  // Wraps a cell's display value; shows a pencil on hover that opens the editor.
  const cellShell = (row: HrReport, field: EditTarget["field"], display: React.ReactNode) => (
    <div className="group/cell relative min-h-[20px] pr-5">
      {display}
      <button
        type="button"
        title="Edit"
        className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover/cell:flex"
        onClick={() => startEdit(row, field)}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );

  const cancelButton = (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Cancel" onClick={cancelEdit}>
      <X className="h-3 w-3" />
    </Button>
  );

  const textCell = (
    row: HrReport,
    field: "reason" | "updates",
    opts?: { translate?: boolean },
  ) => {
    const isEditing = edit?.id === row.id && edit.field === field;
    const value = (row[field] as string | null) ?? "";
    if (isEditing) {
      return (
        <div className="flex items-start gap-1">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEdit(null);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitEdit();
            }}
            className="min-h-[60px] text-xs"
          />
          {cancelButton}
        </div>
      );
    }
    return cellShell(
      row,
      field,
      <ClampedText
        text={value}
        onShowFull={
          value
            ? () =>
                setViewFull({
                  title: `${row.driver_name || row.truck_number || "Entry"} — ${field === "reason" ? "Reason" : "Updates"}`,
                  text: value,
                })
            : undefined
        }
      />
    );
  };

  const driverCell = (row: HrReport) => {
    const isEditing = edit?.id === row.id && edit.field === "driver_name";
    if (isEditing) {
      return (
        <div className="flex items-start gap-1">
          <Combobox
            className="h-7 w-full text-xs"
            options={
              row.driver_name && !driverOptions.some((o) => o.value === row.driver_name)
                ? [{ value: row.driver_name, label: row.driver_name }, ...driverOptions]
                : driverOptions
            }
            value={row.driver_name}
            onValueChange={(v) => {
              const truck = truckByName.get(v);
              updateRow.mutate({
                id: row.id,
                patch: { driver_name: v, ...(truck ? { truck_number: truck } : {}) },
              });
              setEdit(null);
            }}
            placeholder="Driver"
            searchPlaceholder="Search driver..."
          />
          {cancelButton}
        </div>
      );
    }
    return cellShell(
      row,
      "driver_name",
      <span className="text-xs line-clamp-2 break-words">{row.driver_name || "—"}</span>,
    );
  };

  const truckCell = (row: HrReport) => {
    const isEditing = edit?.id === row.id && edit.field === "truck_number";
    if (isEditing) {
      return (
        <div className="flex items-start gap-1">
          <Combobox
            className="h-7 w-full text-xs"
            options={
              row.truck_number && !truckOptions.some((o) => o.value === row.truck_number)
                ? [{ value: row.truck_number, label: row.truck_number }, ...truckOptions]
                : truckOptions
            }
            value={row.truck_number}
            onValueChange={(v) => {
              const name = nameByTruck.get(v);
              updateRow.mutate({
                id: row.id,
                patch: { truck_number: v, ...(name ? { driver_name: name } : {}) },
              });
              setEdit(null);
            }}
            placeholder="Truck"
            searchPlaceholder="Search truck..."
          />
          {cancelButton}
        </div>
      );
    }
    return cellShell(
      row,
      "truck_number",
      <span className="text-xs line-clamp-2 break-words">{row.truck_number || "—"}</span>,
    );
  };

  const problemCell = (row: HrReport) => {
    const isEditing = edit?.id === row.id && edit.field === "problem";
    if (isEditing) {
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-1">
            <Combobox
              className="h-7 w-full text-xs"
              options={HR_PROBLEM_TYPES.map((t) => ({ value: t, label: HR_PROBLEM_LABELS[t] }))}
              value={row.problem_type}
              onValueChange={(v) => {
                updateRow.mutate({
                  id: row.id,
                  patch: { problem_type: v, problem_other: v === "other" ? row.problem_other : null },
                });
                if (v !== "other") setEdit(null);
              }}
              placeholder="Problem"
              searchPlaceholder="Search..."
            />
            {cancelButton}
          </div>
          {row.problem_type === "other" && (
            <Input
              autoFocus
              value={draft}
              placeholder="Type problem..."
              className="h-7 text-xs"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== (row.problem_other ?? ""))
                  updateRow.mutate({ id: row.id, patch: { problem_other: draft } });
                setEdit(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEdit(null);
              }}
            />
          )}
        </div>
      );
    }
    return cellShell(
      row,
      "problem",
      <span className="text-xs line-clamp-2 break-words">{problemLabel(row)}</span>,
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Active board ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-lg font-semibold">HR Reports</h2>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add entry
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-[140px] px-3 py-2 text-left">Driver name</th>
                <th className="w-[90px] px-3 py-2 text-left">Truck #</th>
                <th className="w-[120px] px-3 py-2 text-left">Problem</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="w-[22%] px-3 py-2 text-left">Updates</th>
                <th className="w-[140px] px-3 py-2 text-left">Added</th>
                <th className="w-[110px] px-3 py-2 text-center">Complete</th>
                <th className="w-[70px] px-3 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No HR entries on the board.
                  </td>
                </tr>
              )}
              {active.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.is_resolved
                      ? "bg-green-50 dark:bg-green-950/30"
                      : row.is_pinned
                        ? "bg-amber-50 dark:bg-amber-950/20"
                        : undefined
                  }
                >
                  <td className="px-3 py-2 align-top">{driverCell(row)}</td>
                  <td className="px-3 py-2 align-top">{truckCell(row)}</td>
                  <td className="px-3 py-2 align-top">{problemCell(row)}</td>
                  <td className="px-3 py-2 align-top">
                    {textCell(row, "reason", { translate: true })}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {textCell(row, "updates", { translate: true })}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {chicagoDate(row.created_at)} {chicagoTime(row.created_at)}
                    {row.created_by_name && <div>{row.created_by_name}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <Button
                      size="sm"
                      disabled={row.is_resolved}
                      className="h-8 rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-100 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-900/60"
                      title={row.is_resolved ? "Completed" : "Mark done"}
                      onClick={() =>
                        updateRow.mutate({
                          id: row.id,
                          patch: { is_resolved: true, resolved_at: new Date().toISOString() },
                        })
                      }
                    >
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  </td>
                  <td className="px-3 py-2 align-top text-center whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={row.is_pinned ? "Unpin" : "Pin to top"}
                      onClick={() => updateRow.mutate({ id: row.id, patch: { is_pinned: !row.is_pinned } })}
                    >
                      {row.is_pinned ? (
                        <PinOff className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Delete"
                      onClick={() => setDeleteId(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Entries marked complete move to History automatically each night (Chicago time).
        </p>
      </div>

      {/* ── History ── */}
      <div className="rounded-lg border bg-card">
        <div className="space-y-3 border-b px-4 py-3">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by driver, truck, reason, or meaning..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSemanticSearch(historySearch);
                }}
                className="pl-9 h-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <Combobox
              className="h-9 w-[140px] text-xs"
              options={HR_SEARCH_RANGES.map((r) => ({ value: r.value, label: r.label }))}
              value={searchRange}
              onValueChange={(v) => {
                setSearchRange(v);
                if (historySearch.trim()) void runSemanticSearch(historySearch);
              }}
              placeholder="Search range"
              searchPlaceholder="Range..."
            />
            <Button variant="outline" size="sm" onClick={() => void runSemanticSearch(historySearch)}>
              Search meaning
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Filter by driver..."
              value={fDriver}
              onChange={(e) => setFDriver(e.target.value)}
              className="h-8 w-[170px] text-xs"
            />
            <Input
              placeholder="Filter by truck..."
              value={fTruck}
              onChange={(e) => setFTruck(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <Input
              type="date"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              className="h-8 w-[160px] text-xs"
            />
            <Combobox
              className="h-8 w-[160px] text-xs"
              options={[
                { value: "", label: "All problems" },
                ...HR_PROBLEM_TYPES.map((t) => ({ value: t, label: HR_PROBLEM_LABELS[t] })),
              ]}
              value={fProblem}
              onValueChange={setFProblem}
              placeholder="All problems"
              searchPlaceholder="Search..."
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={onlyNotReviewed}
                onCheckedChange={(v) => setOnlyNotReviewed(v === true)}
              />
              Only not reviewed
            </label>
            {(fDriver || fTruck || fDate || fProblem || onlyNotReviewed || historySearch) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setFDriver("");
                  setFTruck("");
                  setFDate("");
                  setFProblem("");
                  setOnlyNotReviewed(false);
                  setHistorySearch("");
                  setSemanticIds(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-[120px] px-3 py-2 text-left">Driver name</th>
                <th className="w-[90px] px-3 py-2 text-left">Truck #</th>
                <th className="w-[130px] px-3 py-2 text-left">Problem</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="w-[300px] px-3 py-2 text-left">Updates</th>
                <th className="w-[150px] px-3 py-2 text-left">Date</th>
                <th className="w-[120px] px-3 py-2 text-center">Reviewed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing in history yet.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => (
                <tr key={row.id} className={row.reviewed ? "bg-green-50 dark:bg-green-950/30" : undefined}>
                  <td className="px-3 py-2 align-top text-xs">{row.driver_name || "—"}</td>
                  <td className="px-3 py-2 align-top text-xs">{row.truck_number || "—"}</td>
                  <td className="px-3 py-2 align-top">
                    <Badge variant="outline" className="text-[10px]">
                      {problemLabel(row)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <ClampedText
                      text={row.reason || ""}
                      onShowFull={
                        row.reason
                          ? () =>
                              setViewFull({
                                title: `${row.driver_name || row.truck_number || "Entry"} — Reason`,
                                text: row.reason,
                              })
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {textCell(row, "updates", { translate: true })}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {chicagoDate(row.created_at)} {chicagoTime(row.created_at)}
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <Button
                      variant={row.reviewed ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        updateRow.mutate({
                          id: row.id,
                          patch: {
                            reviewed: !row.reviewed,
                            reviewed_at: row.reviewed ? null : new Date().toISOString(),
                            reviewed_by_name: row.reviewed ? null : profile?.full_name ?? null,
                          },
                        })
                      }
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {row.reviewed ? "Reviewed" : "Review"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{history.length} entr{history.length === 1 ? "y" : "ies"}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <AddHrReportDialog
        driverOptions={driverOptions}
        truckOptions={truckOptions}
        truckByName={truckByName}
        nameByTruck={nameByTruck}
        open={addOpen}
        onOpenChange={setAddOpen}
        saving={createRow.isPending}
        onSubmit={(values) => createRow.mutate(values)}
      />

      {/* Full text viewer (opened by clicking a clamped cell) */}
      <Dialog open={!!viewFull} onOpenChange={(o) => !o && setViewFull(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewFull?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {viewFull && <TranslatableComplaintText text={viewFull.text} size="sm" />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeRow.isPending}
              onClick={() => deleteId && removeRow.mutate(deleteId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddHrReportDialog({
  driverOptions,
  truckOptions,
  truckByName,
  nameByTruck,
  open,
  onOpenChange,
  saving,
  onSubmit,
}: {
  driverOptions: { value: string; label: string; searchText?: string }[];
  truckOptions: { value: string; label: string; searchText?: string }[];
  truckByName: Map<string, string>;
  nameByTruck: Map<string, string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  onSubmit: (values: {
    driver_name: string;
    truck_number: string;
    problem_type: string;
    problem_other: string | null;
    reason: string;
    updates: string | null;
  }) => void;
}) {
  const [driver, setDriver] = useState("");
  const [truck, setTruck] = useState("");
  const [problem, setProblem] = useState<HrProblemType>("recruiting");
  const [other, setOther] = useState("");
  const [reason, setReason] = useState("");
  const [updates, setUpdates] = useState("");

  useEffect(() => {
    if (open) {
      setDriver("");
      setTruck("");
      setProblem("recruiting");
      setOther("");
      setReason("");
      setUpdates("");
    }
  }, [open]);

  const submit = () => {
    if (!driver.trim() && !truck.trim()) {
      toast.error("Add a driver name or a truck number");
      return;
    }
    if (!reason.trim()) {
      toast.error("Add a reason");
      return;
    }
    onSubmit({
      driver_name: driver.trim(),
      truck_number: truck.trim(),
      problem_type: problem,
      problem_other: problem === "other" ? other.trim() || null : null,
      reason: reason.trim(),
      updates: updates.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New HR entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              options={driverOptions}
              value={driver}
              onValueChange={(v) => {
                setDriver(v);
                const t = truckByName.get(v);
                if (t) setTruck(t);
              }}
              placeholder="Driver name"
              searchPlaceholder="Search driver..."
            />
            <Combobox
              options={truckOptions}
              value={truck}
              onValueChange={(v) => {
                setTruck(v);
                const n = nameByTruck.get(v);
                if (n) setDriver(n);
              }}
              placeholder="Truck number"
              searchPlaceholder="Search truck..."
            />
          </div>
          <Combobox
            options={HR_PROBLEM_TYPES.map((t) => ({ value: t, label: HR_PROBLEM_LABELS[t] }))}
            value={problem}
            onValueChange={(v) => setProblem(v as HrProblemType)}
            placeholder="Problem"
            searchPlaceholder="Search..."
          />
          {problem === "other" && (
            <Input placeholder="Type the problem..." value={other} onChange={(e) => setOther(e.target.value)} />
          )}
          <Textarea
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[90px]"
          />
          <Textarea
            placeholder="Update (optional)"
            value={updates}
            onChange={(e) => setUpdates(e.target.value)}
            className="min-h-[70px]"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HrReportsBoard;
