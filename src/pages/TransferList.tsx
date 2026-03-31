import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

interface TransferRow {
  id: string;
  driver_id: string | null;
  truck_id: string | null;
  going_to_company: string | null;
  drug_test_date: string | null;
  coming_to_office: string | null;
  driver_informed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  driver_name?: string;
  truck_number?: string;
}

const useTransferList = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transfer_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_list" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("transfer-list-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transfer_list" }, () => {
        queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
};

const TransferList = () => {
  const { user, roles, hasRole } = useAuthContext();
  const { data: transferRows = [], isLoading } = useTransferList();
  const { data: trucks = [] } = useTrucks();
  const { data: drivers = [] } = useDrivers();
  const { data: companies = [] } = useCompanies();
  const queryClient = useQueryClient();

  const canEdit = hasRole("admin") || hasRole("manager") || hasRole("safety");
  const isDispatchOnly = hasRole("dispatch") && !canEdit;

  // Build lookup maps
  const driverMap = useMemo(() => {
    const map = new Map<string, any>();
    (drivers || []).forEach((d: any) => map.set(d.id, d));
    return map;
  }, [drivers]);

  const truckMap = useMemo(() => {
    const map = new Map<string, any>();
    (trucks || []).forEach((t: any) => map.set(t.id, t));
    return map;
  }, [trucks]);

  // Enrich rows with names
  const enrichedRows: TransferRow[] = useMemo(() => {
    return transferRows.map((row: any) => ({
      ...row,
      driver_name: row.driver_id ? driverMap.get(row.driver_id)?.name || "Unknown" : "",
      truck_number: row.truck_id ? truckMap.get(row.truck_id)?.truck_number || "Unknown" : "",
    }));
  }, [transferRows, driverMap, truckMap]);

  // Dispatcher filtering: only show rows where driver's dispatcher_id matches user
  const filteredRows = useMemo(() => {
    if (!isDispatchOnly) return enrichedRows;
    return enrichedRows.filter((row) => {
      if (!row.driver_id) return false;
      const driver = driverMap.get(row.driver_id);
      return driver?.dispatcher_id === user?.id;
    });
  }, [enrichedRows, isDispatchOnly, driverMap, user?.id]);

  // Summary stats
  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    enrichedRows.forEach((row) => {
      const company = row.going_to_company || "Unspecified";
      counts[company] = (counts[company] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [enrichedRows]);

  // Add row dialog
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Toggle driver_informed
  const toggleInformed = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("transfer_list" as any)
        .update({ driver_informed: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transfer_list"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Delete row
  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transfer_list" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      toast({ title: "Deleted" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transfer List</h1>
        <div className="flex items-center gap-4">
          {/* Summary stats */}
          {companyCounts.length > 0 && (
            <Card className="min-w-[200px]">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Trucks per Company</CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-3">
                {companyCounts.map(([company, count]) => (
                  <div key={company} className="flex justify-between text-sm">
                    <span className="truncate max-w-[140px]">{company}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {canEdit && (
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Transfer
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver Name</TableHead>
              <TableHead>Truck #</TableHead>
              <TableHead>Going To Company</TableHead>
              <TableHead>Drug Test Date</TableHead>
              <TableHead>Coming To Office</TableHead>
              <TableHead className="text-center">Driver Informed</TableHead>
              {canEdit && <TableHead className="w-[50px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-8">
                  No transfers found
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.driver_name}</TableCell>
                  <TableCell>{row.truck_number}</TableCell>
                  <TableCell>{row.going_to_company || "-"}</TableCell>
                  <TableCell>
                    {row.drug_test_date ? format(new Date(row.drug_test_date + "T00:00:00"), "MM/dd/yyyy") : "-"}
                  </TableCell>
                  <TableCell>{row.coming_to_office || "-"}</TableCell>
                  <TableCell className="text-center">
                    {canEdit || isDispatchOnly ? (
                      <Checkbox
                        checked={row.driver_informed}
                        onCheckedChange={(checked) =>
                          toggleInformed.mutate({ id: row.id, value: !!checked })
                        }
                      />
                    ) : (
                      <span>{row.driver_informed ? "Yes" : "No"}</span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Transfer Dialog */}
      <AddTransferRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        trucks={trucks || []}
        drivers={drivers || []}
        companies={companies || []}
        userId={user?.id}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transfer?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteRow.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// --- Add Transfer Row Dialog ---
function AddTransferRowDialog({
  open, onClose, trucks, drivers, companies, userId,
}: {
  open: boolean;
  onClose: () => void;
  trucks: any[];
  drivers: any[];
  companies: any[];
  userId?: string;
}) {
  const queryClient = useQueryClient();
  const [truckId, setTruckId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [goingToCompany, setGoingToCompany] = useState("");
  const [drugTestDate, setDrugTestDate] = useState<Date | undefined>();
  const [comingToOffice, setComingToOffice] = useState("");
  const [truckSearch, setTruckSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  // Build truck→driver1 lookup
  const truckDriverMap = useMemo(() => {
    const m = new Map<string, string>();
    trucks.forEach((t: any) => { if (t.driver1_id) m.set(t.id, t.driver1_id); });
    return m;
  }, [trucks]);

  const driverTruckMap = useMemo(() => {
    const m = new Map<string, string>();
    trucks.forEach((t: any) => { if (t.driver1_id) m.set(t.driver1_id, t.id); });
    return m;
  }, [trucks]);

  const handleTruckSelect = useCallback((id: string) => {
    setTruckId(id);
    const did = truckDriverMap.get(id);
    if (did) setDriverId(did);
  }, [truckDriverMap]);

  const handleDriverSelect = useCallback((id: string) => {
    setDriverId(id);
    const tid = driverTruckMap.get(id);
    if (tid) setTruckId(tid);
  }, [driverTruckMap]);

  const reset = () => {
    setTruckId(null); setDriverId(null); setGoingToCompany(""); setDrugTestDate(undefined); setComingToOffice("");
    setTruckSearch(""); setDriverSearch("");
  };

  const insertMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transfer_list" as any).insert({
        driver_id: driverId,
        truck_id: truckId,
        going_to_company: goingToCompany || null,
        drug_test_date: drugTestDate ? format(drugTestDate, "yyyy-MM-dd") : null,
        coming_to_office: comingToOffice || null,
        created_by: userId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      toast({ title: "Transfer added" });
      reset();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Active drivers only
  const activeDrivers = useMemo(() =>
    (drivers || []).filter((d: any) => d.is_active !== false), [drivers]);

  const filteredTrucks = useMemo(() => {
    if (!truckSearch) return trucks.slice(0, 50);
    const s = truckSearch.toLowerCase();
    return trucks.filter((t: any) => t.truck_number?.toLowerCase().includes(s)).slice(0, 50);
  }, [trucks, truckSearch]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearch) return activeDrivers.slice(0, 50);
    const s = driverSearch.toLowerCase();
    return activeDrivers.filter((d: any) => d.name?.toLowerCase().includes(s)).slice(0, 50);
  }, [activeDrivers, driverSearch]);

  const selectedTruckLabel = truckId ? trucks.find((t: any) => t.id === truckId)?.truck_number : null;
  const selectedDriverLabel = driverId ? drivers.find((d: any) => d.id === driverId)?.name : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Truck Combobox */}
          <div>
            <label className="text-sm font-medium">Truck #</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {selectedTruckLabel || "Select truck..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search truck..." value={truckSearch} onValueChange={setTruckSearch} />
                  <CommandList>
                    <CommandEmpty>No trucks found</CommandEmpty>
                    <CommandGroup>
                      {filteredTrucks.map((t: any) => (
                        <CommandItem key={t.id} value={t.truck_number} onSelect={() => handleTruckSelect(t.id)}>
                          {t.truck_number}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Driver Combobox */}
          <div>
            <label className="text-sm font-medium">Driver</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {selectedDriverLabel || "Select driver..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search driver..." value={driverSearch} onValueChange={setDriverSearch} />
                  <CommandList>
                    <CommandEmpty>No drivers found</CommandEmpty>
                    <CommandGroup>
                      {filteredDrivers.map((d: any) => (
                        <CommandItem key={d.id} value={d.name} onSelect={() => handleDriverSelect(d.id)}>
                          {d.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Going To Company */}
          <div>
            <label className="text-sm font-medium">Going To Company</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {goingToCompany || "Select company..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search company..." />
                  <CommandList>
                    <CommandEmpty>No companies found</CommandEmpty>
                    <CommandGroup>
                      {(companies || []).map((c: any) => (
                        <CommandItem key={c.id} value={c.name} onSelect={() => setGoingToCompany(c.name)}>
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Drug Test Date */}
          <div>
            <label className="text-sm font-medium">Drug Test Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !drugTestDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {drugTestDate ? format(drugTestDate, "MM/dd/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={drugTestDate} onSelect={setDrugTestDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Coming To Office */}
          <div>
            <label className="text-sm font-medium">Coming To Office</label>
            <Input value={comingToOffice} onChange={(e) => setComingToOffice(e.target.value)} placeholder="Office name..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => insertMutation.mutate()} disabled={insertMutation.isPending || (!truckId && !driverId)}>
            {insertMutation.isPending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TransferList;
