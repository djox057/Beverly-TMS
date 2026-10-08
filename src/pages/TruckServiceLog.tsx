import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Pencil, Plus, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { isDispatcherRole } from "@/lib/dispatchAccess";
import { busChannel } from "@/hooks/realtimeBus";
import { chicagoTodayISO, getMileageUpdateStatus } from "@/lib/mileageUpdateStatus";
import { buildServiceEntries, calculateServiceLog, entryTypes, mileageTone, serviceSummary, type EntryType, type ServiceEntry, type ServiceTruck } from "@/lib/truckServiceLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const num = (value: number | null | undefined) => value == null ? "" : value.toLocaleString("en-US");
const date = (value: string | null) => value ? format(new Date(`${value.slice(0, 10)}T12:00:00`), "M/d/yyyy") : "";
const emptyForm = () => ({ log_date: chicagoTodayISO(), entry_type: "Mileage Check" as EntryType, odometer: "", oil_spec: "", facility: "", invoice: "", notes: "" });
const cell = "border border-[#dce3f3] px-3 py-2";
const db = supabase;
async function readAllRows<T>(makeQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await makeQuery().range(offset, offset + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) return rows;
  }
}

export default function TruckServiceLog() {
  const { truckId } = useParams();
  const { getPrimaryRole, user } = useAuthContext();
  const role = getPrimaryRole();
  const dispatch = isDispatcherRole(role);
  const canEdit = !!role && ["admin", "manager", "maintenance", "chicago_management", "yard", "recruiting", "dispatch", "supervisor"].includes(role);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ServiceEntry | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const queryKey = ["truck-service-log", truckId, user?.id];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey, enabled: !!truckId && !!user,
    queryFn: async () => {
      const result = await supabase.from("trucks").select("id,truck_number,source,make,model,year,vin,engine,is_active,miles,miles_updated_at,last_oil_change_miles,oil_change_date,air_filter,last_oc_invoice,oil_change_note,samsara_account,dispatcher_id,driver1_id").eq("id", truckId!).single();
      if (result.error) throw result.error;
      const truck = result.data as ServiceTruck;
      let dispatcherId = truck.dispatcher_id;
      if (dispatch && !dispatcherId && truck.driver1_id) {
        const driver = await supabase.from("drivers").select("dispatcher_id").eq("id", truck.driver1_id).single();
        if (driver.error) throw driver.error;
        dispatcherId = driver.data.dispatcher_id;
      }
      if (dispatch && dispatcherId !== user?.id) throw new Error("This truck is not assigned to you.");
      const [history, saved] = await Promise.all([
        readAllRows(() => supabase.from("truck_mileage_history").select("id,field,new_value,changed_at").eq("truck_id", truckId!).eq("field", "miles").order("changed_at", { ascending: true }).order("id", { ascending: true })),
        readAllRows(() => db.from("truck_service_log_entries").select("*").eq("truck_id", truckId).order("log_date", { ascending: true }).order("id", { ascending: true })),
      ]);
      return { truck, history, saved: saved as ServiceEntry[] };
    },
  });
  useEffect(() => {
    if (!truckId) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] });
    const channel = busChannel(refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks", filter: `id=eq.${truckId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "truck_mileage_history", filter: `truck_id=eq.${truckId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "truck_service_log_entries", filter: `truck_id=eq.${truckId}` }, refresh).subscribe();
    return () => { channel?.unsubscribe(); };
  }, [truckId, queryClient]);
  const entries = useMemo(() => data ? buildServiceEntries(data.truck, data.history, data.saved) : [], [data]);
  const rows = useMemo(() => calculateServiceLog(entries, data?.truck.source ?? null), [entries, data?.truck.source]);
  const summary = data ? serviceSummary(data.truck, entries) : null;

  const openEditor = (entry: ServiceEntry | "new") => {
    setEditing(entry);
    setForm(entry === "new" ? emptyForm() : {
      log_date: entry.log_date ?? "", entry_type: entry.entry_type, odometer: entry.odometer?.toString() ?? "",
      oil_spec: entry.oil_spec ?? "", facility: entry.facility ?? "", invoice: entry.invoice ?? "", notes: entry.notes ?? "",
    });
  };
  const save = useMutation({
    mutationFn: async () => {
      const entry = editing && editing !== "new" ? editing : null;
      const imported = entry?.imported;
      const odometer = imported ? entry.odometer : form.odometer === "" ? null : Number(form.odometer);
      if (!imported && (!form.log_date || odometer == null || !Number.isSafeInteger(odometer) || odometer < 0)) throw new Error("Enter a valid date and a whole, non-negative odometer reading.");
      if (!imported && form.log_date > chicagoTodayISO()) throw new Error("A completed log entry cannot have a future date.");
      const payload = { truck_id: truckId, source_key: entry?.source_key ?? null,
        log_date: imported ? entry.log_date : form.log_date, entry_type: imported ? entry.entry_type : form.entry_type,
        odometer, oil_spec: form.oil_spec.trim() || null, facility: form.facility.trim() || null,
        invoice: form.invoice.trim() || null, notes: form.notes.trim() || null };
      const existing = entry?.source_key ? data?.saved.find(e => e.source_key === entry.source_key) : entry;
      const result = existing ? await db.from("truck_service_log_entries").update(payload).eq("id", existing.id) : await db.from("truck_service_log_entries").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }); toast({ title: "Log entry saved" }); },
    onError: (e: Error) => toast({ title: "Could not save entry", description: e.message, variant: "destructive" }),
  });
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading truck service log…</div>;
  if (error || !data || !summary) return <div className="p-8 space-y-4"><Link to="/live-oil-change">← Live Oil Change</Link><p role="alert">{error instanceof Error ? error.message : "Truck not found."}</p><Button onClick={() => refetch()}>Try again</Button></div>;
  const truck = data.truck;
  const makeModel = [truck.make, truck.model].filter(Boolean).join(" ");
  const freshness = getMileageUpdateStatus(truck.miles_updated_at);
  const toneClass = (tone: string) => tone === "red" ? "bg-red-50 text-red-800" : tone === "yellow" ? "bg-amber-50 text-amber-800" : tone === "unknown" ? "bg-slate-50 text-slate-600" : "bg-emerald-50 text-emerald-900";
  const editable = editing === "new" || !editing?.imported;
  const field = (key: keyof ReturnType<typeof emptyForm>, value: string) => setForm(current => ({ ...current, [key]: value }));
  const meta = [
    ["Truck Unit", truck.truck_number], ["Model Year", truck.year ?? ""], ["Make / Model", makeModel], ["Status", truck.is_active ? "ACTIVE" : "INACTIVE"],
    ["VIN", truck.vin], ["Engine Type", truck.engine], ["Oil Specification", entries.filter(e => e.oil_spec).slice(-1)[0]?.oil_spec ?? ""], ["Service Interval", `${num(summary.interval.miles)} mi / ${summary.interval.days} Days`],
    ["Telematics / ELD", truck.samsara_account ? `SAMSARA / ${truck.samsara_account}` : ""], ["Baseline Start", date(summary.baseline?.log_date ?? null)], ["Baseline Odometer", num(summary.baseline?.odometer)], ["Baseline Note", summary.baseline?.notes ?? ""],
  ];
  return <div className="px-2 py-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/live-oil-change" className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeft className="h-4 w-4" />Live Oil Change</Link>
      {canEdit && <Button onClick={() => openEditor("new")}><Plus className="h-4 w-4 mr-2" />Add log entry</Button>}</div>
    <div className="rounded-sm border-2 border-[#233c85] bg-white text-slate-900 overflow-hidden shadow-sm">
      <h1 className="bg-[#233c85] px-4 py-3 text-center text-base font-bold tracking-wide text-white">{makeModel ? `${makeModel.toUpperCase()} · ` : ""}TRUCK {truck.truck_number} · FLEET MAINTENANCE & OIL CHANGE SYSTEM</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-[#f5f7fb] text-xs">{meta.map(([label, value]) => <div key={label} className={`${cell} min-h-9 flex gap-2`}><span className="font-semibold text-slate-500 shrink-0">{label}:</span><span className="font-semibold break-all">{value}</span></div>)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border-y border-[#dce3f3] my-4 text-center">
        <div className={`${cell} bg-[#edf3ff]`}><p className="text-xs font-bold text-blue-800">CURRENT ODOMETER</p><p className="my-2 text-2xl font-bold text-[#233c85]">{num(summary.current)}{summary.current != null && " mi"}</p><p className="text-xs text-slate-500">Baseline: {num(summary.baseline?.odometer)}</p><p className="text-xs text-slate-500">Total logged: {summary.current != null && summary.baseline?.odometer != null ? `${num(summary.current - summary.baseline.odometer)} mi` : ""}</p><p className="text-xs text-slate-500">Last update: {date(summary.currentDate)}</p></div>
        <div className={`${cell} ${toneClass(summary.tone)}`}><p className="text-xs font-bold">MILES SINCE LAST OIL CHANGE</p><p className="my-2 text-2xl font-bold">{num(summary.sinceOil)}{summary.sinceOil != null && " mi"}</p><p className="text-xs">Last change: {date(summary.oilDate)}</p><p className="text-xs">PM interval target: {num(summary.interval.miles)} mi</p></div>
        <div className={`${cell} bg-[#fffbea] text-amber-900`}><p className="text-xs font-bold">NEXT SERVICE DUE (ODO)</p><p className="my-2 text-2xl font-bold">{num(summary.nextDue)}{summary.nextDue != null && " mi"}</p><p className="text-xs">Target date: {summary.targetDate ? format(summary.targetDate, "M/d/yyyy") : ""}</p><p className="text-xs">{summary.remaining != null ? summary.remaining < 0 ? `Overdue: ${num(-summary.remaining)} mi` : `Miles remaining: ${num(summary.remaining)} mi` : "Miles remaining:"}</p></div>
        <div className={`${cell} ${summary.status.includes("OVERDUE") || summary.status === "CHECK ODOMETER" || summary.tone === "red" || (summary.sinceFilter != null && summary.sinceFilter > 60000) ? toneClass("red") : summary.status.includes("DUE") ? toneClass("yellow") : summary.status === "MISSING SERVICE DATA" ? toneClass("unknown") : "bg-emerald-50 text-emerald-900"}`}><p className="text-xs font-bold text-[#233c85]">FLEET PM READINESS</p><p className="my-2 text-xl font-bold">{summary.status}</p><p className="text-xs">{summary.daysLeft == null ? "" : summary.daysLeft < 0 ? `${-summary.daysLeft} days overdue` : `${summary.daysLeft} days remaining`}</p><p className="text-xs">Air filter: {num(summary.sinceFilter)}{summary.sinceFilter != null && " mi since change"} · 80,000 mi interval</p></div>
      </div>
      {freshness !== "none" && <div className={`mx-3 mb-4 rounded border px-3 py-2 text-xs ${freshness === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>Mileage update warning: {freshness === "red" ? "Last update is missing or more than 30 days old." : "The current mileage update cycle has not been completed."}</div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-xs"><thead className="bg-[#233c85] text-white"><tr>{["Log Date", "Entry Type", "Total Odometer", "Miles Since Service", "Next Due (mi)", "Oil Grade / Spec", "Service Facility", "Invoice", "Notes / Telematics", ""].map((name, i) => <th key={i} className={`${cell} py-3 text-left font-semibold`}>{name}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className={row.entry_type === "Baseline Start" ? "bg-[#abc6f0]" : row.entry_type !== "Mileage Check" ? "bg-[#effbf4] text-emerald-900 font-semibold" : "even:bg-[#f7f9fd]"}>
          <td className={`${cell} whitespace-nowrap`}>{date(row.log_date)}</td><td className={cell}>{row.entry_type}{row.imported && <span className="block text-[10px] font-normal text-slate-500">Live Oil Change</span>}</td><td className={`${cell} text-right tabular-nums`}>{num(row.odometer)}</td><td className={`${cell} text-right tabular-nums ${mileageTone(row.miles_since_service, truck.source) === "red" ? "bg-red-50 text-red-800 font-bold" : mileageTone(row.miles_since_service, truck.source) === "yellow" ? "bg-amber-50 text-amber-800 font-bold" : ""}`}>{num(row.miles_since_service)}</td><td className={`${cell} text-right`}>{num(row.next_due)}</td><td className={cell}>{row.oil_spec}</td><td className={cell}>{row.facility}</td><td className={cell}>{row.invoice}</td><td className={`${cell} min-w-[220px] whitespace-pre-wrap`}>{row.notes}</td><td className={cell}>{canEdit && (!dispatch || row.entry_type === "Mileage Check") && <button type="button" title="Edit log details" aria-label={`Edit ${row.entry_type} ${date(row.log_date)}`} onClick={() => openEditor(row)} className="p-1 hover:bg-blue-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>}</td>
        </tr>)}
        {Array.from({ length: Math.max(3, 12 - rows.length) }, (_, i) => <tr key={`blank:${i}`} className="even:bg-[#f7f9fd]">{Array.from({ length: 10 }, (_, j) => <td key={j} className={`${cell} h-8`} />)}</tr>)}
      </tbody></table></div>
    </div>
    <p className="text-xs text-muted-foreground">Live Oil Change readings are linked automatically. Additional entries and details are saved in this truck's service log. Missing information is left blank for backfill.</p>
    <Dialog open={editing != null} onOpenChange={open => { if (!open && !save.isPending) setEditing(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing === "new" ? "Add log entry" : "Edit log details"} · Truck {truck.truck_number}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Log date<Input type="date" value={form.log_date} max={chicagoTodayISO()} disabled={!editable} required={editable} onChange={e => field("log_date", e.target.value)} /></label><label className="text-sm">Entry type<select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.entry_type} disabled={!editable} onChange={e => field("entry_type", e.target.value)}>{entryTypes.filter(type => !dispatch || type === "Mileage Check").map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="text-sm">Total odometer<Input type="number" min="0" step="1" value={form.odometer} disabled={!editable} required={editable} onChange={e => field("odometer", e.target.value)} /></label><label className="text-sm">Oil grade / specification<Input value={form.oil_spec} onChange={e => field("oil_spec", e.target.value)} placeholder="" /></label>
          <label className="text-sm">Service facility<Input value={form.facility} onChange={e => field("facility", e.target.value)} /></label><label className="text-sm">Invoice<Input value={form.invoice} onChange={e => field("invoice", e.target.value)} /></label></div>
        <label className="block text-sm">Notes / telematics<Textarea value={form.notes} onChange={e => field("notes", e.target.value)} rows={3} /></label>
        {editing !== "new" && editing?.imported && <p className="text-xs text-muted-foreground">Date, type and odometer come from Live Oil Change. Add supplementary details here.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}><X className="h-4 w-4 mr-1" />Cancel</Button><Button type="submit" disabled={save.isPending}><Save className="h-4 w-4 mr-1" />{save.isPending ? "Saving…" : "Save entry"}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
