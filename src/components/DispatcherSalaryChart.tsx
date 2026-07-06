import { useMemo } from "react";
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
import { supabase } from "@/integrations/supabase/client";

function monthLabel(m: string) {
  const [y, mm] = m.split("-");
  if (!y || !mm) return m;
  return format(new Date(Number(y), Number(mm) - 1, 1), "MMM yyyy");
}

export function DispatcherSalaryChart() {
  const { data: rows = [] } = useQuery({
    queryKey: ["dispatcher-salary-chart"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("month, paid_amount")
        .gte("paid_amount", 500);
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const m = (r as any).month as string | null;
      const amt = Number((r as any).paid_amount) || 0;
      if (!m || amt < 500) continue;
      const b = buckets.get(m) || { total: 0, count: 0 };
      b.total += amt;
      b.count += 1;
      buckets.set(m, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => ({
        key,
        label: monthLabel(key),
        avg: Math.round(v.total / v.count),
        count: v.count,
      }));
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avg Dispatcher Salary (Monthly)</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No salary data.</p>
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