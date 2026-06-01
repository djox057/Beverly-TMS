import { useMemo, useState, useEffect } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Warehouse, PaintBucket } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format as formatDate } from "date-fns";

const ALLOWED = ["manager", "admin", "recruiting", "chicago_management"] as const;

type TruckRow = {
  id: string;
  truck_number: string;
  make: string | null;
  model: string | null;
  transmission: string | null;
  year: number | null;
  miles: number | null;
  engine: string | null;
  has_apu_webasto: boolean;
  has_inverter: boolean;
  has_fridge: boolean;
  company_id: string | null;
  truck_sales_status: string | null;
  companies: { name: string | null } | null;
  driver1:
    | {
        first_name: string | null;
        last_name: string | null;
        weekly_payment: number | null;
        weeks_count: number | null;
      }
    | null;
};

const COLS: { key: string; label: string; width: string; align?: string }[] = [
  { key: "truck_number", label: "Truck #", width: "w-[90px]" },
  { key: "make", label: "Make", width: "w-[140px]" },
  { key: "model", label: "Model", width: "w-[110px]" },
  { key: "transmission", label: "Transmission", width: "w-[130px]" },
  { key: "year", label: "Year", width: "w-[80px]", align: "text-right" },
  { key: "miles", label: "Miles", width: "w-[110px]", align: "text-right" },
  { key: "engine", label: "Engine", width: "w-[120px]" },
  { key: "has_apu_webasto", label: "APU/Webasto", width: "w-[120px]", align: "text-center" },
  { key: "has_inverter", label: "Inverter", width: "w-[90px]", align: "text-center" },
  { key: "has_fridge", label: "Fridge", width: "w-[80px]", align: "text-center" },
  { key: "driver", label: "Driver", width: "w-[200px]" },
  { key: "price_week", label: "Price (week)", width: "w-[120px]", align: "text-right" },
  { key: "terms", label: "Terms", width: "w-[100px]", align: "text-right" },
  { key: "status", label: "Status", width: "w-[60px]", align: "text-center" },
];

const TOTAL_W = 1500;

type StatusDef = { value: string; label: string; bg: string; text: string };

// Colors mirror the reference sheet. Use solid hex + readable text color.
const STATUS_OPTIONS: StatusDef[] = [
  { value: "READY", label: "READY", bg: "#00FF00", text: "#000000" },
  { value: "DRIVERS_ON_ROAD", label: "DRIVERS ON ROAD", bg: "#FF0000", text: "#FFFFFF" },
  { value: "RECOVERY", label: "RECOVERY", bg: "#FF9900", text: "#000000" },
  { value: "SHOP", label: "SHOP", bg: "#FFFF00", text: "#000000" },
  { value: "BACK_UP_TRUCKS", label: "BACK UP TRUCKS", bg: "#FF00FF", text: "#FFFFFF" },
  { value: "NOT_FOR_USED", label: "NOT FOR USED", bg: "#000000", text: "#FFFFFF" },
  { value: "NEW_DRIVER", label: "NEW DRIVER", bg: "#FFFFFF", text: "#000000" },
  { value: "NEW_TRUCK", label: "NEW TRUCK", bg: "#00FFFF", text: "#000000" },
  { value: "DRIVER_LEFT_TRUCK", label: "DRIVER LEFT TRUCK ON LOT FOR A FEW DAYS", bg: "#38761D", text: "#FFFFFF" },
  { value: "SUB_UNIT", label: "SUB UNIT", bg: "#93C47D", text: "#000000" },
];

const STATUS_MAP = new Map(STATUS_OPTIONS.map((s) => [s.value, s]));

const formatMiles = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(n);
const formatUSD = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

function EditableText({
  value,
  onSave,
  type = "text",
  className = "",
}: {
  value: string | number | null;
  onSave: (v: string) => void;
  type?: "text" | "number";
  className?: string;
}) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  return (
    <Input
      type={type}
      value={local}
      placeholder="—"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== (value == null ? "" : String(value))) onSave(local);
      }}
      className={`h-8 text-sm bg-transparent border-0 shadow-none rounded-none px-1 focus-visible:ring-0 focus-visible:bg-muted/40 hover:bg-muted/30 transition-colors placeholder:text-muted-foreground [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
    />
  );
}

function YesNoBadge({ value }: { value: boolean }) {
  return value ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
      Yes
    </Badge>
  ) : (
    <Badge variant="secondary">No</Badge>
  );
}

const TruckSales = () => {
  const { hasRole, loading } = useAuthContext();
  const queryClient = useQueryClient();

  const allowed = ALLOWED.some((r) => hasRole(r as any));
  const canEdit = allowed;
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["truck-sales"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select(
          `id, truck_number, make, model, transmission, year, miles, engine,
           has_apu_webasto, has_inverter, has_fridge,
           company_id, truck_sales_status,
           companies:company_id ( name ),
           driver1:drivers!trucks_driver1_id_fkey ( first_name, last_name, weekly_payment, weeks_count )`
        )
        .eq("is_active", true)
        .order("truck_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TruckRow[];
    },
  });

  const { data: yardActionsByTruck } = useQuery({
    enabled: allowed,
    queryKey: ["truck-sales-yard-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_yard_actions")
        .select(
          `id, action_type, comment, arrival_datetime, created_at, is_checked, truck_number,
           drivers:driver_id ( first_name, last_name )`
        )
        .eq("is_checked", false)
        .not("truck_number", "is", null);
      if (error) throw error;
      const map = new Map<string, any[]>();
      (data || []).forEach((a: any) => {
        const key = a.truck_number;
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(a);
      });
      return map;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; trucks: TruckRow[] }>();
    (data || []).forEach((t) => {
      if (!t.company_id || !t.companies?.name) return;
      const key = t.company_id;
      const name = t.companies.name;
      if (!map.has(key)) map.set(key, { name, trucks: [] });
      map.get(key)!.trucks.push(t);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [data]);

  useEffect(() => {
    if (!selectedCompany && grouped.length > 0) {
      setSelectedCompany(grouped[0].name);
    }
  }, [grouped, selectedCompany]);

  const updateTruck = async (id: string, patch: Partial<TruckRow>) => {
    // Optimistic
    queryClient.setQueryData<TruckRow[]>(["truck-sales"], (prev) =>
      (prev || []).map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
    const { error } = await supabase.from("trucks").update(patch as any).eq("id", id);
    if (error) {
      toast.error(`Update failed: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: ["truck-sales"] });
    }
  };

  if (loading) return null;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Truck Sales</h1>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && grouped.length > 0 && (() => {
        const active =
          grouped.find((g) => g.name === selectedCompany) || grouped[0];
        return (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="flex flex-wrap items-center gap-1 text-base sm:text-lg">
                  {grouped.map((g, i) => (
                    <span key={g.name} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-muted-foreground/40">/</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedCompany(g.name)}
                        className={
                          active.name === g.name
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground/50 hover:text-muted-foreground font-normal"
                        }
                      >
                        {g.name}
                      </button>
                    </span>
                  ))}
                </CardTitle>
                <span className="text-sm font-normal text-muted-foreground">
                  {active.trucks.length} truck
                  {active.trucks.length === 1 ? "" : "s"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="table-fixed" style={{ minWidth: TOTAL_W }}>
                  <TableHeader>
                    <TableRow>
                      {COLS.map((c) => (
                        <TableHead
                          key={c.key}
                          className={`${c.width} ${c.align || ""} whitespace-nowrap`}
                        >
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.trucks.map((t) => {
                      const driverName =
                        [t.driver1?.first_name, t.driver1?.last_name]
                          .filter(Boolean)
                          .join(" ") || "—";
                      const priceWeek = t.driver1?.weekly_payment ?? null;
                      const weeksCount = t.driver1?.weeks_count ?? null;
                      const status = t.truck_sales_status
                        ? STATUS_MAP.get(t.truck_sales_status) || null
                        : null;
                      const rowStyle = status
                        ? { backgroundColor: status.bg, color: status.text }
                        : undefined;
                      return (
                        <TableRow
                          key={t.id}
                          style={rowStyle}
                          className={status ? "hover:opacity-90" : undefined}
                        >
                          <TableCell className="font-medium w-[90px]">{t.truck_number}</TableCell>
                          <TableCell>
                            {canEdit ? (
                              <EditableText
                                value={t.make}
                                onSave={(v) => updateTruck(t.id, { make: v || null })}
                              />
                            ) : (
                              t.make || "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit ? (
                              <EditableText
                                value={t.model}
                                onSave={(v) => updateTruck(t.id, { model: v || null })}
                              />
                            ) : (
                              t.model || "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit ? (
                              <EditableText
                                value={t.transmission}
                                onSave={(v) =>
                                  updateTruck(t.id, { transmission: v || null })
                                }
                              />
                            ) : (
                              t.transmission || "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <EditableText
                                type="number"
                                value={t.year}
                                onSave={(v) =>
                                  updateTruck(t.id, {
                                    year: v === "" ? null : Number(v),
                                  })
                                }
                                className="text-right"
                              />
                            ) : (
                              t.year ?? "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <EditableText
                                type="number"
                                value={t.miles}
                                onSave={(v) =>
                                  updateTruck(t.id, {
                                    miles: v === "" ? null : Number(v),
                                  })
                                }
                                className="text-right"
                              />
                            ) : (
                              formatMiles(t.miles)
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit ? (
                              <EditableText
                                value={t.engine}
                                onSave={(v) => updateTruck(t.id, { engine: v || null })}
                              />
                            ) : (
                              t.engine || "—"
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {canEdit ? (
                              <Switch
                                checked={t.has_apu_webasto}
                                onCheckedChange={(v) =>
                                  updateTruck(t.id, { has_apu_webasto: v })
                                }
                              />
                            ) : (
                              <YesNoBadge value={t.has_apu_webasto} />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {canEdit ? (
                              <Switch
                                checked={t.has_inverter}
                                onCheckedChange={(v) =>
                                  updateTruck(t.id, { has_inverter: v })
                                }
                              />
                            ) : (
                              <YesNoBadge value={t.has_inverter} />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {canEdit ? (
                              <Switch
                                checked={t.has_fridge}
                                onCheckedChange={(v) =>
                                  updateTruck(t.id, { has_fridge: v })
                                }
                              />
                            ) : (
                              <YesNoBadge value={t.has_fridge} />
                            )}
                          </TableCell>
                          <TableCell>{driverName}</TableCell>
                          <TableCell className="text-right">{formatUSD(priceWeek)}</TableCell>
                          <TableCell className="text-right">
                            {weeksCount == null ? "—" : `${weeksCount} wk${weeksCount === 1 ? "" : "s"}`}
                          </TableCell>
                          <TableCell className="text-center">
                            {canEdit ? (
                              <Select
                                value={t.truck_sales_status ?? "__none__"}
                                onValueChange={(v) =>
                                  updateTruck(t.id, {
                                    truck_sales_status: v === "__none__" ? null : v,
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-8 mx-auto justify-center bg-transparent border-0 shadow-none p-0 focus:ring-0 [&>svg]:hidden"
                                  title={status?.label ?? "Set status"}
                                >
                                  <span
                                    className="inline-block w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                    style={{ backgroundColor: status?.bg ?? "transparent", borderStyle: status ? "solid" : "dashed" }}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— None —</SelectItem>
                                  {STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      <span className="inline-flex items-center gap-2">
                                        <span
                                          className="inline-block w-3 h-3 rounded-full border border-border"
                                          style={{ backgroundColor: s.bg }}
                                        />
                                        {s.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              status ? (
                                <span
                                  title={status.label}
                                  className="inline-block w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                  style={{ backgroundColor: status.bg }}
                                />
                              ) : "—"
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              const ya = yardActionsByTruck?.get(t.truck_number) || [];
                              if (ya.length === 0) return <span className="text-muted-foreground/60">—</span>;
                              return (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      title={`${ya.length} yard arrival${ya.length === 1 ? "" : "s"}`}
                                      className="relative inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 transition-colors"
                                    >
                                      <Warehouse size={16} />
                                      {ya.length > 1 && (
                                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full bg-amber-600 text-white flex items-center justify-center">
                                          {ya.length}
                                        </span>
                                      )}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="end" className="w-80 p-3 space-y-3" style={{ color: "hsl(var(--foreground))", backgroundColor: "hsl(var(--popover))" }}>
                                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                                      Yard arrivals · Truck {t.truck_number}
                                    </div>
                                    {ya.map((a: any) => {
                                      const dn = [a.drivers?.first_name, a.drivers?.last_name].filter(Boolean).join(" ");
                                      const when = a.arrival_datetime || a.created_at;
                                      const typeLabel: Record<string, string> = {
                                        maintenance: "Maintenance",
                                        return_truck: "Return Truck",
                                        safety: "Safety",
                                        recovery: "Recovery",
                                      };
                                      return (
                                        <div key={a.id} className="text-sm border border-border rounded-md p-2 space-y-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{typeLabel[a.action_type] || a.action_type}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {when ? formatDate(new Date(when), "MMM d, HH:mm") : "—"}
                                            </span>
                                          </div>
                                          {dn && <div className="text-xs text-muted-foreground">Driver: {dn}</div>}
                                          {a.comment && <div className="text-xs whitespace-pre-wrap">{a.comment}</div>}
                                        </div>
                                      );
                                    })}
                                  </PopoverContent>
                                </Popover>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
};

export default TruckSales;