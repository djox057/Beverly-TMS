import { useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfWeek,
  endOfMonth,
  differenceInCalendarDays,
  addDays,
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
import { Legend } from "recharts";
import { Toggle } from "@/components/ui/toggle";

type Granularity = "daily" | "weekly" | "monthly";

interface OrderLike {
  pickupDate?: string | null;
  pickupDatetime?: string | null;
  deliveryDate?: string | null;
  totalFreightAmountNoLumper?: number | string | null;
  mileage?: number | string | null;
  driver1Id?: string | null;
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
  if (g === "weekly") {
    const end = addDays(d, 6);
    const sameMonth = d.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(d, "M/d")}-${format(end, "d")}`
      : `${format(d, "M/d")}-${format(end, "M/d")}`;
  }
  return format(d, "MMM d");
}

export function AnalyticsTrendCharts({ orders, filterType, getEffectiveDriverPay }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");

  const data = useMemo(() => {
    const buckets = new Map<
      string,
      { freight: number; miles: number; driverPay: number; count: number; drivers: Set<string> }
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
      const b = buckets.get(key) || { freight: 0, miles: 0, driverPay: 0, count: 0, drivers: new Set<string>() };
      b.freight += Number(o.totalFreightAmountNoLumper) || 0;
      b.miles += Number(o.mileage) || 0;
      b.driverPay += getEffectiveDriverPay(o as any);
      b.count += 1;
      if (o.driver1Id) b.drivers.add(String(o.driver1Id));
      buckets.set(key, b);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => {
        const comm = v.freight - v.driverPay;
        const commPct = v.freight > 0 ? (comm / v.freight) * 100 : 0;
        const rpm = v.miles > 0 ? v.freight / v.miles : 0;
        const driverCount = v.drivers.size;
        const freightPerDriver = driverCount > 0 ? v.freight / driverCount : 0;
        const driverPayPerDriver = driverCount > 0 ? v.driverPay / driverCount : 0;
        return {
          key,
          label: bucketLabel(key, granularity),
          freight: Math.round(v.freight),
          miles: Math.round(v.miles),
          rpm: Number(rpm.toFixed(2)),
          comm: Math.round(comm),
          commPct: Number(commPct.toFixed(1)),
          driverPay: Math.round(v.driverPay),
          freightPerDriver: Math.round(freightPerDriver),
          driverPayPerDriver: Math.round(driverPayPerDriver),
        };
      });
  }, [orders, granularity, filterType]);

  const charts: { key: keyof typeof data[number]; title: string; color: string; prefix?: string; suffix?: string; axis: string }[] = [
    { key: "freight", title: "Total Freight", color: "hsl(142 76% 36%)", prefix: "$", axis: "dollars-big" },
    { key: "miles", title: "Total Miles", color: "hsl(217 91% 60%)", axis: "miles" },
    { key: "rpm", title: "Avg Rate / Mile", color: "hsl(38 92% 50%)", prefix: "$", axis: "rpm" },
    { key: "comm", title: "Total Commission", color: "hsl(142 76% 36%)", prefix: "$", axis: "dollars-big" },
    { key: "commPct", title: "Commission %", color: "hsl(280 70% 55%)", suffix: "%", axis: "pct" },
    { key: "driverPay", title: "Driver Pay", color: "hsl(0 72% 51%)", prefix: "$", axis: "dollars-big" },
    { key: "freightPerDriver", title: "Freight per Driver", color: "hsl(190 80% 45%)", prefix: "$", axis: "dollars-per-driver" },
    { key: "driverPayPerDriver", title: "Driver Freight per Driver", color: "hsl(20 85% 55%)", prefix: "$", axis: "dollars-per-driver" },
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

  const isProjectable = (k: string) =>
    k === "freight" || k === "miles" || k === "comm" || k === "driverPay";

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

  const [overlayKeys, setOverlayKeys] = useState<string[]>([]);
  const toggleOverlay = (k: string) =>
    setOverlayKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  const fmt = (c: typeof charts[number]) => (v: any) =>
    `${c.prefix ?? ""}${Number(v).toLocaleString()}${c.suffix ?? ""}`;

  // Build nice ticks at 0.25 increments for the Avg Rate / Mile axis.
  const rpmAxis = useMemo(() => {
    const vals = chartData
      .flatMap((d: any) => [d.rpm, d.rpm_proj])
      .filter((v: any) => typeof v === "number" && isFinite(v) && v > 0);
    if (vals.length === 0) return { domain: [0, 1] as [number, number], ticks: [0, 0.25, 0.5, 0.75, 1] };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const step = 0.25;
    const lo = Math.max(0, Math.floor(min / step) * step);
    const hi = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
    return { domain: [lo, hi] as [number, number], ticks };
  }, [chartData]);

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
          <>
          <div className="mb-6 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <p className="text-sm font-medium mr-2">Overlay</p>
              {charts.map((c) => {
                const active = overlayKeys.includes(c.key as string);
                return (
                  <Toggle
                    key={`ov-${c.key as string}`}
                    size="sm"
                    pressed={active}
                    onPressedChange={() => toggleOverlay(c.key as string)}
                    style={active ? { borderColor: c.color, color: c.color } : undefined}
                    className="border"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5"
                      style={{ background: c.color }}
                    />
                    {c.title}
                  </Toggle>
                );
              })}
              {overlayKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOverlayKeys([])}
                  className="text-xs text-muted-foreground hover:text-foreground ml-1"
                >
                  Clear
                </button>
              )}
            </div>
            {overlayKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Pick 2+ metrics above to overlay them on one chart.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    {(() => {
                      const axes: string[] = [];
                      overlayKeys.forEach((k) => {
                        const c = charts.find((x) => x.key === k)!;
                        if (!axes.includes(c.axis)) axes.push(c.axis);
                      });
                      return axes.map((axisId, i) => {
                        const c = charts.find((x) => x.axis === axisId)!;
                        return (
                          <YAxis
                            key={`y-${axisId}`}
                            yAxisId={axisId}
                            orientation={i % 2 === 0 ? "left" : "right"}
                            tick={{ fontSize: 11, fill: c.color }}
                            tickFormatter={fmt(c)}
                            width={70}
                            hide={i > 1}
                          />
                        );
                      });
                    })()}
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      formatter={(v: any, name: string) => {
                        const c = charts.find((x) => x.title === name || x.key === name);
                        return c ? fmt(c)(v) : v;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {overlayKeys.map((k) => {
                      const c = charts.find((x) => x.key === k)!;
                      return (
                        <Line
                          key={`l-${k}`}
                          yAxisId={c.axis}
                          type="monotone"
                          dataKey={k}
                          name={c.title}
                          stroke={c.color}
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      );
                    })}
                    {projection &&
                      overlayKeys.map((k) => {
                        const c = charts.find((x) => x.key === k)!;
                        return (
                          <Line
                            key={`lp-${k}`}
                            yAxisId={c.axis}
                            type="monotone"
                            dataKey={`${k}_proj`}
                            name={`${c.title} (proj)`}
                            stroke={c.color}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ r: 2 }}
                            connectNulls={false}
                            isAnimationActive={false}
                            legendType="none"
                          />
                        );
                      })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}