import { useState, useMemo } from "react";
import { format, subDays, eachDayOfInterval, startOfWeek, endOfWeek, startOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Aggregation = "daily" | "weekly" | "monthly";

interface HeatmapRow {
  city_name: string;
  city_state: string;
  city_lat: number;
  city_lng: number;
  count_date: string;
  truck_count: number;
  total_freight: number;
  total_miles: number;
}

const getHeatColor = (count: number, maxCount: number): string => {
  if (count === 0) return "";
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.75) return "bg-red-500/80 text-white";
  if (ratio >= 0.5) return "bg-orange-400/80 text-white";
  if (ratio >= 0.25) return "bg-yellow-400/80 text-foreground";
  return "bg-blue-400/60 text-foreground";
};

const formatCurrency = (val: number) =>
  val > 0 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "";

const formatMiles = (val: number) =>
  val > 0 ? val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "";

const formatRpm = (freight: number, miles: number) =>
  miles > 0 ? `$${(freight / miles).toFixed(2)}` : "";

interface CityAgg {
  city: string;
  buckets: Map<string, number>;
  total: number;
  totalFreight: number;
  totalMiles: number;
}

export default function BeverlyHeatmap() {
  const { hasRole } = useAuthContext();
  const canRecompute = hasRole("admin") || hasRole("manager");

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 13),
    to: new Date(),
  });
  const [aggregation, setAggregation] = useState<Aggregation>("daily");
  const [isRecomputing, setIsRecomputing] = useState(false);

  const startStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  const { data: rawData = [], isLoading, refetch } = useQuery({
    queryKey: ["heatmap-city-counts", startStr, endStr],
    queryFn: async () => {
      if (!startStr || !endStr) return [];
      const { data, error } = await supabase
        .from("heatmap_city_counts")
        .select("city_name, city_state, city_lat, city_lng, count_date, truck_count, total_freight, total_miles")
        .gte("count_date", startStr)
        .lte("count_date", endStr)
        .order("truck_count", { ascending: false });
      if (error) throw error;
      return (data || []) as HeatmapRow[];
    },
    enabled: !!startStr && !!endStr,
  });

  // Build columns and city rows based on aggregation
  const { columns, sortedCities, maxCount } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to || rawData.length === 0)
      return { columns: [] as string[], sortedCities: [] as CityAgg[], maxCount: 0 };

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });

    let cols: string[] = [];
    let bucketFn: (dateStr: string) => string;

    if (aggregation === "daily") {
      cols = days.map((d) => format(d, "yyyy-MM-dd"));
      bucketFn = (ds) => ds;
    } else if (aggregation === "weekly") {
      const seen = new Set<string>();
      for (const d of days) {
        const ws = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
        if (!seen.has(ws)) { seen.add(ws); cols.push(ws); }
      }
      bucketFn = (ds) => format(startOfWeek(new Date(ds + "T00:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    } else {
      const seen = new Set<string>();
      for (const d of days) {
        const ms = format(startOfMonth(d), "yyyy-MM");
        if (!seen.has(ms)) { seen.add(ms); cols.push(ms); }
      }
      bucketFn = (ds) => format(startOfMonth(new Date(ds + "T00:00:00")), "yyyy-MM");
    }

    // cityKey -> bucketKey -> sum of truck_count; also aggregate freight/miles per city
    const cm = new Map<string, Map<string, number>>();
    const cityFreight = new Map<string, number>();
    const cityMiles = new Map<string, number>();
    let mx = 0;

    for (const row of rawData) {
      const ck = `${row.city_name}, ${row.city_state}`;
      const bk = bucketFn(row.count_date);
      if (!cm.has(ck)) cm.set(ck, new Map());
      const prev = cm.get(ck)!.get(bk) || 0;
      const next = prev + row.truck_count;
      cm.get(ck)!.set(bk, next);
      if (next > mx) mx = next;

      cityFreight.set(ck, (cityFreight.get(ck) || 0) + (row.total_freight || 0));
      cityMiles.set(ck, (cityMiles.get(ck) || 0) + (row.total_miles || 0));
    }

    const sorted: CityAgg[] = [...cm.entries()]
      .map(([city, buckets]) => {
        let total = 0;
        for (const v of buckets.values()) total += v;
        return {
          city,
          buckets,
          total,
          totalFreight: cityFreight.get(city) || 0,
          totalMiles: cityMiles.get(city) || 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return { columns: cols, sortedCities: sorted, maxCount: mx };
  }, [rawData, dateRange, aggregation]);

  const handleRecompute = async () => {
    if (!startStr || !endStr) return;
    setIsRecomputing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }
      const { data: result, error: invokeError } = await supabase.functions.invoke("compute-heatmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: startStr, to: endStr }),
      });
      if (invokeError) throw invokeError;
      toast.success(`Recomputed ${result.results?.length || 0} days`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Recompute failed");
    } finally {
      setIsRecomputing(false);
    }
  };

  const formatColHeader = (col: string) => {
    if (aggregation === "daily") {
      return format(new Date(col + "T00:00:00"), "MM/dd");
    }
    if (aggregation === "weekly") {
      const ws = new Date(col + "T00:00:00");
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      return `${format(ws, "MM/dd")}–${format(we, "MM/dd")}`;
    }
    return format(new Date(col + "-01T00:00:00"), "MMM yyyy");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Beverly Heatmap</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker date={dateRange} onDateChange={setDateRange} className="w-[280px]" />
          <Select value={aggregation} onValueChange={(v) => setAggregation(v as Aggregation)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          {canRecompute && (
            <Button variant="outline" size="sm" onClick={handleRecompute} disabled={isRecomputing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isRecomputing ? "animate-spin" : ""}`} />
              Recompute
            </Button>
          )}
        </div>
      </div>

      {aggregation !== "daily" && (
        <p className="text-xs text-muted-foreground">
          ⚠️ Weekly/monthly totals sum daily counts and may count the same truck on multiple days.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading heatmap data...</div>
      ) : sortedCities.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No heatmap data for this date range. {canRecompute && "Try clicking Recompute."}
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background min-w-[160px]">City</TableHead>
                <TableHead className="text-center min-w-[60px]">Total</TableHead>
                <TableHead className="text-right min-w-[90px]">Freight</TableHead>
                <TableHead className="text-right min-w-[70px]">Miles</TableHead>
                <TableHead className="text-right min-w-[60px]">RPM</TableHead>
                {columns.map((col) => (
                  <TableHead key={col} className="text-center min-w-[60px] text-xs">
                    {formatColHeader(col)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCities.map(({ city, buckets, total, totalFreight, totalMiles }) => (
                <TableRow key={city}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium text-sm whitespace-nowrap">
                    {city}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">{total}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                    {formatCurrency(totalFreight)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                    {formatMiles(totalMiles)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                    {formatRpm(totalFreight, totalMiles)}
                  </TableCell>
                  {columns.map((col) => {
                    const count = buckets.get(col) || 0;
                    return (
                      <TableCell
                        key={col}
                        className={`text-center text-sm font-mono p-2 ${getHeatColor(count, maxCount)}`}
                      >
                        {count > 0 ? count : ""}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
