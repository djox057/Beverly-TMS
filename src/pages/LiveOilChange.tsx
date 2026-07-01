import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, parseISO, isValid } from "date-fns";
import { Droplet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TruckRow = {
  id: string;
  truck_number: string;
  source: string | null;
  oil_change_date: string | null;
  last_oil_change_miles: number | null;
  miles: number | null;
  miles_updated_at: string | null;
  air_filter: number | null;
  is_active: boolean;
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
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<Record<string, string>>({});

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ["live-oil-change-trucks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, source, oil_change_date, last_oil_change_miles, miles, miles_updated_at, air_filter, is_active")
        .eq("is_active", true)
        .order("truck_number");
      if (error) throw error;
      return (data ?? []) as TruckRow[];
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trucks;
    return trucks.filter(t =>
      (t.truck_number ?? "").toLowerCase().includes(q) ||
      (t.source ?? "").toLowerCase().includes(q)
    );
  }, [trucks, search]);

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
          <div className="relative w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search unit or source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
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
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Input
                            defaultValue={t.source ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if (v !== (t.source ?? null)) {
                                updateTruck.mutate({ id: t.id, patch: { source: v } });
                              }
                            }}
                            className={bareInput}
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
                          />
                        </TableCell>
                        <TableCell>
                          <Input
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
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(t.miles_updated_at)}
                        </TableCell>
                        <TableCell>
                          <Input
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
                        <TableCell className={cn(milesSinceOil != null && milesSinceOil > 25000 && "text-destructive font-semibold")}>
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
                            value={invoices[t.id] ?? ""}
                            onChange={(e) => setInvoices((s) => ({ ...s, [t.id]: e.target.value }))}
                            className={bareInput}
                            placeholder="—"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
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
            Note and Last OC invoice are session-local (not persisted). Miles since last oil change and mil since last AF are computed from current mileage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveOilChange;