import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, parseISO, isValid } from "date-fns";
import { Droplet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
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
  is_active: boolean;
  driver1_id: string | null;
  driver_name?: string | null;
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
      .channel("live-oil-change-trucks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
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
  const { getPrimaryRole } = useAuthContext();
  const primaryRole = getPrimaryRole();
  // Dispatch may only edit the "Total mileage - last update" (miles) field.
  const canEditAll = primaryRole !== 'dispatch';
  const canEditMiles = true;
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ["live-oil-change-trucks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, source, oil_change_date, last_oil_change_miles, miles, miles_updated_at, air_filter, last_oc_invoice, is_active, driver1_id, driver1:drivers!trucks_driver1_id_fkey(first_name, last_name, company_id, companies:companies(id, name))")
        .eq("is_active", true)
        .order("truck_number");
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        driver_name: t.driver1
          ? `${t.driver1.first_name ?? ""} ${t.driver1.last_name ?? ""}`.trim()
          : null,
        company_id: t.driver1?.company_id ?? null,
        company_name: t.driver1?.companies?.name ?? null,
      })) as TruckRow[];
    },
  });

  const updateTruck = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TruckRow> }) => {
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

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    trucks.forEach(t => { if (t.company_id && t.company_name) map.set(t.company_id, t.company_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [trucks]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    trucks.forEach(t => { if (t.source) set.add(t.source); });
    return Array.from(set).sort();
  }, [trucks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trucks.filter(t => {
      if (q) {
        const matches =
          (t.truck_number ?? "").toLowerCase().includes(q) ||
          (t.driver_name ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (companyFilter !== "all" && t.company_id !== companyFilter) return false;
      if (sourceFilter !== "all" && (t.source ?? "") !== sourceFilter) return false;
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
  }, [trucks, search, companyFilter, sourceFilter, milesFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
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
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Source</TableHead>
                  <TableHead className="w-[80px]">Unit</TableHead>
                  <TableHead className="w-[130px]">Last oil change date</TableHead>
                  <TableHead className="w-[170px]">Last oil change mileage</TableHead>
                  <TableHead className="w-[120px]">Last Update</TableHead>
                  <TableHead className="w-[180px]">Total mileage - last update</TableHead>
                  <TableHead className="w-[170px]">Miles since last oil change</TableHead>
                  <TableHead className="w-[180px]">Note</TableHead>
                  <TableHead className="w-[90px] whitespace-normal leading-tight">last OC<br/>invoice</TableHead>
                  <TableHead className="w-[110px]">AIR FILTER</TableHead>
                  <TableHead className="w-[90px] whitespace-normal leading-tight">mil since<br/>last AF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
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
                    const rowTone =
                      milesSinceOil != null && milesSinceOil > 28000
                        ? "bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-950/60"
                        : milesSinceOil != null && milesSinceOil > 26000
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
                          <Textarea
                            value={notes[t.id] ?? ""}
                            onChange={(e) => setNotes((s) => ({ ...s, [t.id]: e.target.value }))}
                            className={cn(bareInput, "min-h-7 py-1 resize-none")}
                            placeholder="—"
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
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note is session-local (not persisted). Miles since last oil change and mil since last AF are computed from current mileage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveOilChange;