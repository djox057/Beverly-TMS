import { useMemo, useState } from "react";
import { Plus, Wrench } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useChicagoToday, useMandatoryYardRepairs, YARD_REPAIR_EDIT_ROLES, type YardRepair, type YardRepairInput } from "@/hooks/useMandatoryYardRepairs";
import { SERVICE_LABELS, STATUS_LABELS, formatDueDate, isOpenRepair, isPastDue, type ServiceType, type RepairStatus } from "@/lib/yardRepairDue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const emptyTask = (): YardRepairInput => ({ truck_id: "", driver_id: null, service_type: "mandatory_yard_repair", description: "", due_date: "", status: "pending", status_note: "", dispatch_informed: false });

export default function MandatoryYardRepair() {
  const { roles } = useAuthContext();
  const canEdit = roles.some(role => YARD_REPAIR_EDIT_ROLES.some(allowed => allowed === role));
  const { tasks, save, isLoading, isError, refetch } = useMandatoryYardRepairs();
  const { data: trucks = [], isLoading: trucksLoading, isError: trucksError } = useTrucks();
  const { data: drivers = [], isLoading: driversLoading, isError: driversError } = useDrivers();
  const today = useChicagoToday();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<YardRepair | null>(null);
  const [form, setForm] = useState<YardRepairInput>(emptyTask);
  const truckMap = useMemo(() => new Map(trucks.map(t => [t.id, t])), [trucks]);
  const driverMap = useMemo(() => new Map(drivers.map(d => [d.id, d])), [drivers]);
  const dispatcherName = (truckId: string) => {
    const truck = truckMap.get(truckId);
    return truck?.dispatcher?.full_name || driverMap.get(truck?.driver1_id)?.dispatcher_info?.full_name || "—";
  };
  const filtered = tasks.filter(task => {
    if (statusFilter === "open" && !isOpenRepair(task.status)) return false;
    if (statusFilter === "overdue" && !(isOpenRepair(task.status) && isPastDue(task.due_date, today))) return false;
    if (!["all", "open", "overdue"].includes(statusFilter) && task.status !== statusFilter) return false;
    return [truckMap.get(task.truck_id)?.truck_number, driverMap.get(task.driver_id)?.name, task.description, task.status_note, task.reported_by_name, dispatcherName(task.truck_id), SERVICE_LABELS[task.service_type]].join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 100) - 1));
  const openDialog = (task?: YardRepair) => {
    setEditing(task || null);
    setForm(task ? { truck_id: task.truck_id, driver_id: task.driver_id, service_type: task.service_type, description: task.description, due_date: task.due_date, status: task.status, status_note: task.status_note, dispatch_informed: task.dispatch_informed } : emptyTask());
    setDialogOpen(true);
  };
  const patch = <K extends keyof YardRepairInput>(key: K, value: YardRepairInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const selectDriver = (id: string) => {
    const assigned = trucks.filter(t => t.driver1_id === id || t.driver2_id === id);
    setForm(previous => ({ ...previous, driver_id: id || null, truck_id: assigned.find(t => t.id === previous.truck_id)?.id || (assigned.length === 1 ? assigned[0].id : "") }));
  };
  const selectTruck = (id: string) => {
    const truck = truckMap.get(id);
    setForm(previous => ({ ...previous, truck_id: id, driver_id: previous.driver_id && [truck?.driver1_id, truck?.driver2_id].includes(previous.driver_id) ? previous.driver_id : truck?.driver1_id || truck?.driver2_id || null }));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Wrench className="h-6 w-6" />Mandatory Yard Repair</h1><p className="text-sm text-muted-foreground">Track required repairs, DOT and oil-change deadlines.</p></div>
        {canEdit && <Button onClick={() => openDialog()} disabled={trucksLoading || driversLoading || trucksError || driversError}><Plus className="mr-2 h-4 w-4" />Add Task</Button>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input aria-label="Search repair tasks" placeholder="Search unit, driver, dispatch or description..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="max-w-md" />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}><SelectTrigger className="w-44" aria-label="Status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open Tasks</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="all">All Tasks</SelectItem>{Object.entries(STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
        <span className="self-center text-sm text-muted-foreground">{filtered.length} tasks</span>
      </div>
      {(isError || trucksError || driversError) && <div className="rounded border border-destructive p-3 text-sm text-destructive">Could not load repair tasks or assignments. <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>Retry Tasks</Button></div>}
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[1250px] text-xs"><TableHeader><TableRow>{["Unit", "Driver", "Type", "Description of the Problem", "Due Date", "Reported Date", "Dispatch", "Dispatch Informed", "Status", "Status Note", "Reported By", ...(canEdit ? [""] : [])].map((label, i) => <TableHead key={i}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {isLoading || trucksLoading || driversLoading ? <TableRow><TableCell colSpan={canEdit ? 12 : 11} className="py-8 text-center">Loading...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 12 : 11} className="py-8 text-center text-muted-foreground">{isError ? "Tasks unavailable" : "No tasks found"}</TableCell></TableRow> : filtered.slice(safePage * 100, (safePage + 1) * 100).map(task => {
              const overdue = isOpenRepair(task.status) && isPastDue(task.due_date, today);
              return <TableRow key={task.id} className={task.status === "completed" ? "bg-green-50 dark:bg-green-950/20" : overdue ? "bg-red-50 dark:bg-red-950/20" : undefined}>
                <TableCell className={`font-semibold ${overdue && task.service_type !== "oil_change" ? "text-red-600" : ""}`}>{truckMap.get(task.truck_id)?.truck_number || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{driverMap.get(task.driver_id)?.name || "—"}</TableCell><TableCell>{SERVICE_LABELS[task.service_type]}</TableCell>
                <TableCell className="min-w-52 max-w-80 whitespace-pre-wrap break-words">{task.description}</TableCell>
                <TableCell className={`whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>{formatDueDate(task.due_date)}{overdue && <div className="text-[10px]">Overdue</div>}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDueDate(task.reported_date)}</TableCell><TableCell>{dispatcherName(task.truck_id)}</TableCell>
                <TableCell>{task.dispatch_informed ? "Yes" : "No"}</TableCell><TableCell>{STATUS_LABELS[task.status]}</TableCell><TableCell className="min-w-40 max-w-72 whitespace-pre-wrap break-words">{task.status_note || "—"}</TableCell><TableCell>{task.reported_by_name}</TableCell>
                {canEdit && <TableCell><Button variant="ghost" size="sm" onClick={() => openDialog(task)}>Edit</Button></TableCell>}
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
      {filtered.length > 100 && <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</Button>Page {safePage + 1} of {Math.ceil(filtered.length / 100)}<Button variant="outline" size="sm" disabled={(safePage + 1) * 100 >= filtered.length} onClick={() => setPage(safePage + 1)}>Next</Button></div>}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!save.isPending) setDialogOpen(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Edit Task" : "Add Task"}</DialogTitle><DialogDescription>Reported date and reporter are recorded automatically. Dates use Chicago time.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (!canEdit || !form.truck_id || !form.driver_id || !form.description.trim() || !form.due_date) return; try { await save.mutateAsync({ id: editing?.id, values: { ...form, description: form.description.trim() } }); setDialogOpen(false); } catch { /* Mutation displays the error; retain input. */ } }}>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label>Driver *</Label><Combobox value={form.driver_id || ""} options={drivers.map(d => ({ value: d.id, label: d.name }))} onValueChange={selectDriver} placeholder="Select driver" /></div><div className="space-y-1"><Label>Unit *</Label><Combobox value={form.truck_id} options={trucks.map(t => ({ value: t.id, label: t.truck_number }))} onValueChange={selectTruck} placeholder="Select truck" /></div></div>
          <p className="text-xs text-muted-foreground">Dispatch: {dispatcherName(form.truck_id)}</p>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label>Type</Label><Select value={form.service_type} onValueChange={v => patch("service_type", v as ServiceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SERVICE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label htmlFor="repair-due">Due Date *</Label><Input id="repair-due" type="date" required value={form.due_date} onChange={e => patch("due_date", e.target.value)} /></div></div>
          <div className="space-y-1"><Label htmlFor="repair-description">Description of the Problem *</Label><Textarea id="repair-description" required value={form.description} onChange={e => patch("description", e.target.value)} /></div>
          <div className="space-y-1"><Label>Status</Label><Select value={form.status} onValueChange={v => patch("status", v as RepairStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="repair-note">Status Note</Label><Textarea id="repair-note" value={form.status_note} onChange={e => patch("status_note", e.target.value)} /></div>
          <div className="flex items-center gap-2"><Checkbox id="repair-informed" checked={form.dispatch_informed} onCheckedChange={v => patch("dispatch_informed", v === true)} /><Label htmlFor="repair-informed">Dispatch was informed</Label></div>
          <div className="text-xs text-muted-foreground">Reported: {formatDueDate(editing?.reported_date || today)}{editing && ` · ${editing.reported_by_name}`}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending || !form.truck_id || !form.driver_id || !form.description.trim() || !form.due_date}>{save.isPending ? "Saving..." : "Save Task"}</Button></div>
        </form>
      </DialogContent></Dialog>
    </div>
  );
}
