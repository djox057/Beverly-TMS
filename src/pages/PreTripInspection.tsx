import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, parseISO, isValid, differenceInCalendarDays } from "date-fns";
import { ChevronLeft, ChevronRight, ClipboardCheck, Search, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { busChannel } from "@/hooks/realtimeBus";
import { Button } from "@/components/ui/button";
import { pretripDueDate, stepPretripDate } from "@/lib/pretripDates";
import { Checkbox } from "@/components/ui/checkbox";
import { PretripPhotosCell, usePretripPhotos } from "@/components/PretripPhotosCell";
import { PretripProblemsCell } from "@/components/PretripProblemsCell";

type TruckRow = {
  id: string;
  truck_number: string;
  source: string | null;
  pretrip_date: string | null;
  pretrip_note: string | null;
  pretrip_checked?: boolean;
  pretrip_checked_by?: string | null;
  pretrip_checked_at?: string | null;
  is_active: boolean;
  driver1_id: string | null;
  driver_name?: string | null;
  dispatcher_id?: string | null;
  dispatcher_name?: string | null;
  dispatcher_office?: string | null;
  company_id?: string | null;
  company_name?: string | null;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  try { return format(parseISO(iso), "MM/dd/yyyy"); } catch { return ""; }
};

const bareInput =
  "h-7 px-1 border-0 bg-transparent shadow-none rounded-none " +
  "focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "hover:bg-muted/40 focus:bg-muted/60 transition-colors";

const parseDateInput = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  const formats = ["MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "yyyy-MM-dd"];
  for (const f of formats) {
    const d = parse(s, f, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return "__invalid__";
};

const DateCell = ({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = (() => {
    if (!value) return undefined;
    try {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return undefined;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isValid(d) ? d : undefined;
    } catch { return undefined; }
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-0.5">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground shrink-0"
            title="Pick a date"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <Input
          key={value ?? "empty"}
          defaultValue={value ? fmtDate(value) : ""}
          placeholder={placeholder}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              if (value !== null) onChange(null);
              return;
            }
            const parsed = parseDateInput(raw);
            if (parsed === "__invalid__") {
              toast({ title: "Invalid date", description: "Use MM/DD/YYYY", variant: "destructive" });
              e.target.value = value ? fmtDate(value) : "";
              return;
            }
            if (parsed !== value) onChange(parsed);
          }}
          className={cn(bareInput, "min-w-0 flex-1 text-center")}
        />
      </div>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
};

const PreTripInspection = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = busChannel(() => {
      queryClient.invalidateQueries({ queryKey: ["pretrip-trucks"], exact: false });
    })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        (payload) => {
          const newRec = payload.new as any;
          const oldRec = payload.old as any;
          const id = newRec?.id || oldRec?.id;
          if (!id) return;
          queryClient.setQueriesData<any[]>(
            { queryKey: ["pretrip-trucks"] },
            (old) => {
              if (!old) return old;
              if (payload.eventType === "DELETE") {
                return old.filter((r) => r.id !== id);
              }
              const idx = old.findIndex((r) => r.id === id);
              if (idx === -1) {
                queryClient.invalidateQueries({ queryKey: ["pretrip-trucks"] });
                return old;
              }
              const updated = [...old];
              updated[idx] = { ...updated[idx], ...newRec };
              return updated;
            },
          );
        },
      )
      .subscribe();
    return () => {
      channel?.unsubscribe();
    };
  }, [queryClient]);

  const { getPrimaryRole, profile } = useAuthContext();
  const primaryRole = getPrimaryRole();
  const isDispatcher = primaryRole === 'dispatch';
  const { allDispatchers } = useFleetManagement();
  const [search, setSearch] = useState("");
  const [photoDate, setPhotoDate] = useState<string>(() => pretripDueDate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { data: photosByTruck = {} } = usePretripPhotos(photoDate);
  const { data: problemsByTruck = {} as Record<string, string> } = useQuery({
    queryKey: ["pretrip-problems", photoDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pretrip_problems").select("truck_id, problems").eq("inspection_date", photoDate);
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: { truck_id: string; problems: string | null }) => { if (r.problems) m[r.truck_id] = r.problems; });
      return m;
    },
  });
  const saveProblems = async (truckId: string, problems: string | null) => {
    const { error } = await (supabase as any).from("pretrip_problems").upsert(
      { truck_id: truckId, inspection_date: photoDate, problems, updated_by: profile?.user_id, updated_at: new Date().toISOString() },
      { onConflict: "truck_id,inspection_date" },
    );
    if (error) return toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["pretrip-problems", photoDate] });
  };
  const { roles: _roles } = useAuthContext() as any;
  const canCheck = ["admin", "maintenance", "manager"].some((r) => (_roles ?? []).includes(r) || primaryRole === r);
  const toggleChecked = async (id: string, v: boolean) => {
    const { error } = await (supabase as any).rpc("set_truck_pretrip_checked", { _truck_id: id, _checked: v });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["pretrip-trucks"] });
  };

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ["pretrip-trucks", isDispatcher ? profile?.user_id : "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, source, pretrip_date, pretrip_note, pretrip_checked, pretrip_checked_by, pretrip_checked_at, is_active, driver1_id, driver1:drivers!trucks_driver1_id_fkey(first_name, last_name, dispatcher_id, company_id, companies:companies(id, name))")
        .eq("is_active", true)
        .order("truck_number");
      if (error) throw error;
      const rows = (data ?? []).map((t: any) => ({
        ...t,
        driver_name: t.driver1
          ? `${t.driver1.first_name ?? ""} ${t.driver1.last_name ?? ""}`.trim()
          : null,
        dispatcher_id: t.driver1?.dispatcher_id ?? null,
        company_id: t.driver1?.company_id ?? null,
        company_name: t.driver1?.companies?.name ?? null,
      })) as TruckRow[];
      if (isDispatcher && profile?.user_id) {
        return rows.filter((t) => t.dispatcher_id === profile.user_id);
      }
      return rows;
    },
  });

  const checkerIds = useMemo(
    () => Array.from(new Set(trucks.map((t) => t.pretrip_checked_by).filter(Boolean))) as string[],
    [trucks],
  );
  const { data: checkerNames = {} as Record<string, string> } = useQuery({
    queryKey: ["pretrip-checker-names", checkerIds],
    enabled: checkerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", checkerIds);
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { m[p.user_id] = p.full_name || p.email || "Unknown"; });
      return m;
    },
  });

  const updateTruck = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TruckRow> }) => {
      if (isDispatcher) {
        const row = trucks.find((t) => t.id === id);
        const { error } = await supabase.rpc("dispatcher_update_truck_pretrip", {
          _truck_id: id,
          _pretrip_date: (patch.pretrip_date !== undefined ? patch.pretrip_date : row?.pretrip_date) ?? null,
          _pretrip_note: (patch.pretrip_note !== undefined ? patch.pretrip_note : row?.pretrip_note) ?? null,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("trucks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pretrip-trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trucks", "v2"] });
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dispatcherFilter, setDispatcherFilter] = useState<string>("all");
  const [officeFilter, setOfficeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [problemsFilter, setProblemsFilter] = useState<string>("all");

  const enrichedTrucks = useMemo(() => {
    const dispatcherMap = new Map(allDispatchers.map((d: any) => [d.id, d]));
    return trucks.map((t) => {
      const d = t.dispatcher_id ? dispatcherMap.get(t.dispatcher_id) : undefined;
      return {
        ...t,
        dispatcher_name: d ? d.full_name || d.email || null : null,
        dispatcher_office: d ? d.office || null : null,
      };
    });
  }, [trucks, allDispatchers]);

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    enrichedTrucks.forEach(t => { if (t.company_id && t.company_name) map.set(t.company_id, t.company_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enrichedTrucks]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    enrichedTrucks.forEach(t => { if (t.source) set.add(t.source); });
    return Array.from(set).sort();
  }, [enrichedTrucks]);

  const dispatcherOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    enrichedTrucks.forEach(t => {
      if (t.dispatcher_id && t.dispatcher_name) {
        map.set(t.dispatcher_id, { id: t.dispatcher_id, label: t.dispatcher_name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [enrichedTrucks]);

  const officeOptions = useMemo(() => {
    const set = new Set<string>();
    enrichedTrucks.forEach(t => { if (t.dispatcher_office) set.add(t.dispatcher_office); });
    return Array.from(set).sort();
  }, [enrichedTrucks]);

  const daysSince = (t: TruckRow): number | null => {
    if (!t.pretrip_date) return null;
    try {
      return differenceInCalendarDays(new Date(), parseISO(t.pretrip_date));
    } catch { return null; }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedTrucks.filter(t => {
      if (q) {
        const matches =
          (t.truck_number ?? "").toLowerCase().includes(q) ||
          (t.driver_name ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (companyFilter !== "all" && t.company_id !== companyFilter) return false;
      if (dispatcherFilter !== "all" && t.dispatcher_id !== dispatcherFilter) return false;
      if (officeFilter !== "all" && t.dispatcher_office !== officeFilter) return false;
      const problems = (problemsByTruck as Record<string, string>)[t.id]?.trim() ?? "";
      if (problemsFilter === "with" && problems === "") return false;
      if (problemsFilter === "without" && problems !== "") return false;
      return true;
    });
  }, [enrichedTrucks, search, companyFilter, dispatcherFilter, officeFilter, problemsFilter, problemsByTruck]);

  return (
    <div className="py-6 px-2 space-y-6">
      <div className="flex items-center gap-3 px-2">
        <ClipboardCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pre Trip Inspection</h1>
          <p className="text-muted-foreground mt-1">Daily pre-trip inspection status per truck</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Report</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Company" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dispatcherFilter} onValueChange={setDispatcherFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Dispatcher" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dispatchers</SelectItem>
                {dispatcherOptions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={officeFilter} onValueChange={setOfficeFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Office" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All offices</SelectItem>
                {officeOptions.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={problemsFilter} onValueChange={setProblemsFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Problems" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trucks</SelectItem>
                <SelectItem value="with">With problems only</SelectItem>
                <SelectItem value="without">Without problems</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search unit or driver..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPhotoDate(stepPretripDate(photoDate, -1))} title="Previous inspection day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {format(parseISO(photoDate), "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={parseISO(photoDate)}
                  disabled={(d) => d.getDay() !== 1 && d.getDay() !== 5}
                  onSelect={(d) => { if (d) { setPhotoDate(format(d, "yyyy-MM-dd")); setDatePickerOpen(false); } }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {photoDate === pretripDueDate() ? (
              <span className="text-xs text-muted-foreground">(current)</span>
            ) : (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPhotoDate(pretripDueDate())}>Back to current</Button>
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={photoDate >= pretripDueDate()} onClick={() => setPhotoDate(stepPretripDate(photoDate, 1))} title="Next inspection day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-20 bg-background">
              <TableRow>
                <TableHead className="sticky top-0 z-20 w-[80px] bg-background">Unit</TableHead>
                <TableHead className="sticky top-0 z-20 w-[160px] bg-background">Driver</TableHead>
                <TableHead className="sticky top-0 z-20 w-[140px] bg-background">Dispatcher</TableHead>
                <TableHead className="sticky top-0 z-20 w-[150px] bg-background">Company</TableHead>
                <TableHead className="sticky top-0 z-20 w-[180px] bg-background">Pictures</TableHead>
                <TableHead className="sticky top-0 z-20 w-[220px] bg-background">Problems</TableHead>
                <TableHead className="sticky top-0 z-20 w-[80px] bg-background text-center">Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No trucks found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const d = daysSince(t);
                  return (
                    <TableRow key={t.id}>
                                            <TableCell className="font-medium">{t.truck_number}</TableCell>
                      <TableCell className="truncate">{t.driver_name ?? ""}</TableCell>
                      <TableCell className="truncate">{t.dispatcher_name ?? ""}</TableCell>
                      <TableCell className="truncate">{t.company_name ?? ""}</TableCell>
                      <TableCell>
                        <PretripPhotosCell truckId={t.id} photos={(photosByTruck as any)[t.id] ?? []} userId={profile?.user_id} date={photoDate} />
                      </TableCell>
                      <TableCell className="p-0">
                        <PretripProblemsCell
                          value={problemsByTruck[t.id] ?? null}
                          onSave={(v) => saveProblems(t.id, v)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Checkbox checked={!!t.pretrip_checked} disabled={!canCheck}
                            onCheckedChange={(v) => toggleChecked(t.id, !!v)} />
                          {t.pretrip_checked && t.pretrip_checked_by && (
                            <div className="text-[10px] leading-tight text-muted-foreground">
                              <div className="font-medium text-foreground/80">
                                {checkerNames[t.pretrip_checked_by] ?? ""}
                              </div>
                              {t.pretrip_checked_at && (
                                <div>
                                  {format(parseISO(t.pretrip_checked_at), "MM/dd/yyyy hh:mm a")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreTripInspection;
