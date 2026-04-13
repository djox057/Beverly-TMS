import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { format } from "date-fns";
import { Plus, Trash2, Search, CalendarIcon, Check, ChevronsUpDown, CheckCircle2, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface InspectionRow {
  id: string;
  truck_id: string | null;
  driver_id: string | null;
  dispatcher_id: string | null;
  maintenance_check_yard: string | null;
  maintenance_check_road: string | null;
  eta_datetime: string | null;
  reason: string | null;
  inspection_level: number | null;
  roadside_inspection_date: string | null;
  location: string | null;
  created_by: string | null;
  created_at: string;
  truck_number?: string;
  driver_name?: string;
  dispatcher_name?: string;
}

type EditingField = "maintenance_check_yard" | "maintenance_check_road" | "eta_datetime" | "reason" | "inspection_level" | "roadside_inspection_date";
type EditingCell = { id: string; field: EditingField } | null;

const RoadsideInspection = () => {
  const { user, hasRole } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [truckPopoverOpen, setTruckPopoverOpen] = useState(false);
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editTime, setEditTime] = useState<string>("");
  const editReasonRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = hasRole("admin") || hasRole("safety") || hasRole("maintenance");
  const canEditEta = hasRole("admin") || hasRole("dispatch");

  // Add form state
  const [formTruckId, setFormTruckId] = useState("");
  const [formDriverId, setFormDriverId] = useState("");
  const [formMaintenanceCheckYard, setFormMaintenanceCheckYard] = useState<Date | undefined>();
  const [formMaintenanceCheckRoad, setFormMaintenanceCheckRoad] = useState<Date | undefined>();
  const [formReason, setFormReason] = useState("");
  const [formLevel, setFormLevel] = useState<string>("");
  const [formRoadsideDate, setFormRoadsideDate] = useState<Date | undefined>();
  const [formEtaDate, setFormEtaDate] = useState<Date | undefined>();
  const [formEtaTime, setFormEtaTime] = useState<string>("");
  
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const { data: profiles } = useQuery({
    queryKey: ["roadside-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });

  const { data: inspections, isLoading } = useQuery({
    queryKey: ["roadside-inspections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("roadside_inspections")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      return (data || []) as InspectionRow[];
    },
  });

  const profileMap = useMemo(() => new Map(profiles?.map(p => [p.user_id, p.full_name]) || []), [profiles]);
  const truckMap = useMemo(() => new Map(trucks?.map((t: any) => [t.id, t.truck_number]) || []), [trucks]);
  const driverMap = useMemo(() => new Map(drivers?.map((d: any) => [d.id, d.name]) || []), [drivers]);
  const driverDispatcherMap = useMemo(() => new Map(drivers?.map((d: any) => [d.id, d.dispatcher_id]) || []), [drivers]);

  const isDispatchOnly = hasRole("dispatch") && !hasRole("admin") && !hasRole("safety") && !hasRole("maintenance") && !hasRole("manager") && !hasRole("supervisor");

  const enriched = useMemo(() => {
    const rows = (inspections || []).map(row => ({
      ...row,
      truck_number: row.truck_id ? truckMap.get(row.truck_id) || "—" : "—",
      driver_name: row.driver_id ? driverMap.get(row.driver_id) || "—" : "—",
      dispatcher_name: row.dispatcher_id ? profileMap.get(row.dispatcher_id) || "—" : "—",
    }));
    if (isDispatchOnly && user?.id) {
      const myDriverIds = new Set(drivers?.filter((d: any) => d.dispatcher_id === user.id).map((d: any) => d.id) || []);
      const myTruckIds = new Set(trucks?.filter((t: any) => myDriverIds.has(t.driver1_id) || myDriverIds.has(t.driver2_id)).map((t: any) => t.id) || []);
      return rows.filter(r => (r.driver_id && myDriverIds.has(r.driver_id)) || (r.truck_id && myTruckIds.has(r.truck_id)));
    }
    return rows;
  }, [inspections, truckMap, driverMap, profileMap, isDispatchOnly, user?.id, drivers, trucks]);

  const filtered = useMemo(() => {
    if (!search) return enriched;
    const s = search.toLowerCase();
    return enriched.filter(r =>
      r.truck_number?.toLowerCase().includes(s) ||
      r.driver_name?.toLowerCase().includes(s) ||
      r.dispatcher_name?.toLowerCase().includes(s) ||
      r.reason?.toLowerCase().includes(s)
    );
  }, [enriched, search]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const reason = reasonRef.current?.value || formReason;
      const driverId = formDriverId || null;
      const dispatcherId = driverId ? driverDispatcherMap.get(driverId) || null : null;
      const etaValue = formEtaDate && formEtaTime
        ? (() => {
            const pad = (n: number) => String(n).padStart(2, "0");
            const yr = formEtaDate.getFullYear();
            const mo = pad(formEtaDate.getMonth() + 1);
            const dy = pad(formEtaDate.getDate());
            return `${yr}-${mo}-${dy}T${formEtaTime}:00`;
          })()
        : null;
      const { error } = await supabase.from("roadside_inspections").insert({
        truck_id: formTruckId || null,
        driver_id: driverId,
        dispatcher_id: dispatcherId,
        maintenance_check_yard: formMaintenanceCheckYard ? format(formMaintenanceCheckYard, "yyyy-MM-dd") : null,
        maintenance_check_road: formMaintenanceCheckRoad ? format(formMaintenanceCheckRoad, "yyyy-MM-dd") : null,
        eta_datetime: etaValue,
        reason: reason || null,
        inspection_level: formLevel && formLevel !== "none" ? parseInt(formLevel) : null,
        roadside_inspection_date: formRoadsideDate ? format(formRoadsideDate, "yyyy-MM-dd") : null,
        location: null,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadside-inspections"] });
      toast({ title: "Inspection added" });
      resetForm();
      setAddOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roadside_inspections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadside-inspections"] });
      toast({ title: "Inspection deleted" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value, clearField }: { id: string; field: string; value: any; clearField?: string }) => {
      const updateData: any = { [field]: value };
      if (clearField) updateData[clearField] = null;
      const { error } = await supabase.from("roadside_inspections").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadside-inspections"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = useCallback(() => {
    setFormTruckId("");
    setFormDriverId("");
    setFormMaintenanceCheckYard(undefined);
    setFormMaintenanceCheckRoad(undefined);
    setFormReason("");
    setFormLevel("");
    setFormRoadsideDate(undefined);
    setFormEtaDate(undefined);
    setFormEtaTime("");
  }, []);

  const handleTruckChange = (truckId: string) => {
    setFormTruckId(truckId);
    const truck = trucks?.find((t: any) => t.id === truckId);
    if (truck?.driver1_id) setFormDriverId(truck.driver1_id);
  };

  const handleDriverChange = (driverId: string) => {
    setFormDriverId(driverId);
    const truck = trucks?.find((t: any) => t.driver1_id === driverId || t.driver2_id === driverId);
    if (truck) setFormTruckId(truck.id);
  };

  const startEditing = (row: InspectionRow, field: EditingField) => {
    if (field === "eta_datetime") {
      if (!canEditEta) return;
    } else {
      if (!canEdit) return;
    }
    setEditingCell({ id: row.id, field });
    if (field === "maintenance_check_yard") {
      setEditDate(row.maintenance_check_yard ? new Date(row.maintenance_check_yard + "T00:00:00") : undefined);
    } else if (field === "maintenance_check_road") {
      setEditDate(row.maintenance_check_road ? new Date(row.maintenance_check_road + "T00:00:00") : undefined);
    } else if (field === "eta_datetime") {
      if (row.eta_datetime) {
        // Parse the stored string directly without timezone conversion
        const raw = row.eta_datetime.replace(/Z$|[+-]\d{2}:\d{2}$/, '');
        const [datePart, timePart] = raw.includes('T') ? raw.split('T') : raw.split(' ');
        const [yr, mo, dy] = datePart.split('-').map(Number);
        const [hh, mm] = (timePart || '00:00').split(':').map(Number);
        setEditDate(new Date(yr, mo - 1, dy));
        setEditTime(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      } else {
        setEditDate(undefined);
        setEditTime("");
      }
    } else if (field === "roadside_inspection_date") {
      setEditDate(row.roadside_inspection_date ? new Date(row.roadside_inspection_date + "T00:00:00") : undefined);
    } else if (field === "reason") {
      setEditValue(row.reason || "");
    } else if (field === "inspection_level") {
      setEditValue(row.inspection_level != null ? String(row.inspection_level) : "none");
    }
  };

  const saveInlineEdit = () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    let value: any;
    let clearField: string | undefined;

    if (field === "maintenance_check_yard" || field === "maintenance_check_road") {
      value = editDate ? format(editDate, "yyyy-MM-dd") : null;
      // If setting one, clear the other
      if (value) {
        clearField = field === "maintenance_check_yard" ? "maintenance_check_road" : "maintenance_check_yard";
      }
    } else if (field === "eta_datetime") {
      if (editDate && editTime) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const yr = editDate.getFullYear();
        const mo = pad(editDate.getMonth() + 1);
        const dy = pad(editDate.getDate());
        value = `${yr}-${mo}-${dy}T${editTime}:00`;
      } else {
        value = null;
      }
    } else if (field === "roadside_inspection_date") {
      value = editDate ? format(editDate, "yyyy-MM-dd") : null;
    } else if (field === "reason") {
      const v = editReasonRef.current?.value ?? editValue;
      value = v || null;
    } else if (field === "inspection_level") {
      value = editValue && editValue !== "none" ? parseInt(editValue) : null;
    }
    updateMutation.mutate({ id, field, value, clearField });
    setEditingCell(null);
  };

  const cancelEdit = () => setEditingCell(null);

  const activeTrucks = useMemo(() => (trucks || []).filter((t: any) => t.status !== "inactive").sort((a: any, b: any) => (a.truck_number || "").localeCompare(b.truck_number || "", undefined, { numeric: true })), [trucks]);
  const activeDrivers = useMemo(() => (drivers || []).filter((d: any) => d.is_active).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")), [drivers]);

  const renderEditableCell = (row: typeof filtered[0], field: EditingField) => {
    const isEditing = editingCell?.id === row.id && editingCell?.field === field;

    if (isEditing) {
      if (field === "eta_datetime") {
        return (
          <Popover defaultOpen onOpenChange={(open) => { if (!open) saveInlineEdit(); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-8 text-xs", !editDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {editDate && editTime ? `${format(editDate, "MM/dd/yyyy")} ${editTime}` : "Pick date/time"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editDate} onSelect={(d) => { setEditDate(d); }} className="p-3 pointer-events-auto" />
              <div className="px-3 pb-2">
                <label className="text-xs font-medium">Time (24h)</label>
                <Input
                  placeholder="HH:MM"
                  value={editTime}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^\d:]/g, '');
                    // Auto-insert colon after 2 digits
                    if (v.length === 2 && !v.includes(':')) v += ':';
                    if (v.length > 5) v = v.slice(0, 5);
                    setEditTime(v);
                  }}
                  className="h-8 text-xs font-mono"
                  maxLength={5}
                />
              </div>
              <div className="flex justify-end gap-1 p-2 border-t">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditDate(undefined); setEditTime(""); }}>Clear</Button>
                <Button size="sm" className="h-7 text-xs" onClick={saveInlineEdit}>Save</Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      }
      if (field === "maintenance_check_yard" || field === "maintenance_check_road" || field === "roadside_inspection_date") {
        return (
          <Popover defaultOpen onOpenChange={(open) => { if (!open) saveInlineEdit(); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-8 text-xs", !editDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {editDate ? format(editDate, "MM/dd/yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editDate} onSelect={(d) => { setEditDate(d); }} className="p-3 pointer-events-auto" />
              <div className="flex justify-end gap-1 p-2 border-t">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditDate(undefined); }}>Clear</Button>
                <Button size="sm" className="h-7 text-xs" onClick={saveInlineEdit}>Save</Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      }
      if (field === "reason") {
        return (
          <div className="flex flex-col gap-1">
            <Textarea
              ref={editReasonRef}
              defaultValue={editValue}
              rows={2}
              className="text-xs min-h-[50px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEdit();
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveInlineEdit(); }
              }}
            />
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={cancelEdit}>Cancel</Button>
              <Button size="sm" className="h-6 text-xs px-2" onClick={saveInlineEdit}>Save</Button>
            </div>
          </div>
        );
      }
      if (field === "inspection_level") {
        return (
          <Select value={editValue} onValueChange={(v) => { setEditValue(v); }}>
            <SelectTrigger className="h-8 text-xs w-[70px]" autoFocus>
              <SelectValue />
            </SelectTrigger>
            <SelectContent onCloseAutoFocus={() => saveInlineEdit()}>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        );
      }
    }

    // Display mode
    let display: string;
    if (field === "maintenance_check_yard") {
      display = row.maintenance_check_yard ? format(new Date(row.maintenance_check_yard + "T00:00:00"), "MM/dd/yyyy") : "—";
    } else if (field === "maintenance_check_road") {
      display = row.maintenance_check_road ? format(new Date(row.maintenance_check_road + "T00:00:00"), "MM/dd/yyyy") : "—";
    } else if (field === "eta_datetime") {
      if (row.eta_datetime) {
        // Parse stored string directly, no timezone conversion
        const raw = row.eta_datetime.replace(/Z$|[+-]\d{2}:\d{2}$/, '');
        const [datePart, timePart] = raw.includes('T') ? raw.split('T') : raw.split(' ');
        const [yr, mo, dy] = datePart.split('-').map(Number);
        const [hh, mm] = (timePart || '00:00').split(':').map(Number);
        display = `${String(mo).padStart(2, "0")}/${String(dy).padStart(2, "0")}/${yr} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      } else {
        display = "—";
      }
    } else if (field === "roadside_inspection_date") {
      display = row.roadside_inspection_date ? format(new Date(row.roadside_inspection_date + "T00:00:00"), "MM/dd/yyyy") : "—";
    } else if (field === "reason") {
      display = row.reason || "—";
    } else {
      display = row.inspection_level != null ? String(row.inspection_level) : "—";
    }

    const editable = field === "eta_datetime" ? canEditEta : canEdit;
    if (editable) {
      return (
        <span className="cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 -mx-1 transition-colors" onClick={() => startEditing(row, field)}>
          {display}
        </span>
      );
    }

    return display;
  };

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Roadside Inspection</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative w-[280px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No inspections found.</p>
          ) : (
            <div className="border rounded-md">
              <Table style={{ tableLayout: "fixed", width: "100%" }}>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 90 }}>Truck#</TableHead>
                    <TableHead style={{ width: 160 }}>Driver Name</TableHead>
                    <TableHead style={{ width: 140 }}>Dispatch</TableHead>
                    <TableHead style={{ width: 150 }}>Maint. Safety Check Yard</TableHead>
                    <TableHead style={{ width: 150 }}>Maint. Safety Check Road</TableHead>
                    <TableHead style={{ width: 150 }}>ETA</TableHead>
                    <TableHead style={{ width: 200 }}>Maintenance Note</TableHead>
                    <TableHead style={{ width: 150 }}>Roadside Inspection</TableHead>
                    <TableHead style={{ width: 70 }} className="text-center">Level</TableHead>
                    {hasRole("admin") && <TableHead style={{ width: 50 }} />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.truck_number}</TableCell>
                      <TableCell>{row.driver_name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.dispatcher_name}</TableCell>
                      <TableCell>{renderEditableCell(row, "maintenance_check_yard")}</TableCell>
                      <TableCell>{renderEditableCell(row, "maintenance_check_road")}</TableCell>
                      <TableCell>{renderEditableCell(row, "eta_datetime")}</TableCell>
                      <TableCell className="text-sm">{renderEditableCell(row, "reason")}</TableCell>
                      <TableCell>{renderEditableCell(row, "roadside_inspection_date")}</TableCell>
                      <TableCell className="text-center font-semibold">{renderEditableCell(row, "inspection_level")}</TableCell>
                      
                      {hasRole("admin") && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteId(row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={o => { if (!o) { resetForm(); setAddOpen(false); } else setAddOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Roadside Inspection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Truck</label>
              <Popover open={truckPopoverOpen} onOpenChange={setTruckPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {formTruckId ? activeTrucks.find((t: any) => t.id === formTruckId)?.truck_number || "Select truck" : "Select truck"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search truck..." />
                    <CommandList>
                      <CommandEmpty>No truck found.</CommandEmpty>
                      <CommandGroup>
                        {activeTrucks.map((t: any) => (
                          <CommandItem key={t.id} value={t.truck_number} onSelect={() => { handleTruckChange(t.id); setTruckPopoverOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", formTruckId === t.id ? "opacity-100" : "opacity-0")} />
                            {t.truck_number}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Driver</label>
              <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {formDriverId ? activeDrivers.find((d: any) => d.id === formDriverId)?.name || "Select driver" : "Select driver"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search driver..." />
                    <CommandList>
                      <CommandEmpty>No driver found.</CommandEmpty>
                      <CommandGroup>
                        {activeDrivers.map((d: any) => (
                          <CommandItem key={d.id} value={d.name} onSelect={() => { handleDriverChange(d.id); setDriverPopoverOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", formDriverId === d.id ? "opacity-100" : "opacity-0")} />
                            {d.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Maintenance Safety Check Yard</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formMaintenanceCheckYard && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formMaintenanceCheckYard ? format(formMaintenanceCheckYard, "MM/dd/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formMaintenanceCheckYard} onSelect={(d) => { setFormMaintenanceCheckYard(d); if (d) setFormMaintenanceCheckRoad(undefined); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Maintenance Safety Check On Road</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formMaintenanceCheckRoad && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formMaintenanceCheckRoad ? format(formMaintenanceCheckRoad, "MM/dd/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formMaintenanceCheckRoad} onSelect={(d) => { setFormMaintenanceCheckRoad(d); if (d) setFormMaintenanceCheckYard(undefined); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">ETA (Chicago Time)</label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !formEtaDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formEtaDate ? format(formEtaDate, "MM/dd/yyyy") : "Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formEtaDate} onSelect={setFormEtaDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Input
                  placeholder="HH:MM"
                  value={formEtaTime}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^\d:]/g, '');
                    if (v.length === 2 && !v.includes(':')) v += ':';
                    if (v.length > 5) v = v.slice(0, 5);
                    setFormEtaTime(v);
                  }}
                  className="w-[120px] font-mono"
                  maxLength={5}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Maintenance Note</label>
              <Textarea ref={reasonRef} defaultValue={formReason} placeholder="Enter note..." rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium">Roadside Inspection Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formRoadsideDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formRoadsideDate ? format(formRoadsideDate, "MM/dd/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formRoadsideDate} onSelect={setFormRoadsideDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Inspection Level</label>
              <Select value={formLevel} onValueChange={setFormLevel}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setAddOpen(false); }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete inspection?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RoadsideInspection;
