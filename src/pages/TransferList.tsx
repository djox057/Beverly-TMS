import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { format } from "date-fns";
import { Plus, Trash2, Search, Pencil, Lock } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { getCompanyBackgroundColor } from "@/pages/Reports/helpers";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransferRow {
  id: string;
  driver_id: string | null;
  truck_id: string | null;
  going_to_company: string | null;
  drug_test_date: string | null;
  drug_test_zip: string | null;
  coming_to_office: string | null;
  driver_informed: boolean;
  sign: boolean;
  finished: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  safety_user_id: string | null;
  driver_name?: string;
  truck_number?: string;
  dispatcher_name?: string;
  dispatcher_office?: string;
  safety_name?: string;
  drug_test_result?: string | null;
}

// ─── Role permission helpers ───
type ColumnGroup = "drug_test" | "coming_office" | "driver_informed" | "sign" | "finished" | "safety_assign";

const COLUMN_PERMISSIONS: Record<ColumnGroup, { roles: string[]; label: string }> = {
  drug_test: { roles: ["safety", "admin"], label: "Safety" },
  finished: { roles: ["safety", "admin"], label: "Safety" },
  coming_office: { roles: ["dispatch", "admin"], label: "Dispatch" },
  driver_informed: { roles: ["dispatch", "admin"], label: "Dispatch" },
  sign: { roles: ["yard", "maintenance", "admin"], label: "Yard / Maintenance" },
  safety_assign: { roles: ["safety", "manager", "admin"], label: "Safety / Manager" },
};

function useCanEditColumn(hasRole: (r: any) => boolean) {
  return useMemo(() => {
    const result: Record<ColumnGroup, boolean> = {} as any;
    for (const [key, { roles }] of Object.entries(COLUMN_PERMISSIONS)) {
      result[key as ColumnGroup] = roles.some((r) => hasRole(r as any));
    }
    return result;
  }, [hasRole]);
}

// ─── Locked cell indicator ───
function LockedCell({ group, children }: { group: ColumnGroup; children: React.ReactNode }) {
  const label = COLUMN_PERMISSIONS[group].label;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-muted-foreground cursor-not-allowed">
            {children}
            <Lock className="h-3 w-3 opacity-50 shrink-0" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Only <span className="font-semibold">{label}</span> can edit this
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Inline date cell ───
function InlineDateCell({
  value,
  rowId,
  field,
  canEdit,
  group,
}: {
  value: string | null;
  rowId: string;
  field: string;
  canEdit: boolean;
  group: ColumnGroup;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T00:00:00") : undefined;
  const display = date ? format(date, "MM/dd/yyyy") : "-";

  const mutation = useMutation({
    mutationFn: async (newDate: Date | undefined) => {
      const formatted = newDate ? format(newDate, "yyyy-MM-dd") : null;
      const { error } = await supabase
        .from("transfer_list" as any)
        .update({ [field]: formatted } as any)
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      setOpen(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!canEdit) {
    return <LockedCell group={group}><span>{display}</span></LockedCell>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-left w-full hover:underline cursor-pointer bg-transparent border-none p-0 m-0 font-inherit text-inherit"
          type="button"
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => mutation.mutate(d)}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Inline text cell ───
function InlineTextCell({
  value,
  rowId,
  field,
  canEdit,
  group,
  placeholder,
}: {
  value: string | null;
  rowId: string;
  field: string;
  canEdit: boolean;
  group: ColumnGroup;
  placeholder?: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(value || ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    setEditing(false);
    if (text === (value || "")) return;
    const { error } = await supabase
      .from("transfer_list" as any)
      .update({ [field]: text || null } as any)
      .eq("id", rowId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setText(value || "");
    } else {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
    }
  };

  if (!canEdit) {
    return <LockedCell group={group}><span>{value || "-"}</span></LockedCell>;
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setText(value || ""); setEditing(false); } }}
        className="h-7 text-sm px-1"
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      className="text-left w-full hover:underline cursor-pointer bg-transparent border-none p-0 m-0 font-inherit text-inherit"
      type="button"
      onClick={() => setEditing(true)}
    >
      {value || "-"}
    </button>
  );
}

// ─── Hook ───
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
  const { user, hasRole } = useAuthContext();
  const { data: transferRows = [], isLoading } = useTransferList();
  const { data: trucks = [] } = useTrucks();
  const { data: drivers = [] } = useDrivers();
  const { data: companies = [] } = useCompanies();
  const queryClient = useQueryClient();

  const canEdit = hasRole("admin") || hasRole("manager") || hasRole("safety");
  const isDispatchOnly = hasRole("dispatch") && !canEdit;
  const columnPerms = useCanEditColumn(hasRole);

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

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, office");
      if (error) throw error;
      return data || [];
    },
    staleTime: 600000,
  });

  // Fetch safety/manager role users for safety assignment dropdown
  const { data: safetyUsers = [] } = useQuery({
    queryKey: ["safety-users-for-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("user_id, role")
        .in("role", ["safety", "manager", "admin"]);
      if (error) throw error;
      return data || [];
    },
    staleTime: 600000,
  });

  // Fetch drug test results
  const { data: drugTests = [] } = useQuery({
    queryKey: ["driver-drug-tests-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_drug_tests")
        .select("driver_id, result");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, { name: string; office: string }>();
    profiles.forEach((p: any) => map.set(p.user_id, { name: p.full_name || "", office: p.office || "" }));
    return map;
  }, [profiles]);

  const safetyUserList = useMemo(() => {
    const ids = new Set<string>();
    safetyUsers.forEach((r: any) => ids.add(r.user_id));
    return Array.from(ids).map((uid) => {
      const p = profileMap.get(uid);
      return { user_id: uid, name: p?.name || uid };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [safetyUsers, profileMap]);

  const drugTestMap = useMemo(() => {
    const map = new Map<string, string | null>();
    drugTests.forEach((dt: any) => map.set(dt.driver_id, dt.result));
    return map;
  }, [drugTests]);

  const enrichedRows: TransferRow[] = useMemo(() => {
    return transferRows.map((row: any) => {
      const driver = row.driver_id ? driverMap.get(row.driver_id) : null;
      const truck = row.truck_id ? truckMap.get(row.truck_id) : null;
      const dispatcherId = driver?.dispatcher_id || truck?.dispatcher_id;
      const profile = dispatcherId ? profileMap.get(dispatcherId) : null;
      const safetyProfile = row.safety_user_id ? profileMap.get(row.safety_user_id) : null;
      return {
        ...row,
        driver_name: driver?.name || "",
        truck_number: truck?.truck_number || "",
        dispatcher_name: profile?.name || "",
        dispatcher_office: profile?.office || "",
        safety_name: safetyProfile?.name || "",
        drug_test_result: row.driver_id ? drugTestMap.get(row.driver_id) || null : null,
      };
    });
  }, [transferRows, driverMap, truckMap, profileMap, drugTestMap]);

  const filteredRows = useMemo(() => {
    if (!isDispatchOnly) return enrichedRows;
    return enrichedRows.filter((row) => {
      if (!row.driver_id) return false;
      const driver = driverMap.get(row.driver_id);
      return driver?.dispatcher_id === user?.id;
    });
  }, [enrichedRows, isDispatchOnly, driverMap, user?.id]);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    enrichedRows.forEach((row) => {
      const company = row.going_to_company || "Unspecified";
      counts[company] = (counts[company] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [enrichedRows]);

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<TransferRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [dispatcherSearch, setDispatcherSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [officeFilter, setOfficeFilter] = useState<string>("all");

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    enrichedRows.forEach((row) => { if (row.going_to_company) set.add(row.going_to_company); });
    return Array.from(set).sort();
  }, [enrichedRows]);

  const uniqueOffices = useMemo(() => {
    const set = new Set<string>();
    enrichedRows.forEach((row) => { if (row.dispatcher_office) set.add(row.dispatcher_office); });
    return Array.from(set).sort();
  }, [enrichedRows]);

  const displayRows = useMemo(() => {
    let rows = filteredRows;
    if (searchText) {
      const s = searchText.toLowerCase();
      rows = rows.filter((row) =>
        (row.truck_number?.toLowerCase().includes(s)) ||
        (row.driver_name?.toLowerCase().includes(s))
      );
    }
    if (companyFilter !== "all") {
      rows = rows.filter((row) => row.going_to_company === companyFilter);
    }
    if (officeFilter !== "all") {
      rows = rows.filter((row) => (row.dispatcher_office || "") === officeFilter);
    }
    if (dispatcherSearch) {
      const ds = dispatcherSearch.toLowerCase();
      rows = rows.filter((row) => (row.dispatcher_name || "").toLowerCase().includes(ds));
    }
    return rows;
  }, [filteredRows, searchText, companyFilter, officeFilter, dispatcherSearch]);

  // Group by office, then by dispatcher within each office
  const groupedByOffice = useMemo(() => {
    const officeMap = new Map<string, Map<string, TransferRow[]>>();
    displayRows.forEach((row) => {
      const office = row.dispatcher_office || "No Office";
      const dispatcher = row.dispatcher_name || "Unassigned";
      if (!officeMap.has(office)) officeMap.set(office, new Map());
      const dispMap = officeMap.get(office)!;
      if (!dispMap.has(dispatcher)) dispMap.set(dispatcher, []);
      dispMap.get(dispatcher)!.push(row);
    });
    // Sort offices alphabetically, "No Office" last
    const entries = Array.from(officeMap.entries()).sort((a, b) => {
      if (a[0] === "No Office") return 1;
      if (b[0] === "No Office") return -1;
      return a[0].localeCompare(b[0]);
    });
    // Sort dispatchers within each office, "Unassigned" last
    return entries.map(([office, dispMap]) => {
      const dispatchers = Array.from(dispMap.entries()).sort((a, b) => {
        if (a[0] === "Unassigned") return 1;
        if (b[0] === "Unassigned") return -1;
        return a[0].localeCompare(b[0]);
      });
      const totalCount = dispatchers.reduce((sum, [, rows]) => sum + rows.length, 0);
      return { office, totalCount, dispatchers };
    });
  }, [displayRows]);

  const toggleField = useMutation({
    mutationFn: async ({ id, field, value, row }: { id: string; field: string; value: boolean; row?: TransferRow }) => {
      const { error } = await supabase
        .from("transfer_list" as any)
        .update({ [field]: value } as any)
        .eq("id", id);
      if (error) throw error;

      if (field === "finished" && value && row?.driver_id && row?.going_to_company) {
        const targetCompany = companies.find((c: any) => c.name === row.going_to_company);
        if (targetCompany) {
          const { error: driverErr } = await supabase
            .from("drivers")
            .update({ company_id: targetCompany.id })
            .eq("id", row.driver_id);
          if (driverErr) throw driverErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

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

  const colCount = canEdit ? 11 : 10;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transfer List</h1>
        <div className="flex items-center gap-4">
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search truck # or driver..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dispatcher..."
            value={dispatcherSearch}
            onChange={(e) => setDispatcherSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {uniqueCompanies.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={officeFilter} onValueChange={setOfficeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Offices" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Offices</SelectItem>
            {uniqueOffices.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Truck #</TableHead>
              <TableHead>Driver Name</TableHead>
              <TableHead>Dispatch</TableHead>
              <TableHead>Going To Company</TableHead>
              <TableHead className="text-center">Drug Test Date</TableHead>
              <TableHead className="text-center">Drug Test Zip</TableHead>
              <TableHead className="text-center">Coming To Office</TableHead>
              <TableHead className="text-center">Driver Informed</TableHead>
              <TableHead className="text-center">Sign</TableHead>
              <TableHead className="text-center">Finished</TableHead>
              {canEdit && <TableHead className="w-[80px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : groupedByOffice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  No transfers found
                </TableCell>
              </TableRow>
            ) : (
              groupedByOffice.map(({ office, totalCount, dispatchers }) => (
                <>
                  <TableRow key={`office-${office}`} className="bg-primary/10 hover:bg-primary/10">
                    <TableCell colSpan={colCount} className="font-bold text-sm py-2">
                      {office} ({totalCount})
                    </TableCell>
                  </TableRow>
                  {dispatchers.map(([dispatcherName, rows]) => (
                    <>
                      <TableRow key={`group-${office}-${dispatcherName}`} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={colCount} className="font-semibold text-sm py-1.5 pl-8">
                          {dispatcherName} ({rows.length})
                        </TableCell>
                      </TableRow>
                      {rows.map((row) => {
                        const companyStyle = getCompanyBackgroundColor(row.going_to_company);
                        return (
                          <TableRow key={row.id} className="hover:bg-transparent">
                            <TableCell>{row.truck_number}</TableCell>
                            <TableCell className="font-medium">{row.driver_name}</TableCell>
                            <TableCell>{row.dispatcher_name || "-"}</TableCell>
                            <TableCell style={row.finished ? { backgroundColor: "hsl(142, 50%, 35%)", color: "white" } : companyStyle}>
                              {row.going_to_company || "-"}
                            </TableCell>

                            <TableCell className="text-center">
                              <InlineDateCell
                                value={row.drug_test_date}
                                rowId={row.id}
                                field="drug_test_date"
                                canEdit={columnPerms.drug_test}
                                group="drug_test"
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              <InlineTextCell
                                value={row.drug_test_zip}
                                rowId={row.id}
                                field="drug_test_zip"
                                canEdit={columnPerms.drug_test}
                                group="drug_test"
                                placeholder="Zip..."
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              <InlineDateCell
                                value={row.coming_to_office}
                                rowId={row.id}
                                field="coming_to_office"
                                canEdit={columnPerms.coming_office}
                                group="coming_office"
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              {columnPerms.driver_informed ? (
                                <Checkbox
                                  checked={row.driver_informed}
                                  onCheckedChange={(checked) =>
                                    toggleField.mutate({ id: row.id, field: "driver_informed", value: !!checked })
                                  }
                                />
                              ) : (
                                <LockedCell group="driver_informed">
                                  <span>{row.driver_informed ? "Yes" : "No"}</span>
                                </LockedCell>
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              {columnPerms.sign ? (
                                <Checkbox
                                  checked={row.sign}
                                  onCheckedChange={(checked) =>
                                    toggleField.mutate({ id: row.id, field: "sign", value: !!checked })
                                  }
                                />
                              ) : (
                                <LockedCell group="sign">
                                  <span>{row.sign ? "Yes" : "No"}</span>
                                </LockedCell>
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              {columnPerms.finished ? (
                                <Checkbox
                                  checked={row.finished}
                                  onCheckedChange={(checked) =>
                                    toggleField.mutate({ id: row.id, field: "finished", value: !!checked, row })
                                  }
                                />
                              ) : (
                                <LockedCell group="finished">
                                  <span>{row.finished ? "Yes" : "No"}</span>
                                </LockedCell>
                              )}
                            </TableCell>

                            {canEdit && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => setEditRow(row)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </>
                  ))}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TransferRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        trucks={trucks || []}
        drivers={drivers || []}
        companies={companies || []}
        userId={user?.id}
      />

      {editRow && (
        <TransferRowDialog
          open={!!editRow}
          onClose={() => setEditRow(null)}
          trucks={trucks || []}
          drivers={drivers || []}
          companies={companies || []}
          userId={user?.id}
          editData={editRow}
        />
      )}

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

// --- Add/Edit Transfer Row Dialog ---
function TransferRowDialog({
  open, onClose, trucks, drivers, companies, userId, editData,
}: {
  open: boolean;
  onClose: () => void;
  trucks: any[];
  drivers: any[];
  companies: any[];
  userId?: string;
  editData?: TransferRow;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editData;
  const [truckId, setTruckId] = useState<string | null>(editData?.truck_id || null);
  const [driverId, setDriverId] = useState<string | null>(editData?.driver_id || null);
  const [goingToCompany, setGoingToCompany] = useState(editData?.going_to_company || "");
  const [drugTestDate, setDrugTestDate] = useState<Date | undefined>(
    editData?.drug_test_date ? new Date(editData.drug_test_date + "T00:00:00") : undefined
  );
  const [drugTestZip, setDrugTestZip] = useState(editData?.drug_test_zip || "");
  const [comingToOffice, setComingToOffice] = useState<Date | undefined>(
    editData?.coming_to_office ? new Date(editData.coming_to_office + "T00:00:00") : undefined
  );
  const [truckSearch, setTruckSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  useEffect(() => {
    if (editData) {
      setTruckId(editData.truck_id);
      setDriverId(editData.driver_id);
      setGoingToCompany(editData.going_to_company || "");
      setDrugTestDate(editData.drug_test_date ? new Date(editData.drug_test_date + "T00:00:00") : undefined);
      setDrugTestZip(editData.drug_test_zip || "");
      setComingToOffice(editData.coming_to_office ? new Date(editData.coming_to_office + "T00:00:00") : undefined);
    }
  }, [editData]);

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
    setTruckId(null); setDriverId(null); setGoingToCompany(""); setDrugTestDate(undefined);
    setDrugTestZip(""); setComingToOffice(undefined);
    setTruckSearch(""); setDriverSearch("");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        driver_id: driverId,
        truck_id: truckId,
        going_to_company: goingToCompany || null,
        drug_test_date: drugTestDate ? format(drugTestDate, "yyyy-MM-dd") : null,
        drug_test_zip: drugTestZip || null,
        coming_to_office: comingToOffice ? format(comingToOffice, "yyyy-MM-dd") : null,
      } as any;

      if (isEdit && editData) {
        const { error } = await supabase
          .from("transfer_list" as any)
          .update(payload)
          .eq("id", editData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transfer_list" as any).insert({
          ...payload,
          created_by: userId,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfer_list"] });
      toast({ title: isEdit ? "Transfer updated" : "Transfer added" });
      reset();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

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
          <DialogTitle>{isEdit ? "Edit Transfer" : "Add Transfer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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

          <div>
            <label className="text-sm font-medium">Drug Test Zip Code</label>
            <Input value={drugTestZip} onChange={(e) => setDrugTestZip(e.target.value)} placeholder="Zip code..." />
          </div>

          <div>
            <label className="text-sm font-medium">Coming To Office</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !comingToOffice && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {comingToOffice ? format(comingToOffice, "MM/dd/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={comingToOffice} onSelect={setComingToOffice} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!truckId && !driverId)}>
            {saveMutation.isPending ? "Saving..." : isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TransferList;
