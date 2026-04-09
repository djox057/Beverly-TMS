import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BrokerRow {
  broker_id: string;
  broker_name: string;
  broker_mc: string;
  avg_freight: number;
  avg_miles: number;
  rpm: number;
  order_count: number;
}

type SortKey = "broker_name" | "broker_mc" | "avg_freight" | "avg_miles" | "rpm" | "order_count";

export default function BeverlyHeatmapBrokers() {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "order_count",
    dir: "desc",
  });

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ["heatmap-brokers", startDateStr, endDateStr],
    queryFn: async () => {
      // Fetch orders with broker_id and financials
      let query = supabase
        .from("orders")
        .select("broker_id, freight_amount, loaded_miles, dh_miles, mileage")
        .eq("canceled", false)
        .not("broker_id", "is", null);

      if (startDateStr) query = query.gte("pickup_datetime", startDateStr);
      if (endDateStr) {
        const next = new Date(endDateStr);
        next.setDate(next.getDate() + 1);
        query = query.lt("pickup_datetime", next.toISOString().split("T")[0]);
      }

      // Paginate to get all orders
      const allOrders: { broker_id: string; freight_amount: number | null; loaded_miles: number | null; dh_miles: number | null; mileage: number | null }[] = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await query.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (data) allOrders.push(...(data as any[]));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
      }

      // Aggregate by broker_id
      const agg = new Map<string, { freight: number; miles: number; count: number }>();
      for (const o of allOrders) {
        if (!o.broker_id) continue;
        if (!agg.has(o.broker_id)) agg.set(o.broker_id, { freight: 0, miles: 0, count: 0 });
        const entry = agg.get(o.broker_id)!;
        entry.freight += Number(o.freight_amount) || 0;
        const miles = o.mileage != null
          ? Number(o.mileage)
          : (Number(o.loaded_miles) || 0) + (Number(o.dh_miles) || 0);
        entry.miles += miles;
        entry.count++;
      }

      // Fetch broker names
      const brokerIds = [...agg.keys()];
      if (brokerIds.length === 0) return [];

      const brokerInfo = new Map<string, { name: string; mc: string }>();
      for (let i = 0; i < brokerIds.length; i += 200) {
        const chunk = brokerIds.slice(i, i + 200);
        const { data: bData } = await supabase
          .from("brokers")
          .select("id, name, mc_number")
          .in("id", chunk);
        if (bData) {
          for (const b of bData) {
            brokerInfo.set(b.id, { name: b.name, mc: b.mc_number });
          }
        }
      }

      const rows: BrokerRow[] = [];
      for (const [brokerId, stats] of agg) {
        const info = brokerInfo.get(brokerId);
        const avgFreight = stats.count > 0 ? stats.freight / stats.count : 0;
        const avgMiles = stats.count > 0 ? stats.miles / stats.count : 0;
        const rpm = stats.miles > 0 ? stats.freight / stats.miles : 0;
        rows.push({
          broker_id: brokerId,
          broker_name: info?.name || "Unknown",
          broker_mc: info?.mc || "",
          avg_freight: avgFreight,
          avg_miles: avgMiles,
          rpm,
          order_count: stats.count,
        });
      }
      return rows;
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return brokers;
    return brokers.filter(
      (b) =>
        b.broker_name.toLowerCase().includes(q) ||
        b.broker_mc.toLowerCase().includes(q)
    );
  }, [brokers, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const { key, dir } = sortConfig;
    rows.sort((a, b) => {
      let cmp = 0;
      if (key === "broker_name" || key === "broker_mc") {
        cmp = (a[key] || "").localeCompare(b[key] || "");
      } else {
        cmp = (a[key] || 0) - (b[key] || 0);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortConfig.dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1" />
    );
  };

  const formatCurrency = (val: number) =>
    val > 0 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  const formatMiles = (val: number) =>
    val > 0 ? val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—";

  const formatRpm = (val: number) =>
    val > 0 ? `$${val.toFixed(2)}` : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search broker name or MC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={setDateRange}
          placeholder="Filter by date range"
          className="w-[260px]"
        />
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {filtered.length} brokers
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading broker data...</div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">No brokers found.</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="min-w-[200px] cursor-pointer select-none"
                  onClick={() => handleSort("broker_name")}
                >
                  <span className="inline-flex items-center">
                    Broker Name <SortIcon columnKey="broker_name" />
                  </span>
                </TableHead>
                <TableHead
                  className="min-w-[120px] cursor-pointer select-none"
                  onClick={() => handleSort("broker_mc")}
                >
                  <span className="inline-flex items-center">
                    Broker MC <SortIcon columnKey="broker_mc" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-right min-w-[100px] cursor-pointer select-none"
                  onClick={() => handleSort("avg_freight")}
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Avg Freight <SortIcon columnKey="avg_freight" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-right min-w-[90px] cursor-pointer select-none"
                  onClick={() => handleSort("avg_miles")}
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Avg Miles <SortIcon columnKey="avg_miles" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-right min-w-[70px] cursor-pointer select-none"
                  onClick={() => handleSort("rpm")}
                >
                  <span className="inline-flex items-center justify-end w-full">
                    RPM <SortIcon columnKey="rpm" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center min-w-[70px] cursor-pointer select-none"
                  onClick={() => handleSort("order_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Orders <SortIcon columnKey="order_count" />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b) => (
                <TableRow key={b.broker_id} className="hover:bg-transparent">
                  <TableCell className="font-medium text-sm">{b.broker_name}</TableCell>
                  <TableCell className="text-sm font-mono">{b.broker_mc || "—"}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatCurrency(b.avg_freight)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatMiles(b.avg_miles)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatRpm(b.rpm)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">{b.order_count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
