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
import { toast } from "sonner";

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
  { key: "make", label: "Make", width: "w-[127px]" },
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
];

const TOTAL_W = 1440;

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
           company_id,
           companies:company_id ( name ),
           driver1:drivers!trucks_driver1_id_fkey ( first_name, last_name, weekly_payment, weeks_count )`
        )
        .eq("is_active", true)
        .order("truck_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TruckRow[];
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
                      return (
                        <TableRow key={t.id}>
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