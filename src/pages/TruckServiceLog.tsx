import { useEffect, useMemo, useRef, useState } from "react";
import "./TruckServiceLog.css";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { isDispatcherRole } from "@/lib/dispatchAccess";
import { busChannel } from "@/hooks/realtimeBus";
import { chicagoTodayISO, getMileageUpdateStatus } from "@/lib/mileageUpdateStatus";
import { buildServiceEntries, calculateServiceLog, entryTypes, mileageTone, serviceSummary, type EntryType, type ServiceEntry, type ServiceTruck } from "@/lib/truckServiceLog";
import type { Database } from "@/integrations/supabase/types";
import { parseServiceLogRows } from "@/lib/serviceLogPaste";
import { ServiceLogCell } from "@/components/ServiceLogCell";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const num = (value: number | null | undefined) => value == null ? "" : value.toLocaleString("en-US");
const date = (value: string | null) => value ? format(new Date(`${value.slice(0, 10)}T12:00:00`), "M/d/yyyy") : "";
const emptyForm = () => ({ log_date: chicagoTodayISO(), entry_type: "Mileage Check" as EntryType, odometer: "", oil_spec: "", facility: "", invoice: "", notes: "" });
const cell = "border border-[#dce3f3] px-3 py-1";
const editableCell = "relative h-7 overflow-hidden border border-[#dce3f3] p-0 [&:has([data-cell-editor])]:shadow-[inset_0_0_0_2px_#217346]";
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
  const navigate = useNavigate();
  const { getPrimaryRole, user } = useAuthContext();
  const role = getPrimaryRole();
  const dispatch = isDispatcherRole(role);
  const canEdit = !!role && ["admin", "manager", "maintenance", "chicago_management", "yard", "recruiting", "dispatch", "supervisor"].includes(role);
  const canEditSpecs = !!role && ["admin", "manager", "maintenance"].includes(role);
  const canEditTruck = !!role && ["admin", "manager", "maintenance", "supervisor"].includes(role);
  const queryClient = useQueryClient();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<ServiceEntry | "new" | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<ServiceEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const pasteInFlight = useRef(false);
  const [blankRevision, setBlankRevision] = useState(0);
  const [draftRows, setDraftRows] = useState<Record<number, ReturnType<typeof emptyForm>>>({});
  useEffect(() => { setDraftRows({}); setEditing(null); setDeleting(null); setBulkDeleteOpen(false); setForm(emptyForm()); }, [truckId, user?.id]);
  const { data: searchableTrucks = [], isLoading: loadingTrucks, error: truckSearchError, refetch: refetchTrucks } = useQuery({
    queryKey: ["oil-change-truck-search", user?.id, role],
    enabled: !!user && !!role,
    staleTime: 60000,
    queryFn: async () => {
      const trucks = await readAllRows(() => supabase.from("trucks")
        .select("id,truck_number,is_active,dispatcher_id,driver1_id")
        .order("truck_number").order("id"));
      const driverIds = Array.from(new Set(trucks.map(truck => truck.driver1_id).filter((id): id is string => !!id)));
      const drivers = driverIds.length ? await readAllRows(() => supabase.from("drivers")
        .select("id,first_name,last_name,dispatcher_id").in("id", driverIds).order("id")) : [];
      const driverById = new Map(drivers.map(driver => [driver.id, driver]));
      const namedTrucks = trucks.map(truck => {
        const driver = truck.driver1_id ? driverById.get(truck.driver1_id) : undefined;
        return { ...truck, driver_name: [driver?.first_name, driver?.last_name].filter(Boolean).join(" ").trim() };
      });
      // Match the service page's assignment rule, including driver fallback.
      return dispatch ? namedTrucks.filter(truck => (truck.dispatcher_id
        ?? (truck.driver1_id ? driverById.get(truck.driver1_id)?.dispatcher_id : null)) === user!.id) : namedTrucks;
    },
  });
  const queryKey = ["truck-service-log", truckId, user?.id];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey, enabled: !!truckId && !!user,
    queryFn: async () => {
      const result = await supabase.from("trucks").select("id,truck_number,source,start_miles,baseline_start_date,baseline_note,oil_spec,baseline_created_by,make,model,year,vin,engine,is_active,miles,miles_updated_at,last_oil_change_miles,oil_change_date,air_filter,last_oc_invoice,oil_change_note,samsara_account,dispatcher_id,driver1_id").eq("id", truckId!).single();
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
        readAllRows(() => supabase.from("truck_mileage_history").select("id,field,old_value,new_value,changed_at,changed_by").eq("truck_id", truckId!).order("changed_at", { ascending: true }).order("id", { ascending: true })),
        readAllRows(() => db.from("truck_service_log_entries").select("*").eq("truck_id", truckId).order("log_date", { ascending: true }).order("id", { ascending: true })),
      ]);
      const authorIds = Array.from(new Set([truck.baseline_created_by, ...history.map(e => e.changed_by), ...saved.map(e => e.created_by)].filter((id): id is string => !!id)));
      const authors = authorIds.length ? await supabase.from("profiles").select("user_id,full_name").in("user_id", authorIds) : { data: [], error: null };
      if (authors.error) throw authors.error;
      return { truck, history, saved: saved as ServiceEntry[], authors: new Map((authors.data ?? []).map(p => [p.user_id, p.full_name])) };
    },
  });
  useEffect(() => {
    if (!truckId) return;
    const refresh = () => { queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }); queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] }); };
    const channel = busChannel(refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks", filter: `id=eq.${truckId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "truck_mileage_history", filter: `truck_id=eq.${truckId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "truck_service_log_entries", filter: `truck_id=eq.${truckId}` }, refresh).subscribe();
    return () => { channel?.unsubscribe(); };
  }, [truckId, queryClient]);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const resize = () => toolbar.parentElement?.style.setProperty("--service-toolbar-height", `${toolbar.getBoundingClientRect().height}px`);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [data?.truck.id]);
  const entries = useMemo(() => data ? buildServiceEntries(data.truck, data.history, data.saved) : [], [data]);
  const summary = useMemo(() => data ? serviceSummary(data.truck, entries) : null, [data, entries]);
  const rows = useMemo(() => {
    const baseline: ServiceEntry = { id: "truck:baseline", source_key: "truck:baseline", entry_type: "Baseline Start",
      log_date: summary?.baseline?.log_date ?? null, odometer: summary?.baseline?.odometer ?? null,
      notes: summary?.baseline?.notes ?? null, oil_spec: null, facility: null, invoice: null,
      created_at: "", created_by: data?.truck.baseline_created_by ?? null, imported: true };
    return [...calculateServiceLog([baseline], data?.truck.source ?? null),
      ...calculateServiceLog(entries, data?.truck.source ?? null).filter(row => row.entry_type !== "Baseline Start")];
  }, [data, entries, summary]);
  const deletableRows = rows.filter(row => row.entry_type !== "Baseline Start");

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
      const odometer = form.odometer === "" ? null : Number(form.odometer);
      if ((!form.log_date || (odometer != null && (!Number.isSafeInteger(odometer) || odometer < 0)))) throw new Error("Enter a valid date and, if provided, a whole, non-negative odometer reading.");
      if (form.log_date > chicagoTodayISO()) throw new Error("A completed log entry cannot have a future date.");
      const payload = { truck_id: truckId, source_key: entry?.source_key ?? null,
        log_date: form.log_date, entry_type: form.entry_type,
        odometer, oil_spec: form.oil_spec.trim() || null, facility: form.facility.trim() || null,
        invoice: form.invoice.trim() || null, notes: form.notes.trim() || null };
      const existing = entry?.source_key ? data?.saved.find(e => e.source_key === entry.source_key) : entry;
      const result = existing ? await db.from("truck_service_log_entries").update(payload).eq("id", existing.id).select("id") : await db.from("truck_service_log_entries").insert(payload).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error("Entry was not saved. Check your permissions and retry.");
    },
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }); queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] }); toast({ title: "Log entry saved" }); },
    onError: (e: Error) => toast({ title: "Could not save entry", description: e.message, variant: "destructive" }),
  });
  const inlineSave = useMutation({
    mutationFn: async ({ row, key, value }: { row?: ServiceEntry; key: string; value: string }) => {
      const numeric = key === "odometer" || key === "start_miles" || key === "year";
      const parsed = numeric ? value === "" ? null : Number(value) : value.trim() || null;
      if (key === "year" && parsed != null && (!Number.isInteger(parsed) || Number(parsed) < 1000 || Number(parsed) > 9999)) throw new Error("Enter a valid four-digit model year.");
      if (numeric && parsed != null && (!Number.isSafeInteger(parsed) || Number(parsed) < 0 || Number(parsed) > (key === "start_miles" || row?.source_key === "truck:baseline" ? 2147483647 : Number.MAX_SAFE_INTEGER))) throw new Error("Enter a whole, non-negative odometer reading.");
      if ((key === "log_date" || key === "baseline_start_date") && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > chicagoTodayISO())) throw new Error("Enter a valid date that is not in the future.");
      const baselineKey: Record<string, string> = { odometer: "start_miles", log_date: "baseline_start_date", notes: "baseline_note" };
      if (!row || (row.source_key === "truck:baseline" && baselineKey[key])) {
        if (!canEditTruck) throw new Error("No permission to edit truck details.");
        const truckKey = row ? baselineKey[key] : key;
        if (["year", "make", "model", "engine"].includes(truckKey) && !canEditSpecs) throw new Error("No permission to edit truck specifications.");
        if (!["year", "make", "model", "engine", "start_miles", "baseline_start_date", "baseline_note", "oil_spec"].includes(truckKey)) throw new Error("Invalid truck field.");
        const payload = { ...(["start_miles", "baseline_start_date", "baseline_note"].includes(truckKey) ? { start_miles: summary?.baseline?.odometer ?? null, baseline_start_date: summary?.baseline?.log_date ?? null, baseline_note: summary?.baseline?.notes ?? null } : {}), [truckKey]: parsed, ...(["start_miles", "baseline_start_date", "baseline_note"].includes(truckKey) && !data?.truck.baseline_created_by && data?.truck.start_miles == null && !data?.truck.baseline_start_date && !data?.truck.baseline_note && parsed != null ? { baseline_created_by: user?.id } : {}) };
        const result = await supabase.from("trucks").update(payload).eq("id", truckId!).select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error("No permission to update this truck.");
      } else {
        if (!canEdit || (dispatch && row.entry_type !== "Mileage Check")) throw new Error("No permission to edit this entry.");
        if (key === "entry_type" && (!entryTypes.includes(value as EntryType) || (dispatch && value !== "Mileage Check"))) throw new Error("Invalid entry type.");
        const existing = row.source_key ? data?.saved.find(e => e.source_key === row.source_key) : row;
        if (!row.source_key && key === "log_date" && parsed == null) throw new Error("Date is required for manual entries.");
        if (!["log_date", "entry_type", "odometer", "oil_spec", "facility", "invoice", "notes"].includes(key)) throw new Error("Invalid log field.");
        const patch: Database["public"]["Tables"]["truck_service_log_entries"]["Update"] = { [key]: parsed };
        const payload: Database["public"]["Tables"]["truck_service_log_entries"]["Insert"] = { truck_id: truckId!, source_key: row.source_key, log_date: row.log_date, entry_type: row.entry_type, odometer: row.odometer, oil_spec: row.oil_spec, facility: row.facility, invoice: row.invoice, notes: row.notes, ...patch };
        const result = existing ? await db.from("truck_service_log_entries").update(patch).eq("id", existing.id).select("id") : await db.from("truck_service_log_entries").insert(payload).select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error("Entry was not saved. Check your permissions and retry.");
      }
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }), queryClient.invalidateQueries({ queryKey: ["trucks"] }), queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] })]);
    },
  });
  const addInlineRow = useMutation({
    mutationFn: async ({ index, key, value, pasted }: { index: number; key?: keyof ReturnType<typeof emptyForm>; value?: string; pasted?: ReturnType<typeof emptyForm>[] }) => {
      if (!canEdit || !user || !truckId) throw new Error("No permission to add log entries.");
      const drafts = pasted ?? [{ ...(draftRows[index] ?? emptyForm()), ...(key ? { [key]: value } : {}) }];
      const payloads = drafts.map(draft => {
        if (!entryTypes.includes(draft.entry_type) || draft.entry_type === "Baseline Start" || (dispatch && draft.entry_type !== "Mileage Check")) throw new Error("Invalid entry type.");
        if (draft.log_date && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.log_date) || draft.log_date > chicagoTodayISO())) throw new Error("Enter a valid date that is not in the future.");
        const odometer = draft.odometer === "" ? null : Number(draft.odometer);
        if (odometer != null && (!Number.isSafeInteger(odometer) || odometer < 0)) throw new Error("Enter a whole, non-negative odometer reading.");
        if (!draft.log_date) {
          if (pasted) throw new Error("Each pasted row needs a date.");
          setDraftRows(current => ({ ...current, [index]: draft }));
          return null;
        }
        return { truck_id: truckId, source_key: null, log_date: draft.log_date, entry_type: draft.entry_type, odometer, created_by: user.id,
          oil_spec: draft.oil_spec.trim() || null, facility: draft.facility.trim() || null,
          invoice: draft.invoice.trim() || null, notes: draft.notes.trim() || null };
      });
      if (payloads.some(payload => payload == null)) return;
      const complete = payloads.filter((payload): payload is NonNullable<typeof payload> => payload != null);
      // One database INSERT keeps the whole pasted block atomic.
      const result = await db.from("truck_service_log_entries").insert(complete.length === 1 ? complete[0] : complete).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error("Entries were not saved. Check your permissions and retry.");
      await queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }); queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
      setDraftRows(current => { const next = { ...current }; delete next[index]; return next; });
    },
  });
  const pasteSpreadsheetRow = async (event: React.ClipboardEvent<HTMLTableRowElement>, index: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return; // Ordinary single-cell paste keeps its normal behavior.
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit || pasteInFlight.current || addInlineRow.isPending || inlineSave.isPending) return;
    pasteInFlight.current = true;
    try {
      const pasted = parseServiceLogRows(text, chicagoTodayISO());
      await addInlineRow.mutateAsync({ index, pasted });
      setBlankRevision(revision => revision + 1);
      toast({ title: pasted.length === 1 ? "Spreadsheet row added" : `${pasted.length} spreadsheet rows added` });
    } catch (error) {
      toast({ title: "Could not paste row", description: error instanceof Error ? error.message : "Check the spreadsheet row and try again.", variant: "destructive" });
    } finally { pasteInFlight.current = false; }
  };
  const deleteEntry = useMutation({
    mutationFn: async (row: ServiceEntry) => {
      if (!canEdit || !truckId || !user || (dispatch && row.entry_type !== "Mileage Check") || (row.source_key === "truck:baseline" && !canEditTruck)) throw new Error("No permission to delete this entry.");
      if (row.entry_type === "Baseline Start") throw new Error("The baseline row cannot be deleted.");
      const existing = row.source_key ? data?.saved.find(entry => entry.source_key === row.source_key) : row;
      // Persist a deletion marker so generated live/history rows cannot reappear.
      const result = existing
        ? await db.from("truck_service_log_entries").update({ is_deleted: true }).eq("id", existing.id).select("id")
        : await db.from("truck_service_log_entries").insert({ truck_id: truckId, source_key: row.source_key,
          log_date: row.log_date, entry_type: row.entry_type, odometer: row.odometer, oil_spec: row.oil_spec,
          facility: row.facility, invoice: row.invoice, notes: row.notes, is_deleted: true }).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error("Entry was not deleted. Check your permissions and retry.");
    },
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }); queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      toast({ title: "Log entry deleted" });
    },
    onError: (error: Error) => toast({ title: "Could not delete entry", description: error.message, variant: "destructive" }),
  });
  const bulkDelete = useMutation({
    mutationFn: async () => {
      if (!canEditSpecs || !truckId || !user || !data) throw new Error("No permission to delete all service rows.");
      const savedIds: string[] = [];
      const markers: Database["public"]["Tables"]["truck_service_log_entries"]["Insert"][] = [];
      for (const row of deletableRows) {
        const existing = row.source_key ? data.saved.find(entry => entry.source_key === row.source_key) : row;
        if (existing) savedIds.push(existing.id);
        else markers.push({ truck_id: truckId, source_key: row.source_key, log_date: row.log_date,
          entry_type: row.entry_type, odometer: row.odometer, oil_spec: row.oil_spec,
          facility: row.facility, invoice: row.invoice, notes: row.notes, created_by: user.id, is_deleted: true });
      }
      if (markers.length) {
        const result = await db.from("truck_service_log_entries").insert(markers).select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error("Generated rows were not deleted. Retry to finish deleting rows.");
      }
      if (savedIds.length) {
        const result = await db.from("truck_service_log_entries").update({ is_deleted: true }).eq("truck_id", truckId).in("id", savedIds).select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error("Saved rows were not deleted. Retry to finish deleting rows.");
      }
    },
    onSuccess: () => { setBulkDeleteOpen(false); setDraftRows({}); setBlankRevision(value => value + 1); toast({ title: "All service log rows deleted" }); },
    onError: (error: Error) => toast({ title: "Could not delete all rows", description: error.message, variant: "destructive" }),
    onSettled: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["truck-service-log", truckId] }), queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] }), queryClient.invalidateQueries({ queryKey: ["trucks"] })]); },
  });
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading truck service log…</div>;
  if (error || !data || !summary) return <div className="p-8 space-y-4"><Link to="/live-oil-change">← Live Oil Change</Link><p role="alert">{error instanceof Error ? error.message : "Truck not found."}</p><Button onClick={() => refetch()}>Try again</Button></div>;
  const truckIndex = searchableTrucks.findIndex(truck => truck.id === truckId);
  const previousTruck = truckIndex > 0 ? searchableTrucks[truckIndex - 1] : null;
  const nextTruck = truckIndex >= 0 ? searchableTrucks[truckIndex + 1] : null;
  const navigationBusy = loadingTrucks || !!truckSearchError || inlineSave.isPending || addInlineRow.isPending || save.isPending || deleteEntry.isPending || bulkDelete.isPending;
  const truck = data.truck;
  const makeModel = [truck.make, truck.model].filter(Boolean).join(" ");
  const freshness = getMileageUpdateStatus(truck.miles_updated_at);
  const toneClass = (tone: string) => tone === "red" ? "bg-red-50 text-red-800" : tone === "yellow" ? "bg-amber-50 text-amber-800" : tone === "unknown" ? "bg-slate-50 text-slate-600" : "bg-emerald-50 text-emerald-900";
  const readinessTone = summary.status.includes("OVERDUE") || summary.status === "CHECK ODOMETER" || summary.tone === "red" ? "red" : summary.status.includes("DUE") ? "yellow" : summary.status === "MISSING SERVICE DATA" ? "unknown" : "good";
  const editable = true;
  const field = (key: keyof ReturnType<typeof emptyForm>, value: string) => setForm(current => ({ ...current, [key]: value }));
  const metadataKeys: Record<string, "oil_spec" | "baseline_start_date" | "start_miles" | "baseline_note" | "year" | "engine"> = { "Model Year": "year", "Engine Type": "engine", "Oil Specification": "oil_spec", "Baseline Start": "baseline_start_date", "Baseline Odometer": "start_miles", "Baseline Note": "baseline_note" };
  const meta = [
    ["Truck Unit", truck.truck_number], ["Model Year", truck.year ?? ""], ["Make / Model", makeModel], ["Status", truck.is_active ? "ACTIVE" : "INACTIVE"],
    ["VIN", truck.vin], ["Engine Type", truck.engine], ["Oil Specification", truck.oil_spec ?? ""], ["Service Interval", `${num(summary.interval.miles)} mi`],
    ["Telematics / ELD", truck.samsara_account ? `SAMSARA / ${truck.samsara_account}` : ""], ["Baseline Start", date(summary.baseline?.log_date ?? null)], ["Baseline Odometer", num(summary.baseline?.odometer)], ["Baseline Note", summary.baseline?.notes ?? ""],
  ];
  return <div className="truck-service-log px-2 py-6 space-y-4">
    <fieldset disabled={bulkDelete.isPending} className="m-0 min-w-0 border-0 p-0 space-y-4">
    <div ref={toolbarRef} className="service-log-toolbar flex flex-wrap items-center justify-between gap-3"><Link to="/live-oil-change" className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeft className="h-4 w-4" />Live Oil Change</Link>
      <div className="service-log-controls flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous truck" title={previousTruck ? `Previous truck: ${previousTruck.truck_number}` : "First truck"} disabled={navigationBusy || !previousTruck} onClick={() => { if (previousTruck) navigate(`/live-oil-change/${previousTruck.id}`); }}><ChevronLeft className="mr-1 h-4 w-4" />Prev</Button>
          <Button variant="outline" size="sm" aria-label="Next truck" title={nextTruck ? `Next truck: ${nextTruck.truck_number}` : "Last truck"} disabled={navigationBusy || !nextTruck} onClick={() => { if (nextTruck) navigate(`/live-oil-change/${nextTruck.id}`); }}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
        </div>
        <SearchableSelect
          value={truckId ?? ""}
          onValueChange={id => { if (id !== truckId) navigate(`/live-oil-change/${id}`); }}
          options={searchableTrucks.map(truck => ({ value: truck.id, label: `${truck.truck_number.trim()} - ${truck.driver_name || "No driver"}${truck.is_active ? "" : " (inactive)"}` }))}
          placeholder={loadingTrucks ? "Loading trucks…" : "Search truck number…"}
          searchPlaceholder="Type truck number…"
          className="w-full sm:w-64"
        />
        {canEditSpecs && <Button variant="destructive" disabled={navigationBusy || !deletableRows.length || editing != null || deleting != null} onClick={() => setBulkDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete all rows</Button>}
        {canEdit && <Button onClick={() => openEditor("new")}><Plus className="h-4 w-4 mr-2" />Add log entry</Button>}
      </div></div>
    {truckSearchError && <p role="alert" className="text-sm text-destructive">Could not load truck search. <button type="button" className="underline" onClick={() => refetchTrucks()}>Try again</button></p>}
    <div className="service-log-sheet rounded-sm border-2 border-[#233c85] bg-white text-slate-900 shadow-sm">
      <div className="service-log-sticky-header">
      <h1 className="service-log-light-title bg-[#233c85] px-4 py-3 text-center text-base font-bold tracking-wide text-white">{makeModel ? `${makeModel.toUpperCase()} · ` : ""}TRUCK {truck.truck_number} · FLEET MAINTENANCE & OIL CHANGE SYSTEM</h1>
      <div className="service-log-metadata grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-[#f5f7fb] text-xs">{meta.map(([label, value]) => <div key={label} data-meta={label} className={`${cell} relative h-10 overflow-hidden flex items-center gap-2 [&:has([data-cell-editor])]:shadow-[inset_0_0_0_2px_#217346]`}><span className="font-semibold text-slate-500 shrink-0">{label}:</span><span className="relative h-full min-w-0 font-semibold truncate flex flex-1 items-center">{label === "Make / Model" && canEditSpecs ? <span className="flex h-full min-w-0 w-full items-center gap-1"><span className="relative h-full min-w-0 flex-1"><ServiceLogCell compact label="Make" value={truck.make ?? ""} editable={canEditSpecs} disabled={inlineSave.isPending} onSave={value => inlineSave.mutateAsync({ key: "make", value })} /></span><span>/</span><span className="relative h-full min-w-0 flex-1"><ServiceLogCell compact label="Model" value={truck.model ?? ""} editable={canEditSpecs} disabled={inlineSave.isPending} onSave={value => inlineSave.mutateAsync({ key: "model", value })} /></span></span> : metadataKeys[String(label)] ? <ServiceLogCell compact label={String(label)} value={String(truck[metadataKeys[String(label)]] ?? "")} display={value} type={label === "Baseline Start" ? "date" : label === "Baseline Odometer" || label === "Model Year" ? "number" : "text"} editable={label === "Model Year" || label === "Engine Type" ? canEditSpecs : canEditTruck} disabled={inlineSave.isPending || addInlineRow.isPending} onSave={value => inlineSave.mutateAsync({ key: metadataKeys[String(label)], value })} /> : value}</span></div>)}</div>
      <div className="service-log-summary grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border-y border-[#dce3f3] my-4 text-center">
        <div className={`${cell} service-log-stat service-log-current bg-[#edf3ff]`}><p className="text-xs font-bold text-blue-800">CURRENT ODOMETER</p><p className="my-2 text-2xl font-bold text-[#233c85]">{num(summary.current)}{summary.current != null && " mi"}</p><p className="text-xs text-slate-500">Baseline: {num(summary.baseline?.odometer)}</p><p className="text-xs text-slate-500">Last update: {date(summary.currentDate)}</p></div>
        <div data-tone={summary.tone} className={`${cell} service-log-stat service-log-miles ${toneClass(summary.tone)}`}><p className="text-xs font-bold">MILES SINCE LAST OIL CHANGE</p><p className="my-2 text-2xl font-bold">{num(summary.sinceOil)}{summary.sinceOil != null && " mi"}</p><p className="text-xs">Last change: {date(summary.oilDate)}</p><p className="text-xs">PM interval target: {num(summary.interval.miles)} mi</p></div>
        <div className={`${cell} service-log-stat service-log-next bg-[#fffbea] text-amber-900`}><p className="text-xs font-bold">NEXT SERVICE DUE (ODO)</p><p className="my-2 text-2xl font-bold">{num(summary.nextDue)}{summary.nextDue != null && " mi"}</p><p className="text-xs">{summary.remaining != null ? summary.remaining < 0 ? `Overdue: ${num(-summary.remaining)} mi` : `Miles remaining: ${num(summary.remaining)} mi` : "Miles remaining:"}</p></div>
        <div data-tone={readinessTone} className={`${cell} service-log-stat service-log-readiness ${readinessTone === "good" ? "bg-emerald-50 text-emerald-900" : toneClass(readinessTone)}`}><p className="text-xs font-bold text-[#233c85]">FLEET PM READINESS</p><p className="my-2 text-xl font-bold">{summary.status}</p><p className="text-xs">Based on oil-change mileage only</p></div>
      </div>
      {freshness !== "none" && <div className={`service-log-warning mx-3 mb-4 rounded border px-3 py-2 text-xs ${freshness === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>Mileage update warning: {freshness === "red" ? "Last update is missing or more than 30 days old." : "The current mileage update cycle has not been completed."}</div>}
      </div>
      <div className="service-log-table overflow-x-auto"><table className="w-full min-w-[1585px] table-fixed border-collapse text-xs"><colgroup>{[120, 185, 104, 112, 100, 140, 175, 130, 280, 175, 64].map((width, i) => <col key={i} style={{ width }} />)}</colgroup><thead className="bg-[#233c85] text-white"><tr>{["Log Date", "Entry Type", "Total Odometer", "Miles Since Service", "Next Due (mi)", "Oil Grade / Spec", "Service Facility", "Invoice", "Notes / Telematics", "Added By", ""].map((name, i) => <th key={i} className={`${cell} py-2 text-left font-semibold`}>{name}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className={row.entry_type === "Baseline Start" ? "bg-[#abc6f0]" : row.entry_type !== "Mileage Check" ? "bg-[#effbf4] text-emerald-900 font-semibold" : "even:bg-[#f7f9fd]"}>
          {(["log_date", "entry_type", "odometer"] as const).map(key => <td key={key} className={`${editableCell} ${key === "odometer" ? "text-right tabular-nums" : "whitespace-nowrap"}`}><ServiceLogCell label={`${key} ${row.id}`} value={String(row[key] ?? "")} display={key === "log_date" ? date(row.log_date) : key === "odometer" ? num(row.odometer) : <span className="service-entry-type" data-type={row.entry_type}>{row.entry_type}</span>} type={key === "log_date" ? "date" : key === "odometer" ? "number" : "text"} options={key === "entry_type" ? entryTypes.filter(type => type !== "Baseline Start" && (!dispatch || type === "Mileage Check")) : undefined} editable={row.source_key === "truck:baseline" ? key !== "entry_type" && canEditTruck : canEdit && (!dispatch || row.entry_type === "Mileage Check")} disabled={inlineSave.isPending || addInlineRow.isPending} onSave={value => inlineSave.mutateAsync({ row, key, value })} /></td>)}
          <td data-mileage-tone={mileageTone(row.miles_since_service, truck.source)} className={`${cell} h-7 overflow-hidden whitespace-nowrap text-right tabular-nums ${mileageTone(row.miles_since_service, truck.source) === "red" ? "bg-red-50 text-red-800 font-bold" : mileageTone(row.miles_since_service, truck.source) === "yellow" ? "bg-amber-50 text-amber-800 font-bold" : ""}`}>{num(row.miles_since_service)}</td><td className={`${cell} h-7 overflow-hidden whitespace-nowrap text-right`}>{num(row.next_due)}</td>
          {(["oil_spec", "facility", "invoice", "notes"] as const).map(key => <td key={key} className={`${editableCell} ${key === "notes" ? "whitespace-nowrap" : ""}`}><ServiceLogCell label={`${key} ${row.id}`} value={row[key] ?? ""} editable={row.source_key === "truck:baseline" ? key === "notes" && canEditTruck : canEdit && (!dispatch || row.entry_type === "Mileage Check")} disabled={inlineSave.isPending || addInlineRow.isPending} onSave={value => inlineSave.mutateAsync({ row, key, value })} /></td>)}
          <td className={`${cell} h-7 overflow-hidden whitespace-nowrap truncate`}>{row.created_by ? data.authors.get(row.created_by) ?? "" : ""}</td>
          <td className="h-7 border border-[#dce3f3] px-1 py-0"><div className="flex items-center justify-center gap-1">
            {canEdit && row.source_key !== "truck:baseline" && (!dispatch || row.entry_type === "Mileage Check") && <button type="button" title="Edit log details" aria-label={`Edit ${row.entry_type} ${date(row.log_date)}`} onClick={() => openEditor(row)} className="p-1 hover:bg-blue-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>}
            {canEdit && (!dispatch || row.entry_type === "Mileage Check") && row.entry_type !== "Baseline Start" && <button type="button" title="Delete log entry" aria-label={`Delete ${row.entry_type} ${date(row.log_date)}`} disabled={deleteEntry.isPending || inlineSave.isPending || addInlineRow.isPending} onClick={() => setDeleting(row)} className="p-1 text-red-700 hover:bg-red-100 rounded disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div></td>
        </tr>)}
        {Array.from({ length: Math.max(3, 12 - rows.length, ...Object.keys(draftRows).map(index => Number(index) + 1)) }, (_, i) => <tr key={`blank:${i}:${blankRevision}`} onPasteCapture={event => { void pasteSpreadsheetRow(event, i); }} className="even:bg-[#f7f9fd]">
          {(["log_date", "entry_type", "odometer", null, null, "oil_spec", "facility", "invoice", "notes", null, null] as const).map((key, j) => <td key={j} className={`${key ? editableCell : `${cell} h-7`} ${key === "odometer" ? "text-right tabular-nums" : ""}`}>
            {key && <ServiceLogCell label={`New row ${i + 1} ${key}`} value={draftRows[i]?.[key] ?? ""} display={key === "log_date" ? date(draftRows[i]?.log_date ?? null) : key === "odometer" ? num(draftRows[i]?.odometer ? Number(draftRows[i].odometer) : null) : draftRows[i]?.[key] ?? ""} type={key === "log_date" ? "date" : key === "odometer" ? "number" : "text"} options={key === "entry_type" ? ["", ...entryTypes.filter(type => type !== "Baseline Start" && (!dispatch || type === "Mileage Check"))] : undefined} editable={canEdit} disabled={inlineSave.isPending || addInlineRow.isPending} onSave={value => addInlineRow.mutateAsync({ index: i, key, value })} />}
          </td>)}
        </tr>)}

      </tbody></table></div>
    </div>
    {canEdit && <p className="text-xs text-muted-foreground">Paste Excel or Google Sheets rows into any empty row, starting with Log Date. Miles Since Service and Next Due are calculated automatically. Dated entries save automatically, even without an odometer; add the reading later to calculate mileage.</p>}
    {Object.keys(draftRows).length > 0 && <p className="text-xs text-muted-foreground">Enter a log date to save the row. Total odometer can be added later; mileage calculations stay blank until it is entered.</p>}

    </fieldset>
    <Dialog open={bulkDeleteOpen} onOpenChange={open => { if (!bulkDelete.isPending) setBulkDeleteOpen(open); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete all service log rows?</DialogTitle></DialogHeader>
      <p className="text-sm">Delete all {deletableRows.length} service rows from truck {truck.truck_number}'s service log? The Baseline Start row, baseline values, current odometer, and other truck details will be kept.</p>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={bulkDelete.isPending} onClick={() => setBulkDeleteOpen(false)}>Cancel</Button><Button variant="destructive" disabled={bulkDelete.isPending || !deletableRows.length} onClick={() => bulkDelete.mutate()}>{bulkDelete.isPending ? "Deleting…" : "Confirm delete all rows"}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={deleting != null} onOpenChange={open => { if (!open && !deleteEntry.isPending) setDeleting(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete log entry?</DialogTitle></DialogHeader>
      <p className="text-sm">Delete {deleting?.entry_type} {date(deleting?.log_date ?? null)} from truck {truck.truck_number}'s service log?</p>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={deleteEntry.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteEntry.isPending} onClick={() => { if (deleting) deleteEntry.mutate(deleting); }}>{deleteEntry.isPending ? "Deleting…" : "Delete entry"}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={editing != null} onOpenChange={open => { if (!open && !save.isPending) setEditing(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing === "new" ? "Add log entry" : "Edit log details"} · Truck {truck.truck_number}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Log date<Input type="date" value={form.log_date} max={chicagoTodayISO()} disabled={!editable} required={editable} onChange={e => field("log_date", e.target.value)} /></label><label className="text-sm">Entry type<select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.entry_type} disabled={!editable} onChange={e => field("entry_type", e.target.value)}>{entryTypes.filter(type => type !== "Baseline Start" && (!dispatch || type === "Mileage Check")).map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="text-sm">Total odometer<Input type="number" min="0" step="1" value={form.odometer} disabled={!editable} onChange={e => field("odometer", e.target.value)} /></label><label className="text-sm">Oil grade / specification<Input value={form.oil_spec} onChange={e => field("oil_spec", e.target.value)} placeholder="" /></label>
          <label className="text-sm">Service facility<Input value={form.facility} onChange={e => field("facility", e.target.value)} /></label><label className="text-sm">Invoice<Input value={form.invoice} onChange={e => field("invoice", e.target.value)} /></label></div>
        <label className="block text-sm">Notes / telematics<Textarea value={form.notes} onChange={e => field("notes", e.target.value)} rows={3} /></label>

        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}><X className="h-4 w-4 mr-1" />Cancel</Button><Button type="submit" disabled={save.isPending}><Save className="h-4 w-4 mr-1" />{save.isPending ? "Saving…" : "Save entry"}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
