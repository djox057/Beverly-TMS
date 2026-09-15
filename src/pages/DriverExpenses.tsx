import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { DRIVER_EXPENSES_EDIT_ROLES } from "@/lib/driverExpensesAccess";

// The generated schema types do not include this table yet.
const db: SupabaseClient = supabase;

type Expense = {
  id: string;
  recruiter: string | null;
  recruiter_id: string | null;
  driver_name: string;
  ticket_price: number | null;
  bag_amount: number | null;
  card: string | null;
  airline: string | null;
  purchase_date: string | null;
  arrival_date: string | null;
  motel_nights: number | null;
  motel_amount: number | null;
  truck_number: string | null;
  uber_amount: number | null;
  uber_destinations: string | null;
  status: string | null;
  payment_notes: string | null;
  notice: string | null;
  total_exp: number | null;
};

type Draft = Omit<Expense, "id" | "total_exp">;

const EMPTY: Draft = {
  recruiter: "", recruiter_id: null, driver_name: "", ticket_price: null, bag_amount: null, card: "", airline: "",
  purchase_date: null, arrival_date: null, motel_nights: null, motel_amount: null, truck_number: "",
  uber_amount: null, uber_destinations: "", status: "", payment_notes: "", notice: "",
};

const SELECT = "id,recruiter,recruiter_id,driver_name,ticket_price,bag_amount,card,airline,purchase_date,arrival_date,motel_nights,motel_amount,truck_number,uber_amount,uber_destinations,status,payment_notes,notice,total_exp";

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

async function fetchExpenses(): Promise<Expense[]> {
  const rows: Expense[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("recruiting_driver_expenses").select(SELECT)
      .order("purchase_date", { ascending: false, nullsFirst: false }).order("id").range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as Expense[];
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
  const query = useQuery({ queryKey: ["recruiting-driver-expenses"], queryFn: fetchExpenses, staleTime: 60000 });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const staffQuery = useQuery({ queryKey: ["driver-expense-recruiters"], queryFn: fetchRecruiters, staleTime: 300000 });
  const recruiterUsers = useMemo(() => (staffQuery.data ?? []).slice().sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")), [staffQuery.data]);
  const recruiterNames = useMemo(() => new Map(recruiterUsers.map(s => [s.user_id, s.full_name ?? "Unknown user"])), [recruiterUsers]);
  const recruiterUserOptions = useMemo(() => recruiterUsers.map(s => ({ value: s.user_id, label: s.full_name ?? "Unknown user" })), [recruiterUsers]);
  const recruiterLabel = (row: { recruiter_id: string | null; recruiter: string | null }) =>
    (row.recruiter_id ? recruiterNames.get(row.recruiter_id) : null) ?? row.recruiter ?? "";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ recruiter: "", airline: "", status: "", card: "", paid: "" });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : from;
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const pageSize = 100;

  const optionsFor = (field: "airline" | "status" | "card") => {
    const values = new Set<string>();
    rows.forEach(r => { const v = (r[field] ?? "").trim(); if (v) values.add(v); });
    return [...values].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
  };
  const airlineOptions = useMemo(() => optionsFor("airline"), [rows]);
  const statusOptions = useMemo(() => optionsFor("status"), [rows]);
  const cardOptions = useMemo(() => optionsFor("card"), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filters.recruiter && r.recruiter_id !== filters.recruiter) return false;
      if (filters.airline && (r.airline ?? "").trim() !== filters.airline) return false;
      if (filters.status && (r.status ?? "").trim() !== filters.status) return false;
      if (filters.card && (r.card ?? "").trim() !== filters.card) return false;
      if (filters.paid) {
        const notes = (r.payment_notes ?? "").toLowerCase();
        const paid = notes.includes("paid") && !notes.includes("unpaid") && !notes.includes("not paid");
        if (filters.paid === "Paid" && !paid) return false;
        if (filters.paid === "Unpaid" && paid) return false;
      }
      const reference = r.purchase_date ?? r.arrival_date ?? "";
      if (from && (!reference || reference < from)) return false;
      if (to && (!reference || reference > to)) return false;
      if (!q) return true;
      return [r.driver_name, r.recruiter, recruiterLabel(r), r.airline, r.card, r.truck_number, r.uber_destinations, r.status, r.payment_notes, r.notice]
        .some(value => value?.toLowerCase().includes(q));
    });
  }, [rows, search, filters, from, to, recruiterNames]);

  const totals = useMemo(() => filtered.reduce((sum, r) => ({
    ticket: sum.ticket + (r.ticket_price ?? 0), bag: sum.bag + (r.bag_amount ?? 0),
    motel: sum.motel + (r.motel_amount ?? 0), uber: sum.uber + (r.uber_amount ?? 0),
    total: sum.total + (r.total_exp ?? 0),
  }), { ticket: 0, bag: 0, motel: 0, uber: 0, total: 0 }), [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: Draft }) => {
      const payload = {
        ...draft,
        recruiter: clean(draft.recruiter ?? ""), recruiter_id: draft.recruiter_id || null, driver_name: (draft.driver_name ?? "").trim(),
        card: clean(draft.card ?? ""), airline: clean(draft.airline ?? ""), truck_number: clean(draft.truck_number ?? ""),
        uber_destinations: clean(draft.uber_destinations ?? ""), status: clean(draft.status ?? ""),
        payment_notes: clean(draft.payment_notes ?? ""), notice: clean(draft.notice ?? ""),
      };
      const request = id
        ? db.from("recruiting_driver_expenses").update(payload).eq("id", id)
        : db.from("recruiting_driver_expenses").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ["recruiting-driver-expenses"] }); toast({ title: "Saved" }); },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("recruiting_driver_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ["recruiting-driver-expenses"] }); toast({ title: "Entry deleted" }); },
    onError: (error: Error) => toast({ title: "Could not delete", description: error.message, variant: "destructive" }),
  });

  const field = (key: keyof Draft, value: string | number | null) => setEditing(old => old && ({ ...old, draft: { ...old.draft, [key]: value } }));

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Draft> }) => {
      const { error } = await db.from("recruiting_driver_expenses").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recruiting-driver-expenses"] }); },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  type CellKey = "driver_name" | "ticket_price" | "bag_amount" | "card" | "airline" | "purchase_date" | "arrival_date"
    | "motel_nights" | "motel_amount" | "truck_number" | "uber_amount" | "uber_destinations" | "status" | "payment_notes" | "notice";
  const NUMERIC: CellKey[] = ["ticket_price", "bag_amount", "motel_nights", "motel_amount", "uber_amount"];
  const DATES: CellKey[] = ["purchase_date", "arrival_date"];
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
    const next = NUMERIC.includes(key) ? asNumber(cell.value) : DATES.includes(key) ? (cell.value || null) : clean(cell.value);
    if ((row[key] ?? null) === next) return;
    patch.mutate({ id: row.id, values: { [key]: next } as Partial<Draft> });
  };

  const inputClass = "h-full w-full bg-transparent px-0 text-xs outline-none ring-0 focus:outline-none";
  const editableCell = (r: Expense, key: CellKey, display: React.ReactNode, extra = "", listId?: string) => {
    const active = canEdit && cell?.id === r.id && cell.key === key;
    return <td
      className={cn("h-9 truncate border-b border-r px-2", extra)}
      title={typeof display === "string" ? display : undefined}
      onDoubleClick={() => canEdit && setCell({ id: r.id, key, value: r[key] === null || r[key] === undefined ? "" : String(r[key]) })}
    >
      {active
        ? <input
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


  return <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col gap-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Driver Expenses</h1>
        <p className="text-xs text-muted-foreground">Recruiting spend per incoming driver · Total Exp adds ticket, bag, motel and Uber.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
        {canEdit && <Button size="sm" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}><Plus className="mr-2 h-4 w-4" />Add Entry</Button>}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Search driver expenses" placeholder="Driver, truck, Uber destination, notes…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="h-9 w-64 pl-8" />
      </div>
      <div className="w-40"><Combobox options={recruiterUserOptions} value={filters.recruiter} onValueChange={v => { setFilters(f => ({ ...f, recruiter: v })); setPage(0); }} placeholder="All recruiters" /></div>
      <div className="w-36"><Combobox options={airlineOptions} value={filters.airline} onValueChange={v => { setFilters(f => ({ ...f, airline: v })); setPage(0); }} placeholder="All airlines" /></div>
      <div className="w-44"><Combobox options={statusOptions} value={filters.status} onValueChange={v => { setFilters(f => ({ ...f, status: v })); setPage(0); }} placeholder="All statuses" /></div>
      <div className="w-32"><Combobox options={cardOptions} value={filters.card} onValueChange={v => { setFilters(f => ({ ...f, card: v })); setPage(0); }} placeholder="All cards" /></div>
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
        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateRange(undefined); setFilters({ recruiter: "", airline: "", status: "", card: "", paid: "" }); setPage(0); }}>Clear filters</Button>}
      <div className="ml-auto flex flex-wrap gap-3 px-2 text-xs text-muted-foreground">
        <span>Entries: <b className="text-foreground">{filtered.length}</b></span>
        <span>Tickets: <b className="text-foreground">{money(totals.ticket)}</b></span>
        <span>Bags: <b className="text-foreground">{money(totals.bag)}</b></span>
        <span>Motel: <b className="text-foreground">{money(totals.motel)}</b></span>
        <span>Uber: <b className="text-foreground">{money(totals.uber)}</b></span>
        <span>Total: <b className="text-foreground">{money(totals.total)}</b></span>
      </div>
    </div>

    {query.isError && <div role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">Unable to load driver expenses. {String(query.error?.message ?? "")}</div>}

    {query.isPending ? <div className="flex items-center justify-center gap-2 py-16"><Loader2 className="h-5 w-5 animate-spin" />Loading driver expenses…</div> :
    <div className="min-h-32 flex-1 overflow-auto rounded-lg border">
      <table className="table-fixed border-collapse text-xs" style={{ width: 1980 }}>
        <colgroup>
          {[110, 200, 100, 90, 90, 110, 110, 110, 90, 100, 110, 110, 240, 130, 200, 100, 200, 80].map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-muted">
          <tr>
            {["Recc", "Driver", "Ticket Price", "Bag", "Card", "Airline", "Purchase Date", "Arrival Date", "Motel Nights", "Motel Amount", "Truck Number", "Uber Amount", "Uber Destinations", "Status", "Notes - Paid/Unpaid", "Total Exp", "Djordje Notice", ""].map(label =>
              <th key={label} scope="col" className="h-10 border-b border-r bg-muted px-2 text-left font-semibold">{label || <span className="sr-only">Actions</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, index) => <tr key={r.id} className={index % 2 ? "bg-muted/20" : "bg-background"}>
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
                : recruiterLabel(r) || "—"}
            </td>
            {editableCell(r, "driver_name", r.driver_name || "—", "font-medium")}
            {editableCell(r, "ticket_price", money(r.ticket_price))}
            {editableCell(r, "bag_amount", money(r.bag_amount))}
            {editableCell(r, "card", r.card || "—", "", "ex-cards-inline")}
            {editableCell(r, "airline", r.airline || "—", "", "ex-airlines-inline")}
            {editableCell(r, "purchase_date", day(r.purchase_date))}
            {editableCell(r, "arrival_date", day(r.arrival_date))}
            {editableCell(r, "motel_nights", r.motel_nights === null || r.motel_nights === undefined ? "—" : String(r.motel_nights))}
            {editableCell(r, "motel_amount", money(r.motel_amount))}
            {editableCell(r, "truck_number", r.truck_number || "—")}
            {editableCell(r, "uber_amount", money(r.uber_amount))}
            {editableCell(r, "uber_destinations", r.uber_destinations || "—")}
            {editableCell(r, "status", r.status || "—", "", "ex-statuses-inline")}
            {editableCell(r, "payment_notes", r.payment_notes || "—")}
            <td className="h-9 border-b border-r px-2 font-semibold">{money(r.total_exp)}</td>
            {editableCell(r, "notice", r.notice || "—")}
            <td className="h-9 border-b px-1">
              {canEdit && <div className="flex gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${r.driver_name}`} onClick={() => setEditing({ id: r.id, draft: { ...r } })}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete ${r.driver_name}`} onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>}
            </td>
          </tr>)}
          {!visible.length && <tr><td colSpan={18} className="p-6 text-center text-muted-foreground">No expense entries match these filters.</td></tr>}
        </tbody>
      </table>
    </div>}

    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Page {current + 1} of {pageCount} · showing {visible.length} of {filtered.length} entries</span>
      <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</Button>
    </div>

    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing?.id ? "Edit expense entry" : "Add expense entry"}</DialogTitle></DialogHeader>
        {editing && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><Label htmlFor="ex-recc">Recc (app user)</Label>
            <Combobox options={recruiterUserOptions} value={editing.draft.recruiter_id ?? ""} onValueChange={v => setEditing(old => old && ({ ...old, draft: { ...old.draft, recruiter_id: v || null, recruiter: v ? (recruiterNames.get(v) ?? old.draft.recruiter) : old.draft.recruiter } }))} placeholder="Select recruiter" modal />
            {!editing.draft.recruiter_id && editing.draft.recruiter && <p className="mt-1 text-xs text-muted-foreground">Imported name: {editing.draft.recruiter}</p>}
          </div>
          <div className="sm:col-span-2"><Label htmlFor="ex-driver">Driver</Label>
            <Input id="ex-driver" value={editing.draft.driver_name ?? ""} onChange={e => field("driver_name", e.target.value)} /></div>
          <div><Label htmlFor="ex-ticket">Ticket price</Label>
            <Input id="ex-ticket" inputMode="decimal" value={editing.draft.ticket_price ?? ""} onChange={e => field("ticket_price", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-bag">Bag</Label>
            <Input id="ex-bag" inputMode="decimal" value={editing.draft.bag_amount ?? ""} onChange={e => field("bag_amount", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-card">Card</Label>
            <Input id="ex-card" value={editing.draft.card ?? ""} onChange={e => field("card", e.target.value)} list="ex-cards" />
            <datalist id="ex-cards">{cardOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div><Label htmlFor="ex-airline">Airline</Label>
            <Input id="ex-airline" value={editing.draft.airline ?? ""} onChange={e => field("airline", e.target.value)} list="ex-airlines" />
            <datalist id="ex-airlines">{airlineOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div><Label htmlFor="ex-purchase">Purchase date</Label>
            <Input id="ex-purchase" type="date" value={editing.draft.purchase_date ?? ""} onChange={e => field("purchase_date", e.target.value || null)} /></div>
          <div><Label htmlFor="ex-arrival">Arrival date</Label>
            <Input id="ex-arrival" type="date" value={editing.draft.arrival_date ?? ""} onChange={e => field("arrival_date", e.target.value || null)} /></div>
          <div><Label htmlFor="ex-nights">Motel nights</Label>
            <Input id="ex-nights" inputMode="numeric" value={editing.draft.motel_nights ?? ""} onChange={e => field("motel_nights", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-motel">Motel amount</Label>
            <Input id="ex-motel" inputMode="decimal" value={editing.draft.motel_amount ?? ""} onChange={e => field("motel_amount", asNumber(e.target.value))} /></div>
          <div><Label htmlFor="ex-truck">Truck number</Label>
            <Input id="ex-truck" value={editing.draft.truck_number ?? ""} onChange={e => field("truck_number", e.target.value)} /></div>
          <div><Label htmlFor="ex-uber">Uber amount</Label>
            <Input id="ex-uber" inputMode="decimal" value={editing.draft.uber_amount ?? ""} onChange={e => field("uber_amount", asNumber(e.target.value))} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ex-dest">Uber destinations</Label>
            <Input id="ex-dest" value={editing.draft.uber_destinations ?? ""} onChange={e => field("uber_destinations", e.target.value)} /></div>
          <div><Label htmlFor="ex-status">Status</Label>
            <Input id="ex-status" value={editing.draft.status ?? ""} onChange={e => field("status", e.target.value)} list="ex-statuses" />
            <datalist id="ex-statuses">{statusOptions.map(o => <option key={o.value} value={o.value} />)}</datalist>
          </div>
          <div className="sm:col-span-3"><Label htmlFor="ex-notes">Notes - paid/unpaid</Label>
            <Textarea id="ex-notes" rows={2} value={editing.draft.payment_notes ?? ""} onChange={e => field("payment_notes", e.target.value)} /></div>
          <div className="sm:col-span-3"><Label htmlFor="ex-notice">Djordje notice</Label>
            <Textarea id="ex-notice" rows={2} value={editing.draft.notice ?? ""} onChange={e => field("notice", e.target.value)} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">Total Exp: <b className="text-foreground">{money((editing.draft.ticket_price ?? 0) + (editing.draft.bag_amount ?? 0) + (editing.draft.motel_amount ?? 0) + (editing.draft.uber_amount ?? 0))}</b> · calculated automatically.</p>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button disabled={!editing?.draft.driver_name?.trim() || save.isPending} onClick={() => editing && save.mutate(editing)}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this expense entry?</AlertDialogTitle>
          <AlertDialogDescription>{deleting?.driver_name} · {money(deleting?.total_exp ?? null)}. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
