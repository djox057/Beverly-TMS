import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface DeepLane {
  broker_id: string;
  broker_name: string;
  broker_mc: string;
  pickup_city: string;
  pickup_state: string;
  delivery_city: string;
  delivery_state: string;
  load_count: number;
  avg_freight: number;
  avg_miles: number;
  avg_rpm: number;
  last30_rpm: number;
  prior30_rpm: number;
  last30_count: number;
  prior30_count: number;
  trend_pct: number | null;
  expected_rpm: number;
  expected_rate: number;
  order_ids: string[];
}

type DeepSortKey = "lane" | "broker_name" | "load_count" | "avg_rpm" | "last30_rpm" | "trend_pct" | "expected_rate";

export default function BeverlyHeatmapDeepSearch() {
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [deepSort, setDeepSort] = useState<{ key: DeepSortKey; dir: "asc" | "desc" }>({ key: "load_count", dir: "desc" });
  const [selectedDeepLane, setSelectedDeepLane] = useState<DeepLane | null>(null);

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());
  const mapboxTokenRef = useRef<string | null>(null);

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    const key = address.trim().toLowerCase();
    if (geocodeCacheRef.current.has(key)) return geocodeCacheRef.current.get(key)!;
    try {
      let token = mapboxTokenRef.current;
      if (!token) {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        token = data?.token || null;
        mapboxTokenRef.current = token;
      }
      if (!token) return null;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&country=us`
      );
      const json = await res.json();
      const feat = json.features?.[0];
      const result = feat ? { lng: feat.center[0], lat: feat.center[1] } : null;
      geocodeCacheRef.current.set(key, result);
      return result;
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

  const { data: deepData, isLoading: isLoadingDeep } = useQuery({
    queryKey: ["heatmap-deep-search", pickupCoords, deliveryCoords, startDateStr, endDateStr],
    queryFn: async () => {
      const scope = hasCoords ? "filtered" : "global";
      const { data, error } = await supabase.functions.invoke("lane-deep-search", {
        body: {
          scope,
          pickup: hasCoords ? pickupCoords : null,
          delivery: hasCoords ? deliveryCoords : null,
          dateFrom: startDateStr ?? null,
          dateTo: endDateStr ?? null,
          minRepeats: 3,
        },
      });
      if (error) throw error;
      return data as { lanes: DeepLane[]; truncated: boolean; scanned: number };
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
  const sortedDeep = useMemo(() => {
    if (!deepData?.lanes) return [];
    const rows = [...deepData.lanes];
    const { key, dir } = deepSort;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "lane":
          cmp = `${a.pickup_city},${a.pickup_state}→${a.delivery_city},${a.delivery_state}`
            .localeCompare(`${b.pickup_city},${b.pickup_state}→${b.delivery_city},${b.delivery_state}`);
          break;
        case "broker_name": cmp = a.broker_name.localeCompare(b.broker_name); break;
        case "load_count": cmp = a.load_count - b.load_count; break;
        case "avg_rpm": cmp = a.avg_rpm - b.avg_rpm; break;
        case "last30_rpm": cmp = a.last30_rpm - b.last30_rpm; break;
        case "trend_pct": cmp = (a.trend_pct ?? -999) - (b.trend_pct ?? -999); break;
        case "expected_rate": cmp = a.expected_rate - b.expected_rate; break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [deepData?.lanes, deepSort]);

  const handleDeepSort = (key: DeepSortKey) => {
    setDeepSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };
  const DeepSortIcon = ({ columnKey }: { columnKey: DeepSortKey }) => {
    if (deepSort.key !== columnKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return deepSort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const deepDialogOrderIds = selectedDeepLane?.order_ids || [];
  const { data: deepOrderDetails = [], isLoading: isLoadingDeepOrders } = useQuery({
    queryKey: ["heatmap-deep-search-orders", deepDialogOrderIds],
    queryFn: async () => {
      if (deepDialogOrderIds.length === 0) return [];
      const allDetails: { id: string; broker_load_number: string | null; freight_amount: number | null; loaded_miles: number | null; pickup_datetime: string | null; pickup_drops: { city: string | null; state: string | null; stop_type: string | null }[] }[] = [];
      for (let i = 0; i < deepDialogOrderIds.length; i += 200) {
        const chunk = deepDialogOrderIds.slice(i, i + 200);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, broker_load_number, freight_amount, loaded_miles, pickup_datetime")
          .in("id", chunk);
        if (!orders) continue;
        const oids = orders.map((o: any) => o.id);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, city, state, type")
          .in("order_id", oids)
          .order("sequence_number", { ascending: true });
        const pdMap = new Map<string, { city: string | null; state: string | null; stop_type: string | null }[]>();
        for (const pd of pds || []) {
          if (!pdMap.has(pd.order_id)) pdMap.set(pd.order_id, []);
          pdMap.get(pd.order_id)!.push({ city: pd.city, state: pd.state, stop_type: pd.type });
        }
        for (const o of orders) {
          allDetails.push({ ...(o as any), pickup_drops: pdMap.get(o.id) || [] });
        }
      }
      allDetails.sort((a, b) => (b.pickup_datetime || "").localeCompare(a.pickup_datetime || ""));
      return allDetails;
    },
    enabled: deepDialogOrderIds.length > 0,
    staleTime: 0,
  });

  const fmt = (val: number) =>
    val > 0 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
  const fmtMiles = (val: number) =>
    val > 0 ? val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—";
  const fmtRpm = (val: number) => (val > 0 ? `$${val.toFixed(2)}` : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Pickup Location (optional)</label>
          <Input
            placeholder="City, State or address..."
            value={pickupAddress}
            onChange={e => setPickupAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Delivery Location (optional)</label>
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
          {isGeocoding ? "Geocoding..." : "Geocode"}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Deep Search: surfaces broker × exact-lane pairs (≤1 mi on both ends) with ≥3 loads in window. Trend compares last 30 days vs prior 30 days; expected rate = last-30 RPM × avg miles. Leave pickup/delivery blank for all lanes; enter either to filter.
      </div>
      {hasCoords && (
        <div className="flex gap-2 flex-wrap">
          {pickupCoords && (
            <Badge variant="outline" className="text-xs">
              Pickup: {pickupCoords.lat.toFixed(3)}, {pickupCoords.lng.toFixed(3)}
            </Badge>
          )}
          {deliveryCoords && (
            <Badge variant="outline" className="text-xs">
              Delivery: {deliveryCoords.lat.toFixed(3)}, {deliveryCoords.lng.toFixed(3)}
            </Badge>
          )}
        </div>
      )}

      {!isLoadingDeep && deepData && deepData.lanes.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No repeat lanes (≥3 loads) found.
        </div>
      )}
      {deepData && deepData.lanes.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">
            Scanned {deepData.scanned.toLocaleString()} loads.
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[260px] cursor-pointer select-none" onClick={() => handleDeepSort("lane")}>
                    <span className="inline-flex items-center">Lane <DeepSortIcon columnKey="lane" /></span>
                  </TableHead>
                  <TableHead className="w-[200px] cursor-pointer select-none" onClick={() => handleDeepSort("broker_name")}>
                    <span className="inline-flex items-center">Broker <DeepSortIcon columnKey="broker_name" /></span>
                  </TableHead>
                  <TableHead className="text-center w-[70px] cursor-pointer select-none" onClick={() => handleDeepSort("load_count")}>
                    <span className="inline-flex items-center justify-center w-full">Loads <DeepSortIcon columnKey="load_count" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[100px]">Avg $</TableHead>
                  <TableHead className="text-right w-[80px]">Avg Mi</TableHead>
                  <TableHead className="text-right w-[80px] cursor-pointer select-none" onClick={() => handleDeepSort("avg_rpm")}>
                    <span className="inline-flex items-center justify-end w-full">Avg RPM <DeepSortIcon columnKey="avg_rpm" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[90px] cursor-pointer select-none" onClick={() => handleDeepSort("last30_rpm")}>
                    <span className="inline-flex items-center justify-end w-full">Last 30 RPM <DeepSortIcon columnKey="last30_rpm" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[90px]">Prior 30 RPM</TableHead>
                  <TableHead className="text-center w-[110px] cursor-pointer select-none" onClick={() => handleDeepSort("trend_pct")}>
                    <span className="inline-flex items-center justify-center w-full">Trend <DeepSortIcon columnKey="trend_pct" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[120px] cursor-pointer select-none" onClick={() => handleDeepSort("expected_rate")}>
                    <span className="inline-flex items-center justify-end w-full">Expected $ <DeepSortIcon columnKey="expected_rate" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeep.map(l => {
                  const trend = l.trend_pct;
                  const trendColor = trend == null ? "text-muted-foreground" : trend > 0.02 ? "text-emerald-600" : trend < -0.02 ? "text-red-600" : "text-muted-foreground";
                  const TrendIcon = trend == null ? Minus : trend > 0.02 ? TrendingUp : trend < -0.02 ? TrendingDown : Minus;
                  return (
                    <TableRow
                      key={`${l.broker_id}-${l.pickup_city}-${l.delivery_city}`}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedDeepLane(l)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {l.pickup_city}, {l.pickup_state} → {l.delivery_city}, {l.delivery_state}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium truncate">{l.broker_name}</div>
                        {l.broker_mc && <div className="text-xs text-muted-foreground">MC {l.broker_mc}</div>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">{l.load_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmt(l.avg_freight)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtMiles(l.avg_miles)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtRpm(l.avg_rpm)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtRpm(l.last30_rpm)}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-muted-foreground">{fmtRpm(l.prior30_rpm)}</TableCell>
                      <TableCell className="text-center text-sm">
                        <span className={`inline-flex items-center gap-1 font-mono ${trendColor}`}>
                          <TrendIcon className="h-3.5 w-3.5" />
                          {trend == null ? "—" : `${(trend * 100).toFixed(1)}%`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono font-semibold">
                        {fmt(l.expected_rate)}
                        <div className="text-xs text-muted-foreground font-normal">{fmtRpm(l.expected_rpm)}/mi</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selectedDeepLane} onOpenChange={(open) => { if (!open) setSelectedDeepLane(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDeepLane && (
                <>
                  {selectedDeepLane.pickup_city}, {selectedDeepLane.pickup_state} → {selectedDeepLane.delivery_city}, {selectedDeepLane.delivery_state}
                  {" — "}
                  {selectedDeepLane.broker_name} ({selectedDeepLane.order_ids.length} loads)
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {isLoadingDeepOrders ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Loading orders...</div>
          ) : deepOrderDetails.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">No orders found.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">Pickup Date</TableHead>
                    <TableHead className="w-[130px]">Broker Load #</TableHead>
                    <TableHead className="w-[260px]">Lane</TableHead>
                    <TableHead className="text-right w-[100px]">Freight</TableHead>
                    <TableHead className="text-right w-[80px]">Miles</TableHead>
                    <TableHead className="text-right w-[70px]">RPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deepOrderDetails.map(order => {
                    const miles = Number(order.loaded_miles) || 0;
                    const freight = Number(order.freight_amount) || 0;
                    const pickups = order.pickup_drops.filter(s => s.stop_type === "pickup");
                    const deliveries = order.pickup_drops.filter(s => s.stop_type === "delivery");
                    const p = pickups[0];
                    const d = deliveries[deliveries.length - 1];
                    const lane = `${p ? `${p.city || "?"}, ${p.state || "?"}` : "?"} → ${d ? `${d.city || "?"}, ${d.state || "?"}` : "?"}`;
                    const date = order.pickup_datetime ? format(new Date(order.pickup_datetime), "MMM d, yyyy") : "—";
                    return (
                      <TableRow key={order.id} className="hover:bg-transparent">
                        <TableCell className="text-sm">{date}</TableCell>
                        <TableCell className="font-mono text-sm">{order.broker_load_number || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{lane}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmt(freight)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtMiles(miles)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtRpm(miles > 0 ? freight / miles : 0)}</TableCell>
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