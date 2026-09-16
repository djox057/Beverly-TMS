import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, ChevronDown, ChevronRight, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { DRIVER_EXPENSES_EDIT_ROLES } from "@/lib/driverExpensesAccess";

// The generated schema types do not include this table yet.
const db: SupabaseClient = supabase;

const TYPES = ["ticket", "bag", "motel", "uber", "other"] as const;
type ExpenseType = (typeof TYPES)[number];
const TYPE_LABEL: Record<ExpenseType, string> = { ticket: "Ticket", bag: "Bag", motel: "Motel", uber: "Uber", other: "Other" };

type Line = {
  id: string;
  trip_id: string;
  recruiter: string | null;
  recruiter_id: string | null;
  driver_name: string;
  truck_number: string | null;
  expense_type: string;
  amount: number | null;
  expense_date: string | null;
  details: string | null;
  nights: number | null;
  card: string | null;
  airline: string | null;
  status: string | null;
  is_paid: boolean;
  payment_notes: string | null;
  notice: string | null;
};

type Draft = Omit<Line, "id">;

const EMPTY: Draft = {
  trip_id: "", recruiter: "", recruiter_id: null, driver_name: "", truck_number: "", expense_type: "ticket",
  amount: null, expense_date: null, details: "", nights: null, card: "", airline: "", status: "",
  is_paid: false, payment_notes: "", notice: "",
};

const SELECT = "id,trip_id,recruiter,recruiter_id,driver_name,truck_number,expense_type,amount,expense_date,details,nights,card,airline,status,is_paid,payment_notes,notice";

const money = (value: number | null) => (value === null || value === undefined ? "—" : `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const day = (value: string | null) => {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${m}/${d}/${y}`;
};
const clean = (value: string) => value.trim() || null;
const asNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

type Staff = { user_id: string; full_name: string | null; role: string };

async function fetchRecruiters(): Promise<Staff[]> {
  const { data, error } = await db.rpc("upcoming_driver_staff");
  if (error) throw error;
  return ((data ?? []) as Staff[]).filter(s => s.role === "recruiting");
}

async function fetchLines(): Promise<Line[]> {
  const rows: Line[] = [];
  for (let from = 0; from < 40000; from += 1000) {
    const { data, error } = await db.from("recruiting_driver_expense_lines").select(SELECT)
      .order("expense_date", { ascending: false, nullsFirst: false }).order("id").range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as Line[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export default function DriverExpenses() {
  const { getPrimaryRole } = useAuthContext();
  const role = getPrimaryRole();
  const canEdit = !!role && DRIVER_EXPENSES_EDIT_ROLES.includes(role);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["recruiting-driver-expense-lines"], queryFn: fetchLines, staleTime: 60000 });
  const staffQuery = useQuery({ queryKey: ["driver-expense-recruiters"], queryFn: fetchRecruiters, staleTime: 300000 });
  const recruiterUsers = useMemo(() => (staffQuery.data ?? []).slice().sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")), [staffQuery.data]);
  const recruiterNames = useMemo(() => new Map(recruiterUsers.map(s => [s.user_id, s.full_name ?? "Unknown user"])), [recruiterUsers]);
  const recruiterUserOptions = useMemo(() => recruiterUsers.map(s => ({ value: s.user_id, label: s.full_name ?? "Unknown user" })), [recruiterUsers]);
  const recruiterLabel = (row: { recruiter_id: string | null; recruiter: string | null }) =>
    (row.recruiter_id ? recruiterNames.get(row.recruiter_id) : null) ?? row.recruiter ?? "";

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ recruiter: "", status: "", paid: "", type: "" });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : from;
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Line | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pageSize = 100;

  const toggleExpanded = (id: string) => setExpanded(old => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const optionsFor = (field: "airline" | "status" | "card") => {
    const values = new Set<string>();
    rows.forEach(r => { const v = (r[field] ?? "").trim(); if (v) values.add(v); });
    return [...values].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
  };
  const airlineOptions = useMemo(() => optionsFor("airline"), [rows]);
  const statusOptions = useMemo(() => optionsFor("status"), [rows]);
  const cardOptions = useMemo(() => optionsFor("card"), [rows]);
  const typeOptions = TYPES.map(t => ({ value: t, label: TYPE_LABEL[t] }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filters.recruiter && r.recruiter_id !== filters.recruiter) return false;
      if (filters.type && r.expense_type !== filters.type) return false;
      if (filters.status && (r.status ?? "").trim() !== filters.status) return false;
      if (filters.paid === "Paid" && !r.is_paid) return false;
      if (filters.paid === "Unpaid" && r.is_paid) return false;
      if (from && (!r.expense_date || r.expense_date < from)) return false;
      if (to && (!r.expense_date || r.expense_date > to)) return false;
      if (!q) return true;
      return [r.driver_name, r.recruiter, recruiterLabel(r), r.airline, r.card, r.truck_number, r.details, r.status, r.payment_notes, r.notice, TYPE_LABEL[r.expense_type as ExpenseType]]
        .some(value => value?.toLowerCase().includes(q));
    });
  }, [rows, search, filters, from, to, recruiterNames]);

  const totals = useMemo(() => filtered.reduce((sum, r) => {
    const amount = r.amount ?? 0;
    return {
      total: sum.total + amount,
      paid: sum.paid + (r.is_paid ? amount : 0),
      unpaid: sum.unpaid + (r.is_paid ? 0 : amount),
    };
  }, { total: 0, paid: 0, unpaid: 0 }), [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: Draft }) => {
      const payload: Record<string, unknown> = {
        ...draft,
        recruiter: clean(draft.recruiter ?? ""), recruiter_id: draft.recruiter_id || null,
        driver_name: (draft.driver_name ?? "").trim(),
        truck_number: clean(draft.truck_number ?? ""), details: clean(draft.details ?? ""),
        card: clean(draft.card ?? ""), airline: clean(draft.airline ?? ""), status: clean(draft.status ?? ""),
        payment_notes: clean(draft.payment_notes ?? ""), notice: clean(draft.notice ?? ""),
      };
      if (!draft.trip_id) delete payload.trip_id;
      const request = id
        ? db.from("recruiting_driver_expense_lines").update(payload).eq("id", id)
        : db.from("recruiting_driver_expense_lines").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ["recruiting-driver-expense-lines"] }); toast({ title: "Saved" }); },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("recruiting_driver_expense_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ["recruiting-driver-expense-lines"] }); toast({ title: "Expense deleted" }); },
    onError: (error: Error) => toast({ title: "Could not delete", description: error.message, variant: "destructive" }),
  });

  const field = (key: keyof Draft, value: string | number | boolean | null) => setEditing(old => old && ({ ...old, draft: { ...old.draft, [key]: value } }));

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await db.from("recruiting_driver_expense_lines").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recruiting-driver-expense-lines"] }); },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  type CellKey = "driver_name" | "truck_number" | "expense_type" | "amount" | "expense_date" | "details" | "nights"
    | "card" | "airline" | "status" | "payment_notes" | "notice";
  const NUMERIC: CellKey[] = ["amount", "nights"];
  const DATES: CellKey[] = ["expense_date"];
  const [cell, setCell] = useState<{ id: string; key: CellKey | "recruiter_id"; value: string } | null>(null);

  const commitCell = () => {
    if (!cell) return;
    const row = rows.find(r => r.id === cell.id);
    setCell(null);
    if (!row) return;
    if (cell.key === "recruiter_id") {
      const next = cell.value || null;
      if ((row.recruiter_id ?? null) === next) return;
      patch.mutate({ id: row.id, values: { recruiter_id: next, recruiter: next ? (recruiterNames.get(next) ?? row.recruiter) : row.recruiter } });
      return;
    }
    const key = cell.key;
    if (key === "expense_type") {
      const next = (TYPES as readonly string[]).includes(cell.value) ? cell.value : row.expense_type;
      if (next === row.expense_type) return;
      patch.mutate({ id: row.id, values: { expense_type: next } });
      return;
    }
    const next = NUMERIC.includes(key) ? asNumber(cell.value) : DATES.includes(key) ? (cell.value || null) : clean(cell.value);
    if ((row[key] ?? null) === next) return;
    patch.mutate({ id: row.id, values: { [key]: next } });
  };

  const inputClass = "h-full w-full bg-transparent px-0 text-xs outline-none ring-0 focus:outline-none";
  const editableCell = (r: Line, key: CellKey, display: ReactNode, extra = "", listId?: string) => {
    const active = canEdit && cell?.id === r.id && cell.key === key;
    return <td
      className={cn("h-9 truncate border-b border-r px-2", extra)}
      title={typeof display === "string" ? display : undefined}
      onDoubleClick={() => canEdit && setCell({ id: r.id, key, value: r[key] === null || r[key] === undefined ? "" : String(r[key]) })}
    >
      {active
        ? key === "expense_type"
          ? <select
              autoFocus
              className={inputClass}
              value={cell!.value}
              onChange={e => setCell(c => c && ({ ...c, value: e.target.value }))}
              onBlur={commitCell}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitCell(); } if (e.key === "Escape") { e.preventDefault(); setCell(null); } }}
            >
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          : <input
              autoFocus
              className={inputClass}
              type={DATES.includes(key) ? "date" : "text"}
              inputMode={NUMERIC.includes(key) ? "decimal" : undefined}
              list={listId}
              value={cell!.value}
              onChange={e => setCell(c => c && ({ ...c, value: e.target.value }))}
              onBlur={commitCell}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitCell(); }
                if (e.key === "Escape") { e.preventDefault(); setCell(null); }
              }}
            />
        : display}
    </td>;
  };

  const detail = (label: string, value: ReactNode) => <div className="min-w-40">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-xs">{value}</div>
  </div>;

  const columns = ["", "Recc", "Driver", "Truck", "Type", "Amount", "Date", "Details", "Paid", ""];
  const widths = [34, 130, 200, 90, 90, 110, 100, 260, 60, 80];

  return <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col gap-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Driver Expenses</h1>
        <p className="text-xs text-muted-foreground">Recruiting spend per incoming driver · one row per expense, click a row to see the rest.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
        {canEdit && <Button size="sm" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}><Plus className="mr-2 h-4 w-4" />Add Expense</Button>}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Search driver expenses" placeholder="Driver, truck, details, notes…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="h-9 w-64 pl-8" />
      </div>
      <div className="w-40"><Combobox options={recruiterUserOptions} value={filters.recruiter} onValueChange={v => { setFilters(f => ({ ...f, recruiter: v })); setPage(0); }} placeholder="All recruiters" /></div>
      <div className="w-32"><Combobox options={typeOptions} value={filters.type} onValueChange={v => { setFilters(f => ({ ...f, type: v })); setPage(0); }} placeholder="All types" /></div>
      <div className="w-44"><Combobox options={statusOptions} value={filters.status} onValueChange={v => { setFilters(f => ({ ...f, status: v })); setPage(0); }} placeholder="All statuses" /></div>
      <div className="w-32"><Combobox options={[{ value: "Paid", label: "Paid" }, { value: "Unpaid", label: "Unpaid" }]} value={filters.paid} onValueChange={v => { setFilters(f => ({ ...f, paid: v })); setPage(0); }} placeholder="Paid / Unpaid" /></div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-9 w-56 justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from
              ? dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                ? `${format(dateRange.from, "MM/dd/yyyy")} - ${format(dateRange.to, "MM/dd/yyyy")}`
                : format(dateRange.from, "MM/dd/yyyy")
              : "Pick a date range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={range => { setDateRange(range); setPage(0); }}
            numberOfMonths={2}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {(search || from || to || Object.values(filters).some(Boolean)) &&
        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateRange(undefined); setFilters({ recruiter: "", status: "", paid: "", type: "" }); setPage(0); }}>Clear filters</Button>}
      <div className="ml-auto flex flex-wrap gap-3 px-2 text-xs text-muted-foreground">
        <span>Expenses: <b className="text-foreground">{filtered.length}</b></span>
        <span>Paid: <b className="text-foreground">{money(totals.paid)}</b></span>
        <span>Unpaid: <b className="text-foreground">{money(totals.unpaid)}</b></span>
        <span>Total: <b className="text-foreground">{money(totals.total)}</b></span>
      </div>
    </div>

    {query.isError && <div role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">Unable to load driver expenses. {String(query.error?.message ?? "")}</div>}

    {query.isPending ? <div className="flex items-center justify-center gap-2 py-16"><Loader2 className="h-5 w-5 animate-spin" />Loading driver expenses…</div> :
    <div className="min-h-32 flex-1 overflow-auto rounded-lg border">
      <table className="table-fixed border-collapse text-xs" style={{ width: widths.reduce((a, b) => a + b, 0) }}>
        <colgroup>
          {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-muted">
          <tr>
            {columns.map((label, i) =>
              <th key={label || `col-${i}`} scope="col" className="h-10 border-b border-r bg-muted px-2 text-left font-semibold">{label || <span className="sr-only">{i === 0 ? "Expand" : "Actions"}</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, index) => {
            const open = expanded.has(r.id);
            return <>
              <tr key={r.id} className={index % 2 ? "bg-muted/20" : "bg-background"}>
                <td className="h-9 border-b border-r px-1 text-center">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={open ? "Hide details" : "Show details"} aria-expanded={open} onClick={() => toggleExpanded(r.id)}>
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </Button>
                </td>
                <td
                  className="h-9 truncate border-b border-r px-2"
                  title={recruiterLabel(r)}
                  onDoubleClick={() => canEdit && setCell({ id: r.id, key: "recruiter_id", value: r.recruiter_id ?? "" })}
                >
                  {canEdit && cell?.id === r.id && cell.key === "recruiter_id"
                    ? <select
                        autoFocus
                        className={inputClass}
                        value={cell.value}
                        onChange={e => setCell(c => c && ({ ...c, value: e.target.value }))}
                        onBlur={commitCell}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitCell(); } if (e.key === "Escape") { e.preventDefault(); setCell(null); } }}
                      >
                        <option value="">—</option>
                        {recruiterUserOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    : (recruiterLabel(r) || "—")}
                </td>
                {editableCell(r, "driver_name", r.driver_name || "—", "font-medium")}
                {editableCell(r, "truck_number", r.truck_number || "—")}
                {editableCell(r, "expense_type", TYPE_LABEL[r.expense_type as ExpenseType] ?? r.expense_type)}
                {editableCell(r, "amount", money(r.amount), "tabular-nums")}
                {editableCell(r, "expense_date", day(r.expense_date))}
                {editableCell(r, "details", r.details || "—")}
                <td className="h-9 border-b border-r px-2">
                  <Checkbox
                    checked={r.is_paid}
                    disabled={!canEdit}
                    aria-label={`Paid ${r.driver_name} ${r.expense_type}`}
                    onCheckedChange={value => patch.mutate({ id: r.id, values: { is_paid: value === true } })}
                  />
                </td>
                <td className="h-9 border-b px-1">
                  {canEdit && <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${r.driver_name} ${r.expense_type}`} onClick={() => setEditing({ id: r.id, draft: { ...r } })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete ${r.driver_name} ${r.expense_type}`} onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>}
                </td>
              </tr>
              {open && <tr key={`${r.id}-details`} className="bg-muted/40">
                <td className="border-b" />
                <td className="border-b px-2 py-3" colSpan={columns.length - 1}>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {detail("Nights", r.nights === null || r.nights === undefined ? "—" : String(r.nights))}
                    {detail("Card", r.card || "—")}
                    {detail("Airline", r.airline || "—")}
                    {detail("Status", r.status || "—")}
                    {detail("Notes", r.payment_notes || "—")}
                    {detail("Djordje notice", r.notice || "—")}
                    {canEdit && <div className="self-end">
                      <Button size="sm" variant="outline" onClick={() => setEditing({ id: r.id, draft: { ...r } })}>Edit details</Button>
                    </div>}
                  </div>
                </td>
              </tr>}
            </>;
          })}
          {!visible.length && <tr><td colSpan={columns.length} className="p-6 text-center text-muted-foreground">No expenses yet — add one with the Add Expense button.</td></tr>}
        </tbody>
      </table>
      <datalist id="ex-cards-inline">{cardOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
      <datalist id="ex-airlines-inline">{airlineOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
      <datalist id="ex-statuses-inline">{statusOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
    </div>}

    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Page {current + 1} of {pageCount} · showing {visible.length} of {filtered.length} expenses</span>
      <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</Button>
    </div>

    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing?.id ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
        {editing && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><Label htmlFor="ex-recc">Recc (app user)</Label>
            <Combobox options={recruiterUserOptions} value={editing.draft.recruiter_id ?? ""} onValueChange={v => setEditing(old => old && ({ ...old, draft: { ...old.draft, recruiter_id: v || null, recruiter: v ? (recruiterNames.get(v) ?? old.draft.recruiter) : old.draft.recruiter } }))} placeholder="Select recruiter" modal />
            {!editing.draft.recruiter_id && editing.draft.recruiter && <p className="mt-1 text-xs text-muted-foreground">Imported name: {editing.draft.recruiter}</p>}
          </div>
          <div className="sm:col-span-2"><Label htmlFor="ex-driver">Driver</Label>
            <Input id="ex-driver" value={editing.draft.driver_name ?? ""} onChange={e => field("driver_name", e.target.value)} /></div>
          <div><Label htmlFor="ex-type">Expense type</Label>
            <Combobox options={typeOptions} value={editing.draft.expense_type} onValueChange={v => field("expense_type", v || "other")} placeholder="Select type" modal />
          </div>
          <div><Label htmlFor="ex-amount">Amount</Label>
            <Input id="ex-amount" inputMode="decimal" value={editing.draft.amount ?? ""} onChange={e => field("amount", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-date">Date</Label>
            <Input id="ex-date" type="date" value={editing.draft.expense_date ?? ""} onChange={e => field("expense_date", e.target.value || null)} /></div>
          <div><Label htmlFor="ex-truck">Truck number</Label>
            <Input id="ex-truck" value={editing.draft.truck_number ?? ""} onChange={e => field("truck_number", e.target.value)} /></div>
          <div><Label htmlFor="ex-nights">Nights (motel)</Label>
            <Input id="ex-nights" inputMode="numeric" value={editing.draft.nights ?? ""} onChange={e => field("nights", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-card">Card</Label>
            <Input id="ex-card" value={editing.draft.card ?? ""} onChange={e => field("card", e.target.value)} list="ex-cards" />
            <datalist id="ex-cards">{cardOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div><Label htmlFor="ex-airline">Airline</Label>
            <Input id="ex-airline" value={editing.draft.airline ?? ""} onChange={e => field("airline", e.target.value)} list="ex-airlines" />
            <datalist id="ex-airlines">{airlineOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div><Label htmlFor="ex-status">Status</Label>
            <Input id="ex-status" value={editing.draft.status ?? ""} onChange={e => field("status", e.target.value)} list="ex-statuses" />
            <datalist id="ex-statuses">{statusOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox id="ex-paid" checked={editing.draft.is_paid} onCheckedChange={value => field("is_paid", value === true)} />
            <Label htmlFor="ex-paid">Paid</Label>
          </div>
          <div className="sm:col-span-3"><Label htmlFor="ex-details">Details</Label>
            <Input id="ex-details" value={editing.draft.details ?? ""} onChange={e => field("details", e.target.value)} placeholder="Uber destinations, motel name, other note" /></div>
          <div className="sm:col-span-3"><Label htmlFor="ex-notes">Notes</Label>
            <Textarea id="ex-notes" rows={2} value={editing.draft.payment_notes ?? ""} onChange={e => field("payment_notes", e.target.value)} /></div>
          <div className="sm:col-span-3"><Label htmlFor="ex-notice">Djordje notice</Label>
            <Textarea id="ex-notice" rows={2} value={editing.draft.notice ?? ""} onChange={e => field("notice", e.target.value)} /></div>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            disabled={save.isPending || !editing?.draft.driver_name?.trim()}
            onClick={() => editing && save.mutate({ id: editing.id, draft: editing.draft })}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleting ? `${TYPE_LABEL[deleting.expense_type as ExpenseType] ?? deleting.expense_type} for ${deleting.driver_name || "this driver"} will be removed permanently.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
