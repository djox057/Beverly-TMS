import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { format } from "date-fns";
import { Plus, Trash2, Search, CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface InspectionRow {
  id: string;
  truck_id: string | null;
  driver_id: string | null;
  dispatcher_id: string | null;
  maintenance_check: string | null;
  reason: string | null;
  inspection_level: number | null;
  created_by: string | null;
  created_at: string;
  // enriched
  truck_number?: string;
  driver_name?: string;
  dispatcher_name?: string;
}

const RoadsideInspection = () => {
  const { user, hasRole } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Add form state
  const [formTruckId, setFormTruckId] = useState("");
  const [formDriverId, setFormDriverId] = useState("");
  const [formMaintenanceCheck, setFormMaintenanceCheck] = useState<Date | undefined>();
  const [formReason, setFormReason] = useState("");
  const [formLevel, setFormLevel] = useState<string>("");

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
        .order("created_at", { ascending: false });
      return (data || []) as InspectionRow[];
    },
  });

  const profileMap = useMemo(() => new Map(profiles?.map(p => [p.user_id, p.full_name]) || []), [profiles]);
  const truckMap = useMemo(() => new Map(trucks?.map((t: any) => [t.id, t.truck_number]) || []), [trucks]);
  const driverMap = useMemo(() => new Map(drivers?.map((d: any) => [d.id, d.name]) || []), [drivers]);
  const driverDispatcherMap = useMemo(() => new Map(drivers?.map((d: any) => [d.id, d.dispatcher_id]) || []), [drivers]);

  const enriched = useMemo(() => {
    return (inspections || []).map(row => ({
      ...row,
      truck_number: row.truck_id ? truckMap.get(row.truck_id) || "—" : "—",
      driver_name: row.driver_id ? driverMap.get(row.driver_id) || "—" : "—",
      dispatcher_name: row.dispatcher_id ? profileMap.get(row.dispatcher_id) || "—" : "—",
    }));
  }, [inspections, truckMap, driverMap, profileMap]);

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
      const driverId = formDriverId || null;
      const dispatcherId = driverId ? driverDispatcherMap.get(driverId) || null : null;
      const { error } = await supabase.from("roadside_inspections").insert({
        truck_id: formTruckId || null,
        driver_id: driverId,
        dispatcher_id: dispatcherId,
        maintenance_check: formMaintenanceCheck ? format(formMaintenanceCheck, "yyyy-MM-dd") : null,
        reason: formReason || null,
        inspection_level: formLevel ? parseInt(formLevel) : null,
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

  const resetForm = useCallback(() => {
    setFormTruckId("");
    setFormDriverId("");
    setFormMaintenanceCheck(undefined);
    setFormReason("");
    setFormLevel("");
  }, []);

  // Auto-fill driver when truck selected
  const handleTruckChange = (truckId: string) => {
    setFormTruckId(truckId);
    const truck = trucks?.find((t: any) => t.id === truckId);
    if (truck?.driver1_id) setFormDriverId(truck.driver1_id);
  };

  const activeTrucks = useMemo(() => (trucks || []).filter((t: any) => t.status !== "inactive").sort((a: any, b: any) => (a.truck_number || "").localeCompare(b.truck_number || "", undefined, { numeric: true })), [trucks]);
  const activeDrivers = useMemo(() => (drivers || []).filter((d: any) => d.is_active).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")), [drivers]);

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Roadside Inspection</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-[220px]"
              />
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No inspections found.</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Truck#</TableHead>
                    <TableHead className="w-[160px]">Driver Name</TableHead>
                    <TableHead className="w-[160px]">Dispatch</TableHead>
                    <TableHead className="w-[130px]">Maintenance Check</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[100px] text-center">Level</TableHead>
                    {hasRole("admin") && <TableHead className="w-[60px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.truck_number}</TableCell>
                      <TableCell>{row.driver_name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.dispatcher_name}</TableCell>
                      <TableCell>
                        {row.maintenance_check
                          ? format(new Date(row.maintenance_check + "T00:00:00"), "MM/dd/yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{row.reason || "—"}</TableCell>
                      <TableCell className="text-center font-semibold">
                        {row.inspection_level ?? "—"}
                      </TableCell>
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
              <Select value={formTruckId} onValueChange={handleTruckChange}>
                <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {activeTrucks.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.truck_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Driver</label>
              <Select value={formDriverId} onValueChange={setFormDriverId}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {activeDrivers.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Maintenance Check Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formMaintenanceCheck && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formMaintenanceCheck ? format(formMaintenanceCheck, "MM/dd/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formMaintenanceCheck} onSelect={setFormMaintenanceCheck} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Textarea value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="Enter reason..." rows={3} />
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
