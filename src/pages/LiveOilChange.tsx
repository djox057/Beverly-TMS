import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, parseISO, isValid } from "date-fns";
import { Droplet, Search, Upload, Eye, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { getOilChangeThresholds } from "@/pages/Reports/helpers";
import { useFleetManagement } from "@/hooks/useFleetManagement";

type TruckRow = {
  id: string;
  truck_number: string;
  source: string | null;
  oil_change_date: string | null;
  last_oil_change_miles: number | null;
  miles: number | null;
  miles_updated_at: string | null;
  air_filter: number | null;
  last_oc_invoice: string | null;
  oil_change_note: string | null;
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

const fmtNum = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "" : Number(n).toLocaleString();

// Shared bare-input style — blends with row background, no borders/ring.
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

const LiveOilChange = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`live-oil-change-trucks-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        (payload) => {
          const newRec = payload.new as any;
          const oldRec = payload.old as any;
          const id = newRec?.id || oldRec?.id;
          if (!id) return;
          // Directly patch cached rows so all connected clients see the update
          // immediately (including note / oil_change_note) without a refetch race.
          queryClient.setQueriesData<any[]>(
            { queryKey: ["live-oil-change-trucks"] },
            (old) => {
              if (!old) return old;
              if (payload.eventType === "DELETE") {
                return old.filter((r) => r.id !== id);
              }
              const idx = old.findIndex((r) => r.id === id);
              if (idx === -1) {
                // New/unknown truck — fall back to refetch to hydrate joins.
                queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
                return old;
              }
              const updated = [...old];
              updated[idx] = { ...updated[idx], ...newRec };
              return updated;
            },
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Odometer files: map truckId -> filename (or null when missing)
  const { data: trucksListForFiles } = useQuery({
    queryKey: ["live-oil-change-truck-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks").select("id").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map(t => t.id as string);
    },
  });

  const { data: odometerFileMap = {}, refetch: refetchOdometer } = useQuery({
    queryKey: ["odometer-file-map", (trucksListForFiles ?? []).join(",")],
    queryFn: async () => {
      const map: Record<string, string | null> = {};
      const ids = trucksListForFiles ?? [];
      await Promise.all(
        ids.map(async (id) => {
          const { data } = await supabase.storage
            .from("truck-odometer-files").list(id, { limit: 5 });
          map[id] = data && data.length > 0 ? data[0].name : null;
        }),
      );
      return map;
    },
    enabled: (trucksListForFiles ?? []).length > 0,
  });

  const uploadOdometer = async (truckId: string, file: File) => {
    const allowed = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!allowed) {
      toast({ title: "Invalid file", description: "Only images or PDF are allowed", variant: "destructive" });
      return;
    }
    // Remove any existing files first (replace behavior)
    const { data: existing } = await supabase.storage
      .from("truck-odometer-files").list(truckId, { limit: 100 });
    if (existing && existing.length > 0) {
      await supabase.storage
        .from("truck-odometer-files")
        .remove(existing.map((f) => `${truckId}/${f.name}`));
    }
    const ext = file.name.split(".").pop() || "bin";
    const safeName = `odometer-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("truck-odometer-files")
      .upload(`${truckId}/${safeName}`, file, { upsert: true, contentType: file.type });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Odometer uploaded" });
    refetchOdometer();
  };

  const viewOdometer = async (truckId: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from("truck-odometer-files")
      .createSignedUrl(`${truckId}/${fileName}`, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Cannot open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const { getPrimaryRole, profile } = useAuthContext();
  const primaryRole = getPrimaryRole();
  const isDispatcher = primaryRole === 'dispatch';
  const { allDispatchers } = useFleetManagement();
  // Dispatch may only edit the "Total mileage - last update" (miles) field.
  const canEditAll = primaryRole !== 'dispatch';
  const canEditMiles = true;
  const [search, setSearch] = useState("");

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ["live-oil-change-trucks", isDispatcher ? profile?.user_id : "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, source, oil_change_date, last_oil_change_miles, miles, miles_updated_at, air_filter, last_oc_invoice, oil_change_note, is_active, driver1_id, driver1:drivers!trucks_driver1_id_fkey(first_name, last_name, dispatcher_id, company_id, companies:companies(id, name))")
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

  const updateTruck = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TruckRow> }) => {
      // Dispatchers cannot UPDATE the trucks table directly (RLS). Route
      // miles-only updates through a security-definer RPC that scopes to
      // trucks assigned to the dispatcher's drivers.
      const patchKeys = Object.keys(patch);
      const isMilesOnly =
        isDispatcher &&
        patchKeys.length === 1 &&
        patchKeys[0] === "miles";
      if (isMilesOnly) {
        const { error } = await supabase.rpc("dispatcher_update_truck_miles", {
          _truck_id: id,
          _miles: (patch as any).miles,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("trucks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
      queryClient.invalidateQueries({ queryKey: ["trucks", "v2"] });
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [milesFilter, setMilesFilter] = useState<string>("all");
  const [dispatcherFilter, setDispatcherFilter] = useState<string>("all");
  const [officeFilter, setOfficeFilter] = useState<string>("all");

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
      if (sourceFilter !== "all" && (t.source ?? "") !== sourceFilter) return false;
      if (dispatcherFilter !== "all" && t.dispatcher_id !== dispatcherFilter) return false;
      if (officeFilter !== "all" && t.dispatcher_office !== officeFilter) return false;
      if (milesFilter !== "all") {
        const m = t.miles != null && t.last_oil_change_miles != null
          ? t.miles - t.last_oil_change_miles : null;
        if (m == null) return false;
        if (milesFilter === "over28" && !(m > 28000)) return false;
        if (milesFilter === "26to28" && !(m > 26000 && m <= 28000)) return false;
        if (milesFilter === "under26" && !(m <= 26000)) return false;
      }
      return true;
    });
  }, [enrichedTrucks, search, companyFilter, sourceFilter, dispatcherFilter, officeFilter, milesFilter]);

  return (
    <div className="py-6 px-2 space-y-6">
      <div className="flex items-center gap-3 px-2">
        <Droplet className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Live Oil Change</h1>
          <p className="text-muted-foreground mt-1">Fleet oil change and air filter status</p>
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
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
            <Select value={milesFilter} onValueChange={setMilesFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Miles since OC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mileage</SelectItem>
                <SelectItem value="under26">≤ 26,000</SelectItem>
                <SelectItem value="26to28">26,001 – 28,000</SelectItem>
                <SelectItem value="over28">&gt; 28,000</SelectItem>
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
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-20 bg-background">
              <TableRow>
                <TableHead className="sticky top-0 z-20 w-[120px] bg-background">Source</TableHead>
                <TableHead className="sticky top-0 z-20 w-[80px] bg-background">Unit</TableHead>
                <TableHead className="sticky top-0 z-20 w-[130px] bg-background">Last oil change date</TableHead>
                <TableHead className="sticky top-0 z-20 w-[110px] whitespace-normal leading-tight bg-background">Last oil change mileage</TableHead>
                <TableHead className="sticky top-0 z-20 w-[120px] bg-background">Last Update</TableHead>
                <TableHead className="sticky top-0 z-20 w-[180px] bg-background">Total mileage - last update</TableHead>
                <TableHead className="sticky top-0 z-20 w-[90px] whitespace-normal leading-tight bg-background">Miles since last oil change</TableHead>
                <TableHead className="sticky top-0 z-20 w-[130px] whitespace-normal leading-tight bg-background">Odometer</TableHead>
                <TableHead className="sticky top-0 z-20 w-[180px] bg-background">Note</TableHead>
                <TableHead className="sticky top-0 z-20 w-[90px] whitespace-normal leading-tight bg-background">last OC<br/>invoice</TableHead>
                <TableHead className="sticky top-0 z-20 w-[110px] bg-background">AIR FILTER</TableHead>
                <TableHead className="sticky top-0 z-20 w-[90px] whitespace-normal leading-tight bg-background">mil since<br/>last AF</TableHead>
              </TableRow>
            </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No trucks found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => {
                    const milesSinceOil =
                      t.miles != null && t.last_oil_change_miles != null
                        ? t.miles - t.last_oil_change_miles
                        : null;
                    const milesSinceAF =
                      t.miles != null && t.air_filter != null
                        ? t.miles - t.air_filter
                        : null;
                    const { yellow: yThr, red: rThr } = getOilChangeThresholds(t.source);
                    const rowTone =
                      milesSinceOil != null && milesSinceOil > rThr
                        ? "bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-950/60"
                        : milesSinceOil != null && milesSinceOil > yThr
                        ? "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950/40 dark:hover:bg-yellow-950/60"
                        : "";
                    return (
                      <TableRow key={t.id} className={rowTone}>
                        <TableCell>
                          <Input
                            key={t.source ?? "empty-src"}
                            defaultValue={t.source ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if (v !== (t.source ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { source: v } });
                              }
                            }}
                            className={bareInput}
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{t.truck_number}</TableCell>
                        <TableCell>
                          <Input
                            key={t.oil_change_date ?? "empty"}
                            defaultValue={fmtDate(t.oil_change_date)}
                            placeholder="MM/DD/YYYY"
                            onBlur={(e) => {
                              const parsed = parseDateInput(e.target.value);
                              if (parsed === "__invalid__") {
                                toast({ title: "Invalid date", description: "Use MM/DD/YYYY", variant: "destructive" });
                                e.target.value = fmtDate(t.oil_change_date);
                                return;
                              }
                              if (parsed !== (t.oil_change_date ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { oil_change_date: parsed } });
                              }
                            }}
                            className={bareInput}
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            key={t.last_oil_change_miles ?? "empty-locm"}
                            type="number"
                            defaultValue={t.last_oil_change_miles ?? ""}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw === "" ? null : Number(raw);
                              if (v !== (t.last_oil_change_miles ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { last_oil_change_miles: v as any } });
                              }
                            }}
                            className={cn(bareInput, "no-spinner")}
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(t.miles_updated_at)}
                        </TableCell>
                        <TableCell>
                          <Input
                            key={t.miles ?? "empty-miles"}
                            type="number"
                            defaultValue={t.miles ?? ""}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw === "" ? null : Number(raw);
                              if (v !== (t.miles ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { miles: v as any } });
                              }
                            }}
                            className={cn(bareInput, "no-spinner")}
                          />
                        </TableCell>
                        <TableCell>
                          {fmtNum(milesSinceOil)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const fileName = odometerFileMap[t.id] ?? null;
                            const inputId = `odom-${t.id}`;
                            return (
                              <div className="flex items-center gap-1">
                                <input
                                  id={inputId}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadOdometer(t.id, f);
                                    e.target.value = "";
                                  }}
                                />
                                {fileName ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1"
                                      onClick={() => viewOdometer(t.id, fileName)}
                                      title="View odometer"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1"
                                      onClick={() => document.getElementById(inputId)?.click()}
                                      title="Replace odometer"
                                    >
                                      <RefreshCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1 text-xs"
                                    onClick={() => document.getElementById(inputId)?.click()}
                                    title="Upload odometer"
                                  >
                                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                                  </Button>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Textarea
                            key={t.oil_change_note ?? "empty-note"}
                            defaultValue={t.oil_change_note ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if (v !== (t.oil_change_note ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { oil_change_note: v as any } });
                              }
                            }}
                            className={cn(bareInput, "min-h-7 py-1 resize-none")}
                            placeholder="—"
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            key={t.last_oc_invoice ?? "empty-inv"}
                            defaultValue={t.last_oc_invoice ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if (v !== (t.last_oc_invoice ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { last_oc_invoice: v as any } });
                              }
                            }}
                            className={bareInput}
                            placeholder="—"
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            key={t.air_filter ?? "empty-af"}
                            type="number"
                            defaultValue={t.air_filter ?? ""}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw === "" ? null : parseInt(raw, 10);
                              if (v !== (t.air_filter ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { air_filter: v as any } });
                              }
                            }}
                            className={cn(bareInput, "no-spinner")}
                            readOnly={!canEditAll}
                          />
                        </TableCell>
                        <TableCell className={cn(milesSinceAF != null && milesSinceAF > 60000 && "text-destructive font-semibold")}>
                          {fmtNum(milesSinceAF)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          <p className="text-xs text-muted-foreground mt-3">
            Miles since last oil change and mil since last AF are computed from current mileage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveOilChange;