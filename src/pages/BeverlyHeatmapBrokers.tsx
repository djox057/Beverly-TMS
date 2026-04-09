import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BrokerRow {
  broker_id: string;
  broker_name: string;
  broker_mc: string;
  avg_freight: number;
  avg_miles: number;
  rpm: number;
  order_count: number;
  order_ids: string[];
}

interface OrderDetail {
  id: string;
  broker_load_number: string | null;
  freight_amount: number | null;
  loaded_miles: number | null;
  dh_miles: number | null;
  mileage: number | null;
  pickup_drops: { city: string | null; state: string | null; stop_type: string | null }[];
}

type SortKey = "broker_name" | "broker_mc" | "avg_freight" | "avg_miles" | "rpm" | "order_count";

export default function BeverlyHeatmapBrokers() {
  const [search, setSearch] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "order_count",
    dir: "desc",
  });
  const [selectedBroker, setSelectedBroker] = useState<BrokerRow | null>(null);

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ["heatmap-brokers", startDateStr, endDateStr],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, broker_id, freight_amount, loaded_miles, dh_miles, mileage")
        .eq("canceled", false)
        .not("broker_id", "is", null);

      if (startDateStr) query = query.gte("pickup_datetime", startDateStr);
      if (endDateStr) {
        const next = new Date(endDateStr);
        next.setDate(next.getDate() + 1);
        query = query.lt("pickup_datetime", next.toISOString().split("T")[0]);
      }

      const allOrders: { id: string; broker_id: string; freight_amount: number | null; loaded_miles: number | null; dh_miles: number | null; mileage: number | null }[] = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await query.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (data) allOrders.push(...(data as any[]));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
      }

      const agg = new Map<string, { freight: number; miles: number; count: number; orderIds: string[] }>();
      for (const o of allOrders) {
        if (!o.broker_id) continue;
        if (!agg.has(o.broker_id)) agg.set(o.broker_id, { freight: 0, miles: 0, count: 0, orderIds: [] });
        const entry = agg.get(o.broker_id)!;
        entry.freight += Number(o.freight_amount) || 0;
        const miles = o.mileage != null
          ? Number(o.mileage)
          : (Number(o.loaded_miles) || 0) + (Number(o.dh_miles) || 0);
        entry.miles += miles;
        entry.count++;
        entry.orderIds.push(o.id);
      }

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
        rows.push({
          broker_id: brokerId,
          broker_name: info?.name || "Unknown",
          broker_mc: info?.mc || "",
          avg_freight: stats.count > 0 ? stats.freight / stats.count : 0,
          avg_miles: stats.count > 0 ? stats.miles / stats.count : 0,
          rpm: stats.miles > 0 ? stats.freight / stats.miles : 0,
          order_count: stats.count,
          order_ids: stats.orderIds,
        });
      }
      return rows;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch order details for dialog
  const dialogOrderIds = selectedBroker?.order_ids || [];
  const { data: orderDetails = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["heatmap-broker-orders", dialogOrderIds],
    queryFn: async () => {
      if (dialogOrderIds.length === 0) return [];
      const allOrders: OrderDetail[] = [];
      for (let i = 0; i < dialogOrderIds.length; i += 200) {
        const chunk = dialogOrderIds.slice(i, i + 200);
        const { data: orders, error } = await supabase
          .from("orders")
          .select("id, broker_load_number, freight_amount, loaded_miles, dh_miles, mileage")
          .in("id", chunk);
        if (error) throw error;
        if (!orders) continue;

        const orderIds = orders.map((o: any) => o.id);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, city, state, type")
          .in("order_id", orderIds)
          .order("sequence_number", { ascending: true });

        const pdMap = new Map<string, { city: string | null; state: string | null; stop_type: string | null }[]>();
        for (const pd of pds || []) {
          if (!pdMap.has(pd.order_id)) pdMap.set(pd.order_id, []);
          pdMap.get(pd.order_id)!.push({ city: pd.city, state: pd.state, stop_type: pd.type });
        }

        for (const o of orders) {
          allOrders.push({
            id: o.id,
            broker_load_number: o.broker_load_number,
            freight_amount: o.freight_amount,
            loaded_miles: o.loaded_miles,
            dh_miles: o.dh_miles,
            mileage: o.mileage,
            pickup_drops: pdMap.get(o.id) || [],
          });
        }
      }
      return allOrders;
    },
    enabled: dialogOrderIds.length > 0,
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    let rows = brokers;
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter(
        (b) => b.broker_name.toLowerCase().includes(q) || b.broker_mc.toLowerCase().includes(q)
      );
    }
    const min = parseInt(minOrders);
    if (!isNaN(min) && min > 0) {
      rows = rows.filter((b) => b.order_count >= min);
    }
    return rows;
  }, [brokers, search, minOrders]);

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

  const getLane = (stops: { city: string | null; state: string | null; stop_type: string | null }[]) => {
    const pickups = stops.filter((s) => s.stop_type === "pickup");
    const deliveries = stops.filter((s) => s.stop_type === "delivery");
    const firstPickup = pickups[0];
    const lastDelivery = deliveries[deliveries.length - 1];
    const pStr = firstPickup ? `${firstPickup.city || "?"}, ${firstPickup.state || "?"}` : "?";
    const dStr = lastDelivery ? `${lastDelivery.city || "?"}, ${lastDelivery.state || "?"}` : "?";
    return `${pStr} → ${dStr}`;
  };

  const getMiles = (o: OrderDetail) => {
    if (o.mileage != null) return Number(o.mileage);
    return (Number(o.loaded_miles) || 0) + (Number(o.dh_miles) || 0);
  };

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
        <div className="relative w-[160px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Min orders..."
            value={minOrders}
            onChange={(e) => setMinOrders(e.target.value)}
            className="pl-9"
            min={0}
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
                <TableHead className="min-w-[200px] cursor-pointer select-none" onClick={() => handleSort("broker_name")}>
                  <span className="inline-flex items-center">Broker Name <SortIcon columnKey="broker_name" /></span>
                </TableHead>
                <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("broker_mc")}>
                  <span className="inline-flex items-center">Broker MC <SortIcon columnKey="broker_mc" /></span>
                </TableHead>
                <TableHead className="text-right min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("avg_freight")}>
                  <span className="inline-flex items-center justify-end w-full">Avg Freight <SortIcon columnKey="avg_freight" /></span>
                </TableHead>
                <TableHead className="text-right min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("avg_miles")}>
                  <span className="inline-flex items-center justify-end w-full">Avg Miles <SortIcon columnKey="avg_miles" /></span>
                </TableHead>
                <TableHead className="text-right min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("rpm")}>
                  <span className="inline-flex items-center justify-end w-full">RPM <SortIcon columnKey="rpm" /></span>
                </TableHead>
                <TableHead className="text-center min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("order_count")}>
                  <span className="inline-flex items-center justify-center w-full">Orders <SortIcon columnKey="order_count" /></span>
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
                    <Badge
                      variant="secondary"
                      className="font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => setSelectedBroker(b)}
                    >
                      {b.order_count}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Orders Dialog */}
      <Dialog open={!!selectedBroker} onOpenChange={(open) => { if (!open) setSelectedBroker(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBroker?.broker_name} — {selectedBroker?.order_ids.length} Orders
            </DialogTitle>
          </DialogHeader>

          {isLoadingOrders ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Loading orders...</div>
          ) : orderDetails.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">No orders found.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[120px]">Broker Load #</TableHead>
                    <TableHead className="min-w-[250px]">Lane</TableHead>
                    <TableHead className="text-right min-w-[90px]">Freight</TableHead>
                    <TableHead className="text-right min-w-[70px]">Miles</TableHead>
                    <TableHead className="text-right min-w-[60px]">RPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDetails.map((order) => {
                    const miles = getMiles(order);
                    const freight = Number(order.freight_amount) || 0;
                    return (
                      <TableRow key={order.id} className="hover:bg-transparent">
                        <TableCell className="font-mono text-sm">{order.broker_load_number || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{getLane(order.pickup_drops)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{formatCurrency(freight)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{formatMiles(miles)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{formatRpm(miles > 0 ? freight / miles : 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
