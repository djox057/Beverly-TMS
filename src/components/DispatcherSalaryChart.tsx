import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsAggregatesDailyRows } from "@/hooks/useAnalyticsAggregates";

function monthLabel(m: string) {
  const [y, mm] = m.split("-");
  if (!y || !mm) return m;
  return format(new Date(Number(y), Number(mm) - 1, 1), "MMM yyyy");
}

type PresetKey =
  | "all"
  | "ytd"
  | "year"
  | "prev_year"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "prev_q"
  | "custom";

export function DispatcherSalaryChart() {
  // Per-dispatcher monthly freight & commission base, from analytics_locked_daily
  const { data: dailyRows = [] } = useAnalyticsAggregatesDailyRows("dispatcher", "delivery");

  // Dispatcher pay rates (gross_percent, cut_percent) — keyed by both full_name and user_id
  const { data: profileRates = { byName: {}, byUserId: {}, nameToUserId: {} } } = useQuery({
    queryKey: ["dispatcher-salary-chart", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, user_id, gross_percent, cut_percent");
      if (error) throw error;
      const byName: Record<string, { g: number; c: number }> = {};
      const byUserId: Record<string, { g: number; c: number }> = {};
      const nameToUserId: Record<string, string> = {};
      for (const p of (data as any[]) || []) {
        const g = p.gross_percent != null ? Number(p.gross_percent) / 100 : 0.01;
        const c = p.cut_percent != null ? Number(p.cut_percent) / 100 : 0.05;
        if (p.full_name) {
          byName[p.full_name] = { g, c };
          if (p.user_id) nameToUserId[p.full_name] = p.user_id;
        }
        if (p.user_id) byUserId[p.user_id] = { g, c };
      }
      return { byName, byUserId, nameToUserId };
    },
    staleTime: 15 * 60 * 1000,
  });

  // Monthly bonuses per dispatcher user_id
  const { data: bonuses = {} } = useQuery({
    queryKey: ["dispatcher-salary-chart", "bonuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatcher_monthly_bonuses")
        .select("user_id, month, amount");
      if (error) throw error;
      const map: Record<string, number> = {}; // key: user_id|month
      for (const b of (data as any[]) || []) {
        if (!b.user_id || !b.month) continue;
        map[`${b.user_id}|${b.month}`] = (map[`${b.user_id}|${b.month}`] || 0) + (Number(b.amount) || 0);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Additionals (charges, additions, applied penalties) per dispatcher month
  const { data: additionals = {} } = useQuery({
    queryKey: ["dispatcher-salary-chart", "additionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("user_id, month, additionals");
      if (error) throw error;
      const map: Record<string, any[]> = {}; // key: user_id|month -> additionals[]
      for (const r of (data as any[]) || []) {
        if (!r.user_id || !r.month) continue;
        const key = `${r.user_id}|${r.month}`;
        const arr = Array.isArray(r.additionals) ? r.additionals : [];
        map[key] = (map[key] || []).concat(arr);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Build: name -> month -> { freight, driverPay }
  const perDispatcherByMonth = useMemo(() => {
    const map = new Map<string, Map<string, { freight: number; driverPay: number }>>();
    for (const r of dailyRows) {
      const name = r.entity_name || r.entity_id;
      if (!name || !r.date) continue;
      const month = r.date.slice(0, 7); // YYYY-MM
      let inner = map.get(name);
      if (!inner) {
        inner = new Map();
        map.set(name, inner);
      }
      const prev = inner.get(month) || { freight: 0, driverPay: 0 };
      prev.freight += Number(r.total_freight) || 0;
      prev.driverPay += Number(r.total_driver_pay_effective) || 0;
      inner.set(month, prev);
    }
    return map;
  }, [dailyRows]);

  // Compute salary per dispatcher per month using rates + bonuses + additionals
  const salaryByMonth = useMemo(() => {
    // month -> array of salaries (one per dispatcher, filtered >= $500)
    const out = new Map<string, number[]>();
    for (const [name, months] of perDispatcherByMonth) {
      const rate =
        profileRates.byName[name] ||
        (profileRates.nameToUserId[name] && profileRates.byUserId[profileRates.nameToUserId[name]]) ||
        { g: 0.01, c: 0.05 };
      const userId = profileRates.nameToUserId[name] || null;
      for (const [month, agg] of months) {
        const baseRate = agg.freight * rate.g + Math.max(0, agg.freight - agg.driverPay) * rate.c;
        const bonus = userId ? (bonuses[`${userId}|${month}`] || 0) : 0;
        const adds = userId ? (additionals[`${userId}|${month}`] || []) : [];
        let adjTotal = 0;
        for (const a of adds) {
          if (!a) continue;
          const amt = a.percent != null ? (baseRate * Number(a.percent)) / 100 : Number(a.amount) || 0;
          if (a.type === "addition") adjTotal += amt;
          else if (a.type === "charge") adjTotal -= amt;
          else if (a.type === "penalty" && a.applied) adjTotal -= amt;
        }
        const salary = baseRate + bonus + adjTotal;
        if (salary < 500) continue;
        if (!out.has(month)) out.set(month, []);
        out.get(month)!.push(salary);
      }
    }
    return out;
  }, [perDispatcherByMonth, profileRates, bonuses, additionals]);

  const allMonths = useMemo(
    () => Array.from(salaryByMonth.keys()).sort(),
    [salaryByMonth],
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-based

  const [preset, setPreset] = useState<PresetKey>("all");
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

  const activeMonths = useMemo(() => {
    const inRange = (m: string, y: number, months: number[]) => {
      const [yy, mm] = m.split("-").map(Number);
      return yy === y && months.includes(mm);
    };
    switch (preset) {
      case "all":
        return new Set(allMonths);
      case "ytd": {
        const months = Array.from({ length: currentMonthIdx + 1 }, (_, i) => i + 1);
        return new Set(allMonths.filter((m) => inRange(m, currentYear, months)));
      }
      case "year":
        return new Set(allMonths.filter((m) => m.startsWith(`${currentYear}-`)));
      case "prev_year":
        return new Set(allMonths.filter((m) => m.startsWith(`${currentYear - 1}-`)));
      case "q1":
        return new Set(allMonths.filter((m) => inRange(m, currentYear, [1, 2, 3])));
      case "q2":
        return new Set(allMonths.filter((m) => inRange(m, currentYear, [4, 5, 6])));
      case "q3":
        return new Set(allMonths.filter((m) => inRange(m, currentYear, [7, 8, 9])));
      case "q4":
        return new Set(allMonths.filter((m) => inRange(m, currentYear, [10, 11, 12])));
      case "prev_q": {
        const q = Math.floor(currentMonthIdx / 3); // 0..3 current
        const prev = q === 0 ? 3 : q - 1;
        const year = q === 0 ? currentYear - 1 : currentYear;
        const months = [prev * 3 + 1, prev * 3 + 2, prev * 3 + 3];
        return new Set(allMonths.filter((m) => inRange(m, year, months)));
      }
      case "custom":
        return new Set(Array.from(selectedMonths).filter((m) => allMonths.includes(m)));
    }
  }, [preset, selectedMonths, allMonths, currentYear, currentMonthIdx]);

  const chartData = useMemo(() => {
    const buckets: Array<[string, { total: number; count: number }]> = [];
    for (const [m, salaries] of salaryByMonth) {
      if (!activeMonths.has(m)) continue;
      const total = salaries.reduce((s, v) => s + v, 0);
      const count = salaries.length;
      if (count > 0) buckets.push([m, { total, count }]);
    }
    return buckets
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => ({
        key,
        label: monthLabel(key),
        avg: Math.round(v.total / v.count),
        count: v.count,
      }));
  }, [salaryByMonth, activeMonths]);

  const aggregate = useMemo(() => {
    const totals = chartData.reduce(
      (acc, d) => {
        acc.total += d.avg * d.count;
        acc.count += d.count;
        return acc;
      },
      { total: 0, count: 0 },
    );
    return {
      avg: totals.count > 0 ? Math.round(totals.total / totals.count) : 0,
      count: totals.count,
      months: chartData.length,
    };
  }, [chartData]);

  const periodLabel = (() => {
    switch (preset) {
      case "all":
        return "All time";
      case "ytd":
        return `YTD ${currentYear}`;
      case "year":
        return `${currentYear}`;
      case "prev_year":
        return `${currentYear - 1}`;
      case "q1":
        return `Q1 ${currentYear}`;
      case "q2":
        return `Q2 ${currentYear}`;
      case "q3":
        return `Q3 ${currentYear}`;
      case "q4":
        return `Q4 ${currentYear}`;
      case "prev_q":
        return "Previous quarter";
      case "custom":
        return selectedMonths.size === 0
          ? "No months selected"
          : `${selectedMonths.size} month${selectedMonths.size === 1 ? "" : "s"}`;
    }
  })();

  const presets: { key: PresetKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "ytd", label: "YTD" },
    { key: "year", label: `${currentYear}` },
    { key: "prev_year", label: `${currentYear - 1}` },
    { key: "q1", label: "Q1" },
    { key: "q2", label: "Q2" },
    { key: "q3", label: "Q3" },
    { key: "q4", label: "Q4" },
    { key: "prev_q", label: "Prev Q" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <CardTitle>Avg Dispatcher Salary</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={preset === "custom" ? "default" : "outline"}
                >
                  Months
                  {preset === "custom" && selectedMonths.size > 0 && (
                    <span className="ml-1">({selectedMonths.size})</span>
                  )}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-medium text-muted-foreground">Select months</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setSelectedMonths(new Set());
                      setPreset("all");
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {allMonths.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">No months available.</p>
                  )}
                  {[...allMonths].reverse().map((m) => {
                    const checked = selectedMonths.has(m);
                    return (
                      <label
                        key={m}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedMonths((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(m);
                              else next.delete(m);
                              return next;
                            });
                            setPreset("custom");
                          }}
                        />
                        {monthLabel(m)}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pt-1">
            <div>
              <p className="text-xs text-muted-foreground">Avg Disp. Salary — {periodLabel}</p>
              <p className="text-2xl font-bold">
                ${aggregate.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
      {aggregate.count} dispatcher-month{aggregate.count === 1 ? "" : "s"} across {aggregate.months} month
              {aggregate.months === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No salary data for this period.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                  formatter={(v: any, name: string) =>
                    name === "avg"
                      ? [`$${Number(v).toLocaleString()}`, "Avg salary"]
                      : [v, name]
                  }
                  labelFormatter={(l, payload) => {
                    const p: any = payload?.[0]?.payload;
                    return p ? `${l} — ${p.count} dispatcher${p.count === 1 ? "" : "s"}` : l;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(142 76% 36%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}