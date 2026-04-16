import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const RADIUS_MILES = 60;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface BrokerStat {
  broker_id: string;
  broker_name: string;
  broker_mc: string;
  total_freight: number;
  avg_freight: number;
  avg_miles: number;
  rpm: number;
  order_count: number;
  order_ids: string[];
}

type SortKey = "broker_name" | "total_freight" | "avg_freight" | "avg_miles" | "rpm" | "order_count";

export default function BeverlyHeatmapLane() {
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "order_count", dir: "desc",
  });
  const [selectedBroker, setSelectedBroker] = useState<BrokerStat | null>(null);

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { data } = await supabase.functions.invoke("get-mapbox-token");
      if (!data?.token) return null;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${data.token}&limit=1&country=us`
      );
      const json = await res.json();
      const feat = json.features?.[0];
      if (!feat) return null;
      return { lng: feat.center[0], lat: feat.center[1] };
    } catch {
      return null;
    }
  };

  const handleSearch = async () => {
    if (!pickupAddress.trim() && !deliveryAddress.trim()) return;
    setIsGeocoding(true);
    const [pCoords, dCoords] = await Promise.all([
      pickupAddress.trim() ? geocodeAddress(pickupAddress) : Promise.resolve(null),
      deliveryAddress.trim() ? geocodeAddress(deliveryAddress) : Promise.resolve(null),
    ]);
    setPickupCoords(pCoords);
    setDeliveryCoords(dCoords);
    setIsGeocoding(false);
  };

  const hasCoords = pickupCoords != null || deliveryCoords != null;

  // Fetch matching orders based on coordinates
  const { data: laneData, isLoading } = useQuery({
    queryKey: ["heatmap-lane", pickupCoords, deliveryCoords, startDateStr, endDateStr],
    queryFn: async () => {
      if (!pickupCoords && !deliveryCoords) return null;

      // Fetch pickup_drops with coordinates to find matching stops
      let orderQuery = supabase
        .from("orders")
        .select("id, broker_id, freight_amount, loaded_miles")
        .eq("canceled", false)
        .not("broker_id", "is", null);

      if (startDateStr) orderQuery = orderQuery.gte("pickup_datetime", startDateStr);
      if (endDateStr) {
        const next = new Date(endDateStr);
        next.setDate(next.getDate() + 1);
        orderQuery = orderQuery.lt("pickup_datetime", next.toISOString().split("T")[0]);
      }

      const allOrders: { id: string; broker_id: string; freight_amount: number | null; loaded_miles: number | null }[] = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await orderQuery.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (data) allOrders.push(...(data as any[]));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
      }

      if (allOrders.length === 0) return { matchingOrders: [], brokerStats: [] };

      // Get all order IDs
      const orderIds = allOrders.map(o => o.id);

      // Fetch pickup_drops for these orders
      const allStops: { order_id: string; type: string; latitude: number | null; longitude: number | null }[] = [];
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: stops } = await supabase
          .from("pickup_drops")
          .select("order_id, type, latitude, longitude")
          .in("order_id", chunk);
        if (stops) allStops.push(...(stops as any[]));
      }

      // Group stops by order
      const stopsByOrder = new Map<string, typeof allStops>();
      for (const s of allStops) {
        if (!stopsByOrder.has(s.order_id)) stopsByOrder.set(s.order_id, []);
        stopsByOrder.get(s.order_id)!.push(s);
      }

      // Filter orders that match both pickup and delivery radius
      const matchingOrderIds = new Set<string>();
      for (const [orderId, stops] of stopsByOrder) {
        const pickups = stops.filter(s => s.type === "pickup" && s.latitude && s.longitude);
        const deliveries = stops.filter(s => s.type === "delivery" && s.latitude && s.longitude);

        const pickupMatch = !pickupCoords || pickups.some(
          s => haversine(pickupCoords.lat, pickupCoords.lng, s.latitude!, s.longitude!) <= RADIUS_MILES
        );
        const deliveryMatch = !deliveryCoords || deliveries.some(
          s => haversine(deliveryCoords.lat, deliveryCoords.lng, s.latitude!, s.longitude!) <= RADIUS_MILES
        );

        if (pickupMatch && deliveryMatch) matchingOrderIds.add(orderId);
      }

      const matchingOrders = allOrders.filter(o => matchingOrderIds.has(o.id));

      // Aggregate by broker
      const agg = new Map<string, { freight: number; miles: number; count: number; orderIds: string[] }>();
      for (const o of matchingOrders) {
        if (!agg.has(o.broker_id)) agg.set(o.broker_id, { freight: 0, miles: 0, count: 0, orderIds: [] });
        const e = agg.get(o.broker_id)!;
        e.freight += Number(o.freight_amount) || 0;
        e.miles += Number(o.loaded_miles) || 0;
        e.count++;
        e.orderIds.push(o.id);
      }

      // Fetch broker info
      const brokerIds = [...agg.keys()];
      const brokerInfo = new Map<string, { name: string; mc: string }>();
      for (let i = 0; i < brokerIds.length; i += 200) {
        const chunk = brokerIds.slice(i, i + 200);
        const { data: bData } = await supabase
          .from("brokers")
          .select("id, name, mc_number")
          .in("id", chunk);
        if (bData) {
          for (const b of bData) brokerInfo.set(b.id, { name: b.name, mc: b.mc_number });
        }
      }

      const brokerStats: BrokerStat[] = [];
      for (const [brokerId, stats] of agg) {
        const info = brokerInfo.get(brokerId);
        brokerStats.push({
          broker_id: brokerId,
          broker_name: info?.name || "Unknown",
          broker_mc: info?.mc || "",
          total_freight: stats.freight,
          avg_freight: stats.count > 0 ? stats.freight / stats.count : 0,
          avg_miles: stats.count > 0 ? stats.miles / stats.count : 0,
          rpm: stats.miles > 0 ? stats.freight / stats.miles : 0,
          order_count: stats.count,
          order_ids: stats.orderIds,
        });
      }

      // Overall stats
      const totalFreight = matchingOrders.reduce((s, o) => s + (Number(o.freight_amount) || 0), 0);
      const totalMiles = matchingOrders.reduce((s, o) => s + (Number(o.loaded_miles) || 0), 0);
      const count = matchingOrders.length;

      return {
        matchingOrders,
        brokerStats,
        overall: {
          count,
          avgFreight: count > 0 ? totalFreight / count : 0,
          avgMiles: count > 0 ? totalMiles / count : 0,
          rpm: totalMiles > 0 ? totalFreight / totalMiles : 0,
        },
      };
    },
    enabled: hasCoords,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch order details for dialog
  const dialogOrderIds = selectedBroker?.order_ids || [];
  const { data: orderDetails = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["heatmap-lane-orders", dialogOrderIds],
    queryFn: async () => {
      if (dialogOrderIds.length === 0) return [];
      const allDetails: { id: string; broker_load_number: string | null; freight_amount: number | null; loaded_miles: number | null; pickup_drops: { city: string | null; state: string | null; stop_type: string | null }[] }[] = [];
      for (let i = 0; i < dialogOrderIds.length; i += 200) {
        const chunk = dialogOrderIds.slice(i, i + 200);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, broker_load_number, freight_amount, loaded_miles")
          .in("id", chunk);
        if (!orders) continue;
        const ids = orders.map((o: any) => o.id);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, city, state, type")
          .in("order_id", ids)
          .order("sequence_number", { ascending: true });
        const pdMap = new Map<string, { city: string | null; state: string | null; stop_type: string | null }[]>();
        for (const pd of pds || []) {
          if (!pdMap.has(pd.order_id)) pdMap.set(pd.order_id, []);
          pdMap.get(pd.order_id)!.push({ city: pd.city, state: pd.state, stop_type: pd.type });
        }
        for (const o of orders) {
          allDetails.push({ ...o, pickup_drops: pdMap.get(o.id) || [] });
        }
      }
      return allDetails;
    },
    enabled: dialogOrderIds.length > 0,
    staleTime: 0,
  });

  const sorted = useMemo(() => {
    if (!laneData?.brokerStats) return [];
    const rows = [...laneData.brokerStats];
    const { key, dir } = sortConfig;
    rows.sort((a, b) => {
      const cmp = key === "broker_name"
        ? a.broker_name.localeCompare(b.broker_name)
        : (a[key] || 0) - (b[key] || 0);
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [laneData?.brokerStats, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortConfig.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const fmt = (val: number) =>
    val > 0 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
  const fmtMiles = (val: number) =>
    val > 0 ? val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—";
  const fmtRpm = (val: number) => (val > 0 ? `$${val.toFixed(2)}` : "—");

  return (
    <div className="space-y-4">
      {/* Inputs row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Pickup Location</label>
          <Input
            placeholder="City, State or address..."
            value={pickupAddress}
            onChange={e => setPickupAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Delivery Location</label>
          <Input
            placeholder="City, State or address..."
            value={deliveryAddress}
            onChange={e => setDeliveryAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={setDateRange}
          placeholder="Pickup date range"
          className="w-[260px]"
        />
        <Button onClick={handleSearch} disabled={isGeocoding || (!pickupAddress.trim() && !deliveryAddress.trim())}>
          <Search className="h-4 w-4 mr-1" />
          {isGeocoding ? "Geocoding..." : "Search"}
        </Button>
      </div>

      {/* Coordinate badges */}
      {hasCoords && (
        <div className="flex gap-2 flex-wrap">
          {pickupCoords && (
            <Badge variant="outline" className="text-xs">
              Pickup: {pickupCoords.lat.toFixed(3)}, {pickupCoords.lng.toFixed(3)} (±{RADIUS_MILES}mi)
            </Badge>
          )}
          {deliveryCoords && (
            <Badge variant="outline" className="text-xs">
              Delivery: {deliveryCoords.lat.toFixed(3)}, {deliveryCoords.lng.toFixed(3)} (±{RADIUS_MILES}mi)
            </Badge>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && hasCoords && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading lane data...</div>
      )}

      {/* Overall summary */}
      {laneData?.overall && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Total Loads</div>
                <div className="text-xl font-bold">{laneData.overall.count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg Gross</div>
                <div className="text-xl font-bold">{fmt(laneData.overall.avgFreight)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg Miles</div>
                <div className="text-xl font-bold">{fmtMiles(laneData.overall.avgMiles)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg RPM</div>
                <div className="text-xl font-bold">{fmtRpm(laneData.overall.rpm)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No results */}
      {hasCoords && !isLoading && laneData && laneData.matchingOrders.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">No loads found for this lane.</div>
      )}

      {/* Broker breakdown table */}
      {sorted.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px] cursor-pointer select-none" onClick={() => handleSort("broker_name")}>
                  <span className="inline-flex items-center">Broker <SortIcon columnKey="broker_name" /></span>
                </TableHead>
                <TableHead className="text-right w-[120px] cursor-pointer select-none" onClick={() => handleSort("total_freight")}>
                  <span className="inline-flex items-center justify-end w-full">Total Freight <SortIcon columnKey="total_freight" /></span>
                </TableHead>
                <TableHead className="text-right w-[110px] cursor-pointer select-none" onClick={() => handleSort("avg_freight")}>
                  <span className="inline-flex items-center justify-end w-full">Avg Gross <SortIcon columnKey="avg_freight" /></span>
                </TableHead>
                <TableHead className="text-right w-[100px] cursor-pointer select-none" onClick={() => handleSort("avg_miles")}>
                  <span className="inline-flex items-center justify-end w-full">Avg Miles <SortIcon columnKey="avg_miles" /></span>
                </TableHead>
                <TableHead className="text-right w-[80px] cursor-pointer select-none" onClick={() => handleSort("rpm")}>
                  <span className="inline-flex items-center justify-end w-full">RPM <SortIcon columnKey="rpm" /></span>
                </TableHead>
                <TableHead className="text-center w-[80px] cursor-pointer select-none" onClick={() => handleSort("order_count")}>
                  <span className="inline-flex items-center justify-center w-full">Loads <SortIcon columnKey="order_count" /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(b => (
                <TableRow key={b.broker_id} className="hover:bg-transparent">
                  <TableCell className="font-medium text-sm">{b.broker_name}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{fmt(b.total_freight)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{fmt(b.avg_freight)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{fmtMiles(b.avg_miles)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{fmtRpm(b.rpm)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">{b.order_count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Prompt to search */}
      {!hasCoords && !isGeocoding && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Enter pickup and/or delivery locations to search lane history.
        </div>
      )}
    </div>
  );
}
