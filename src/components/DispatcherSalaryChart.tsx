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
  const { data: rows = [] } = useQuery({
    queryKey: ["dispatcher-salary-chart"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("month, user_id, calculated_salary");
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Aggregate to one salary per dispatcher per month (calculated_salary is
  // duplicated across payment rows; take MAX). Filter dispatchers with < $500
  // for the month to exclude noise/placeholder rows.
  const perDispatcherByMonth = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // month -> user_id -> salary
    for (const r of rows) {
      const m = (r as any).month as string | null;
      const uid = (r as any).user_id as string | null;
      const cs = Number((r as any).calculated_salary) || 0;
      if (!m || !uid) continue;
      let inner = map.get(m);
      if (!inner) {
        inner = new Map();
        map.set(m, inner);
      }
      const prev = inner.get(uid) ?? 0;
      if (cs > prev) inner.set(uid, cs);
    }
    return map;
  }, [rows]);

  const allMonths = useMemo(
    () => Array.from(perDispatcherByMonth.keys()).sort(),
    [perDispatcherByMonth],
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
    for (const [m, inner] of perDispatcherByMonth) {
      if (!activeMonths.has(m)) continue;
      let total = 0;
      let count = 0;
      for (const salary of inner.values()) {
        if (salary < 500) continue;
        total += salary;
        count += 1;
      }
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
  }, [perDispatcherByMonth, activeMonths]);

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
              {aggregate.count} payment{aggregate.count === 1 ? "" : "s"} across {aggregate.months} month
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