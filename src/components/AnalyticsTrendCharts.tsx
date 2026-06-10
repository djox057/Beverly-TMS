import { useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfWeek,
  endOfMonth,
  differenceInCalendarDays,
} from "date-fns";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Granularity = "daily" | "weekly" | "monthly";

interface OrderLike {
  pickupDate?: string | null;
  pickupDatetime?: string | null;
  deliveryDate?: string | null;
  totalFreightAmountNoLumper?: number | string | null;
  mileage?: number | string | null;
}

interface Props {
  orders: OrderLike[];
  filterType: "week" | "month" | "custom";
  getEffectiveDriverPay: (order: any) => number;
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === "daily") return format(d, "yyyy-MM-dd");
  if (g === "weekly") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  return format(startOfMonth(d), "yyyy-MM");
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === "monthly") {
    const [y, m] = key.split("-");
    return format(new Date(Number(y), Number(m) - 1, 1), "MMM yyyy");
  }
  const d = new Date(key + "T00:00:00");
  if (g === "weekly") return `Wk ${format(d, "MMM d")}`;
  return format(d, "MMM d");
}

export function AnalyticsTrendCharts({ orders, filterType, getEffectiveDriverPay }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const data = useMemo(() => {
    const buckets = new Map<
      string,
      { freight: number; miles: number; driverPay: number; count: number }
    >();
    orders.forEach((o) => {
      const raw =
        filterType === "month"
          ? o.deliveryDate
          : o.pickupDate || o.pickupDatetime;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      if (granularity === "daily") {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return;
      }
      const key = bucketKey(d, granularity);
      const b = buckets.get(key) || { freight: 0, miles: 0, driverPay: 0, count: 0 };
      b.freight += Number(o.totalFreightAmountNoLumper) || 0;
      b.miles += Number(o.mileage) || 0;
      b.driverPay += getEffectiveDriverPay(o as any);
      b.count += 1;
      buckets.set(key, b);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => {
        const comm = v.freight - v.driverPay;
        const commPct = v.freight > 0 ? (comm / v.freight) * 100 : 0;
        const rpm = v.miles > 0 ? v.freight / v.miles : 0;
        return {
          key,
          label: bucketLabel(key, granularity),
          freight: Math.round(v.freight),
          miles: Math.round(v.miles),
          rpm: Number(rpm.toFixed(2)),
          comm: Math.round(comm),
          commPct: Number(commPct.toFixed(1)),
        };
      });
  }, [orders, granularity, filterType]);

  const charts: { key: keyof typeof data[number]; title: string; color: string; prefix?: string; suffix?: string }[] = [
    { key: "freight", title: "Total Freight", color: "hsl(142 76% 36%)", prefix: "$" },
    { key: "miles", title: "Total Miles", color: "hsl(217 91% 60%)" },
    { key: "rpm", title: "Avg Rate / Mile", color: "hsl(38 92% 50%)", prefix: "$" },
    { key: "comm", title: "Total Commission", color: "hsl(142 76% 36%)", prefix: "$" },
    { key: "commPct", title: "Commission %", color: "hsl(280 70% 55%)", suffix: "%" },
  ];

  const projection = useMemo(() => {
    if (granularity === "daily" || data.length === 0) return null;
    const lastKey = data[data.length - 1].key;
    const now = new Date();
    if (granularity === "weekly") {
      const start = startOfWeek(new Date(lastKey + "T00:00:00"), { weekStartsOn: 1 });
      const end = endOfWeek(start, { weekStartsOn: 1 });
      if (now > end) return null;
      // business-day ratio (Mon-Fri = 5)
      const elapsedBiz = Math.min(
        5,
        Math.max(1, Math.min(5, differenceInCalendarDays(now, start) + 1)),
      );
      return { ratio: 5 / elapsedBiz };
    }
    // monthly
    const start = startOfMonth(new Date(lastKey + "-01T00:00:00"));
    const end = endOfMonth(start);
    if (now > end) return null;
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const elapsed = Math.max(1, Math.min(totalDays, differenceInCalendarDays(now, start) + 1));
    return { ratio: totalDays / elapsed };
  }, [data, granularity]);

  const isProjectable = (k: string) => k === "freight" || k === "miles" || k === "comm";

  const chartData = useMemo(() => {
    const arr: any[] = data.map((d) => ({ ...d }));
    if (!projection || arr.length === 0) return arr;
    const lastIdx = arr.length - 1;
    for (const c of charts) {
      const k = c.key as string;
      const lastVal = (data[lastIdx] as any)[k];
      const projVal = isProjectable(k)
        ? Math.round(lastVal * projection.ratio)
        : lastVal;
      if (lastIdx > 0) {
        arr[lastIdx - 1][`${k}_proj`] = (data[lastIdx - 1] as any)[k];
      }
      arr[lastIdx][`${k}_proj`] = projVal;
      // hide solid last point so dotted projection visually replaces it
      arr[lastIdx][k] = null;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projection]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle>Trends</CardTitle>
          <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for selected period.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {charts.map((c) => (
              <div key={c.key as string} className="rounded-lg border p-4">
                <p className="text-sm font-medium mb-2">
                  {c.title}
                  {projection && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      (dotted = projected)
                    </span>
                  )}
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) =>
                          `${c.prefix ?? ""}${Number(v).toLocaleString()}${c.suffix ?? ""}`
                        }
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        formatter={(v: any) =>
                          `${c.prefix ?? ""}${Number(v).toLocaleString()}${c.suffix ?? ""}`
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey={c.key as string}
                        stroke={c.color}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      {projection && (
                        <Line
                          type="monotone"
                          dataKey={`${c.key as string}_proj`}
                          stroke={c.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 2 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}