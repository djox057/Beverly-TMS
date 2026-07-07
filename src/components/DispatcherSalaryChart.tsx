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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface DispatcherSalaryChartProps {
  orders?: any[];
}

const LINE_PALETTE = [
  "hsl(142 76% 36%)",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(280 70% 55%)",
  "hsl(0 72% 51%)",
  "hsl(190 80% 45%)",
  "hsl(20 85% 55%)",
  "hsl(340 80% 55%)",
  "hsl(90 60% 40%)",
  "hsl(250 70% 60%)",
];

export function DispatcherSalaryChart({ orders = [] }: DispatcherSalaryChartProps) {
  // Per-dispatcher monthly freight & driver pay, computed from already-loaded
  // orders on the Analytics page (no refetch).
  const orderRows = orders;

  // Dispatcher pay rates (gross_percent, cut_percent) — keyed by both full_name and user_id
  const { data: profileRates = { byName: {}, byUserId: {}, nameToUserId: {}, userIdToName: {} } } = useQuery({
    queryKey: ["dispatcher-salary-chart", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, user_id, gross_percent, cut_percent");
      if (error) throw error;
      const byName: Record<string, { g: number; c: number }> = {};
      const byUserId: Record<string, { g: number; c: number }> = {};
      const nameToUserId: Record<string, string> = {};
      const userIdToName: Record<string, string> = {};
      for (const p of (data as any[]) || []) {
        const g = p.gross_percent != null ? Number(p.gross_percent) / 100 : 0.01;
        const c = p.cut_percent != null ? Number(p.cut_percent) / 100 : 0.05;
        if (p.full_name) {
          byName[p.full_name] = { g, c };
          if (p.user_id) nameToUserId[p.full_name] = p.user_id;
        }
        if (p.user_id) {
          byUserId[p.user_id] = { g, c };
          if (p.full_name) userIdToName[p.user_id] = p.full_name;
        }
      }
      return { byName, byUserId, nameToUserId, userIdToName };
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

  // Build: bookedByKey (uuid or name) -> month -> { freight, driverPay, freightToDay, driverPayToDay }
  // Month uses America/Chicago on delivery_datetime to match salary period.
  // `*ToDay` sums only orders whose day-of-month <= today's Chicago day-of-month,
  // used to compute the current-month projection.
  const chicagoParts = (iso: string): { y: string; m: string; d: string } | null => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(iso));
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      return y && m && d ? { y, m, d } : null;
    } catch {
      return null;
    }
  };

  const todayChicago = useMemo(() => chicagoParts(new Date().toISOString()), []);
  const todayDay = todayChicago ? Number(todayChicago.d) : new Date().getDate();

  const perDispatcherByMonth = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { freight: number; driverPay: number; freightToDay: number; driverPayToDay: number }>
    >();
    for (const o of orderRows) {
      const key = (o.bookedBy ?? o.booked_by) as string | null;
      const deliveryIso = (o.deliveryDatetime ?? o.delivery_datetime) as string | null;
      if (!key || !deliveryIso) continue;
      const canceled = !!o.canceled;
      const tonu = Number(o.tonu) || 0;
      const tonuDriver = Number(o.tonuDriver ?? o.tonu_driver) || 0;
      if (canceled && tonu <= 0 && tonuDriver <= 0) continue;
      const freight = canceled ? tonu : Number(o.freightAmount ?? o.freight_amount) || 0;
      const driverPay = canceled ? tonuDriver : Number(o.driverPrice ?? o.driver_price) || 0;
      const parts = chicagoParts(deliveryIso);
      if (!parts) continue;
      const month = `${parts.y}-${parts.m}`;
      const dayOfMonth = Number(parts.d);
      let inner = map.get(key);
      if (!inner) {
        inner = new Map();
        map.set(key, inner);
      }
      const prev = inner.get(month) || { freight: 0, driverPay: 0, freightToDay: 0, driverPayToDay: 0 };
      prev.freight += freight;
      prev.driverPay += driverPay;
      if (dayOfMonth <= todayDay) {
        prev.freightToDay += freight;
        prev.driverPayToDay += driverPay;
      }
      inner.set(month, prev);
    }
    return map;
  }, [orderRows, todayDay]);

  const currentMonthKey = todayChicago ? `${todayChicago.y}-${todayChicago.m}` : null;

  // Global projection ratio: how much a full month scales up from the
  // portion accumulated through today's day-of-month, based on historical
  // (completed) months in the dataset.
  const projectionRatio = useMemo(() => {
    let fullSum = 0;
    let toDaySum = 0;
    for (const [, months] of perDispatcherByMonth) {
      for (const [month, agg] of months) {
        if (month === currentMonthKey) continue;
        fullSum += agg.freight;
        toDaySum += agg.freightToDay;
      }
    }
    if (toDaySum <= 0 || fullSum <= 0) return null;
    const r = fullSum / toDaySum;
    return r > 1 ? r : null;
  }, [perDispatcherByMonth, currentMonthKey]);

  // Compute salary per dispatcher per month using rates + bonuses + additionals.
  // Also compute a projected salary for the current month by scaling the
  // to-date freight/driverPay using `projectionRatio`.
  //
  // Averages only include dispatchers whose salary is > $700 (hidden filter),
  // but the displayed dispatcher count includes anyone with a meaningful
  // salary (>= $500), so the excluded band isn't visible in the UI.
  const AVG_MIN = 700;
  const COUNT_MIN = 500;
  const { salaryByMonth, countByMonth, projectedSalariesCurrentMonth, projectedCountCurrentMonth } = useMemo(() => {
    const out = new Map<string, number[]>();
    const counts = new Map<string, number>();
    const projected: number[] = [];
    let projectedCount = 0;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [bookedBy, months] of perDispatcherByMonth) {
      const isUuid = uuidRe.test(bookedBy);
      const rate =
        (isUuid ? profileRates.byUserId[bookedBy] : profileRates.byName[bookedBy]) ||
        (!isUuid && profileRates.nameToUserId[bookedBy]
          ? profileRates.byUserId[profileRates.nameToUserId[bookedBy]]
          : undefined) ||
        { g: 0.01, c: 0.05 };
      const userId = isUuid ? bookedBy : profileRates.nameToUserId[bookedBy] || null;
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
        if (salary > AVG_MIN) {
          if (!out.has(month)) out.set(month, []);
          out.get(month)!.push(salary);
        }
        if (salary >= COUNT_MIN) {
          counts.set(month, (counts.get(month) || 0) + 1);
        }

        // Build a projected salary for the current month using historical pace.
        if (month === currentMonthKey && projectionRatio) {
          const projFreight = agg.freight * projectionRatio;
          const projDriverPay = agg.driverPay * projectionRatio;
          const projBase =
            projFreight * rate.g + Math.max(0, projFreight - projDriverPay) * rate.c;
          const projSalary = projBase + bonus + adjTotal;
          if (projSalary > AVG_MIN) projected.push(projSalary);
          if (projSalary >= COUNT_MIN) projectedCount += 1;
        }
      }
    }
    return {
      salaryByMonth: out,
      countByMonth: counts,
      projectedSalariesCurrentMonth: projected,
      projectedCountCurrentMonth: projectedCount,
    };
  }, [perDispatcherByMonth, profileRates, bonuses, additionals, currentMonthKey, projectionRatio]);

  const allMonths = useMemo(
    () => Array.from(new Set([...salaryByMonth.keys(), ...countByMonth.keys()])).sort(),
    [salaryByMonth, countByMonth],
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-based

  const [preset, setPreset] = useState<PresetKey>("all");
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedDispatchers, setSelectedDispatchers] = useState<Set<string>>(new Set());
  const [dispatcherQuery, setDispatcherQuery] = useState("");

  // Per-dispatcher salary series (used when 1+ dispatchers are selected).
  const perDispatcherSalary = useMemo(() => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const out = new Map<string, { name: string; salaryByMonth: Map<string, number>; projByMonth: Map<string, number> }>();
    for (const [bookedBy, months] of perDispatcherByMonth) {
      const isUuid = uuidRe.test(bookedBy);
      const rate =
        (isUuid ? profileRates.byUserId[bookedBy] : profileRates.byName[bookedBy]) ||
        (!isUuid && profileRates.nameToUserId[bookedBy]
          ? profileRates.byUserId[profileRates.nameToUserId[bookedBy]]
          : undefined) ||
        { g: 0.01, c: 0.05 };
      const userId = isUuid ? bookedBy : profileRates.nameToUserId[bookedBy] || null;
      const name = isUuid
        ? (profileRates as any).userIdToName?.[bookedBy] || bookedBy
        : bookedBy;
      const sMap = new Map<string, number>();
      const pMap = new Map<string, number>();
      for (const [month, agg] of months) {
        const base = agg.freight * rate.g + Math.max(0, agg.freight - agg.driverPay) * rate.c;
        const bonus = userId ? bonuses[`${userId}|${month}`] || 0 : 0;
        const adds = userId ? additionals[`${userId}|${month}`] || [] : [];
        let adj = 0;
        for (const a of adds) {
          if (!a) continue;
          const amt = a.percent != null ? (base * Number(a.percent)) / 100 : Number(a.amount) || 0;
          if (a.type === "addition") adj += amt;
          else if (a.type === "charge") adj -= amt;
          else if (a.type === "penalty" && a.applied) adj -= amt;
        }
        sMap.set(month, base + bonus + adj);
        if (month === currentMonthKey && projectionRatio) {
          const pf = agg.freight * projectionRatio;
          const pd = agg.driverPay * projectionRatio;
          const pb = pf * rate.g + Math.max(0, pf - pd) * rate.c;
          pMap.set(month, pb + bonus + adj);
        }
      }
      out.set(bookedBy, { name, salaryByMonth: sMap, projByMonth: pMap });
    }
    return out;
  }, [perDispatcherByMonth, profileRates, bonuses, additionals, currentMonthKey, projectionRatio]);

  const dispatcherOptions = useMemo(() => {
    const arr: { key: string; name: string }[] = [];
    for (const [key, info] of perDispatcherSalary) {
      arr.push({ key, name: info.name });
    }
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [perDispatcherSalary]);

  const filteredDispatcherOptions = useMemo(() => {
    const q = dispatcherQuery.trim().toLowerCase();
    if (!q) return dispatcherOptions;
    return dispatcherOptions.filter((d) => d.name.toLowerCase().includes(q));
  }, [dispatcherOptions, dispatcherQuery]);

  const selectedDispatcherList = useMemo(() => {
    const arr: { key: string; name: string; color: string }[] = [];
    let i = 0;
    for (const key of selectedDispatchers) {
      const info = perDispatcherSalary.get(key);
      arr.push({ key, name: info?.name || key, color: LINE_PALETTE[i % LINE_PALETTE.length] });
      i++;
    }
    return arr;
  }, [selectedDispatchers, perDispatcherSalary]);

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

  const perDispChartData = useMemo(() => {
    if (selectedDispatchers.size === 0) return [] as any[];
    const rows: any[] = [];
    for (const m of allMonths) {
      if (!activeMonths.has(m)) continue;
      const row: any = { key: m, label: monthLabel(m) };
      let hasAny = false;
      for (const key of selectedDispatchers) {
        const info = perDispatcherSalary.get(key);
        if (!info) continue;
        const s = info.salaryByMonth.get(m);
        if (s != null) hasAny = true;
        row[`d_${key}`] = s != null ? Math.round(s) : null;
        const p = info.projByMonth.get(m);
        row[`p_${key}`] = p != null ? Math.round(p) : null;
        if (m === currentMonthKey && p != null) {
          row[`d_${key}`] = null;
        }
      }
      if (hasAny || row.key === currentMonthKey) rows.push(row);
    }
    const idx = rows.findIndex((r) => r.key === currentMonthKey);
    if (idx > 0) {
      for (const key of selectedDispatchers) {
        if (rows[idx][`p_${key}`] != null) {
          rows[idx - 1][`p_${key}`] = rows[idx - 1][`d_${key}`];
        }
      }
    }
    return rows;
  }, [selectedDispatchers, perDispatcherSalary, allMonths, activeMonths, currentMonthKey]);

  const chartData = useMemo(() => {
    const buckets: Array<[string, { total: number; avgCount: number; displayCount: number }]> = [];
    for (const m of allMonths) {
      if (!activeMonths.has(m)) continue;
      const salaries = salaryByMonth.get(m) || [];
      const total = salaries.reduce((s, v) => s + v, 0);
      const avgCount = salaries.length;
      const displayCount = countByMonth.get(m) || avgCount;
      if (avgCount > 0) buckets.push([m, { total, avgCount, displayCount }]);
    }
    const sorted = buckets.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const rows = sorted.map(([key, v]) => ({
      key,
      label: monthLabel(key),
      avg: v.avgCount > 0 ? Math.round(v.total / v.avgCount) : 0,
      count: v.displayCount,
      avgCount: v.avgCount,
      avgProj: null as number | null,
    }));

    // Current-month projection: overlay a dotted projected point.
    if (
      currentMonthKey &&
      projectionRatio &&
      projectedSalariesCurrentMonth.length > 0 &&
      activeMonths.has(currentMonthKey)
    ) {
      const projAvg = Math.round(
        projectedSalariesCurrentMonth.reduce((s, v) => s + v, 0) /
          projectedSalariesCurrentMonth.length,
      );
      // Count every dispatcher with any activity in the current month
      // (not just those projected above the salary threshold).
      let activeThisMonth = 0;
      for (const [, months] of perDispatcherByMonth) {
        const cur = months.get(currentMonthKey);
        if (cur && (cur.freight > 0 || cur.driverPay > 0)) activeThisMonth += 1;
      }
      const projCount = activeThisMonth || projectedCountCurrentMonth || projectedSalariesCurrentMonth.length;
      const idx = rows.findIndex((r) => r.key === currentMonthKey);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], avg: null as any, avgProj: projAvg, count: projCount };
        if (idx > 0) rows[idx - 1] = { ...rows[idx - 1], avgProj: rows[idx - 1].avg };
      } else {
        rows.push({
          key: currentMonthKey,
          label: monthLabel(currentMonthKey),
          avg: null as any,
          count: projCount,
          avgCount: projectedSalariesCurrentMonth.length,
          avgProj: projAvg,
        });
        if (rows.length > 1) {
          const prev = rows[rows.length - 2];
          rows[rows.length - 2] = { ...prev, avgProj: prev.avg };
        }
      }
    }
    return rows;
  }, [allMonths, salaryByMonth, countByMonth, activeMonths, currentMonthKey, projectionRatio, projectedSalariesCurrentMonth, projectedCountCurrentMonth, perDispatcherByMonth]);

  const aggregate = useMemo(() => {
    const totals = chartData.reduce(
      (acc, d) => {
        const a = d.avg == null ? d.avgProj : d.avg;
        const c = d.avgCount ?? d.count;
        if (a != null && c > 0) {
          acc.total += a * c;
          acc.count += c;
        }
        acc.displayCount += d.count;
        return acc;
      },
      { total: 0, count: 0, displayCount: 0 },
    );
    return {
      avg: totals.count > 0 ? Math.round(totals.total / totals.count) : 0,
      count: totals.displayCount,
      months: chartData.length,
    };
  }, [chartData]);

  const prevQuarter = (() => {
    const q = Math.floor(currentMonthIdx / 3); // 0..3 current
    const prev = q === 0 ? 3 : q - 1;
    const year = q === 0 ? currentYear - 1 : currentYear;
    return { q: prev + 1, year };
  })();

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
        return `Q${prevQuarter.q} ${prevQuarter.year}`;
      case "custom":
        return selectedMonths.size === 0
          ? "No months selected"
          : `${selectedMonths.size} month${selectedMonths.size === 1 ? "" : "s"}`;
    }
  })();

  const periodOptions: { key: PresetKey; label: string }[] = [
    { key: "all", label: "All time" },
    { key: "ytd", label: `YTD ${currentYear}` },
    { key: "year", label: `${currentYear}` },
    { key: "prev_year", label: `${currentYear - 1}` },
  ];
  const quarterOptions: { key: PresetKey; label: string }[] = [
    { key: "q1", label: `Q1 ${currentYear}` },
    { key: "q2", label: `Q2 ${currentYear}` },
    { key: "q3", label: `Q3 ${currentYear}` },
    { key: "q4", label: `Q4 ${currentYear}` },
    { key: "prev_q", label: `Previous quarter (Q${prevQuarter.q} ${prevQuarter.year})` },
  ];
  const isPeriodPreset = periodOptions.some((p) => p.key === preset);
  const isQuarterPreset = quarterOptions.some((p) => p.key === preset);

  const perDispMode = selectedDispatchers.size > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <CardTitle>Avg Dispatcher Salary</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={isPeriodPreset ? preset : ""}
              onValueChange={(v) => setPreset(v as PresetKey)}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={isQuarterPreset ? preset : ""}
              onValueChange={(v) => setPreset(v as PresetKey)}
            >
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder="Quarter" />
              </SelectTrigger>
              <SelectContent>
                {quarterOptions.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={perDispMode ? "default" : "outline"}
                >
                  Dispatchers
                  {perDispMode && (
                    <span className="ml-1">({selectedDispatchers.size})</span>
                  )}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Select dispatchers
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelectedDispatchers(new Set())}
                  >
                    Clear
                  </Button>
                </div>
                <input
                  type="text"
                  value={dispatcherQuery}
                  onChange={(e) => setDispatcherQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-8 px-2 mb-2 text-sm border rounded bg-background"
                />
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredDispatcherOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">
                      No dispatchers.
                    </p>
                  )}
                  {filteredDispatcherOptions.map((d) => {
                    const checked = selectedDispatchers.has(d.key);
                    return (
                      <label
                        key={d.key}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedDispatchers((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(d.key);
                              else next.delete(d.key);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{d.name}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {!perDispMode && (
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
          )}
        </div>
      </CardHeader>
      <CardContent>
        {perDispMode ? (
          perDispChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No salary data for the selected dispatchers.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perDispChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                    formatter={(v: any, name: string, item: any) => {
                      if (v == null) return [null as any, null as any];
                      const isProj = typeof name === "string" && name.startsWith("p_");
                      const key = typeof name === "string" ? name.slice(2) : "";
                      const info = selectedDispatcherList.find((d) => d.key === key);
                      const label = info
                        ? `${info.name}${isProj ? " (proj)" : ""}`
                        : String(name);
                      if (isProj) {
                        const p: any = item?.payload;
                        if (p && p[`d_${key}`] != null) return [null as any, null as any];
                      }
                      return [`$${Number(v).toLocaleString()}`, label];
                    }}
                  />
                  {selectedDispatcherList.map((d) => (
                    <Line
                      key={`solid-${d.key}`}
                      type="monotone"
                      dataKey={`d_${d.key}`}
                      name={d.name}
                      stroke={d.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                  {selectedDispatcherList.map((d) => (
                    <Line
                      key={`proj-${d.key}`}
                      type="monotone"
                      dataKey={`p_${d.key}`}
                      stroke={d.color}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                      connectNulls={false}
                      legendType="none"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        ) : chartData.length === 0 ? (
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
                  formatter={(v: any, name: string, item: any) => {
                    if (v == null) return [null as any, null as any];
                    if (name === "avg") return [`$${Number(v).toLocaleString()}`, "Avg salary"];
                    if (name === "avgProj") {
                      // Hide the projected entry on historical points (where the
                      // dashed line only exists to visually connect to the
                      // current-month projection).
                      const p: any = item?.payload;
                      if (p && p.avg != null) return [null as any, null as any];
                      return [`$${Number(v).toLocaleString()}`, "Avg salary (projected)"];
                    }
                    return [v, name];
                  }}
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
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="avgProj"
                  stroke="hsl(142 76% 36%)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}