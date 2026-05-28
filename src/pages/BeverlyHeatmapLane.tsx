import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Route } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";



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

interface TriHaulCombo {
  intermediate: { city: string; state: string; lat: number; lng: number };
  leg1: { avg_freight: number; avg_miles: number; rpm: number; count: number; order_ids: string[] };
  leg2: { avg_freight: number; avg_miles: number; rpm: number; count: number; order_ids: string[] };
  total_freight: number;
  total_miles: number;
  combined_rpm: number;
}

type TriSortKey = "intermediate" | "leg1_freight" | "leg1_rpm" | "leg2_freight" | "leg2_rpm" | "total_freight" | "total_miles" | "combined_rpm";

export default function BeverlyHeatmapLane() {
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [pickupRadius, setPickupRadius] = useState(60);
  const [deliveryRadius, setDeliveryRadius] = useState(60);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "order_count", dir: "desc",
  });
  const [selectedBroker, setSelectedBroker] = useState<BrokerStat | null>(null);
  const [triHaulMode, setTriHaulMode] = useState(false);
  const [triSort, setTriSort] = useState<{ key: TriSortKey; dir: "asc" | "desc" }>({ key: "total_freight", dir: "desc" });
  const [selectedTriCombo, setSelectedTriCombo] = useState<TriHaulCombo | null>(null);

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  // In-memory geocode cache (per session) + cached mapbox token
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
    if (!dateRange?.from) {
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      setDateRange({ from: thirtyDaysAgo, to: today });
    }
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
  const hasBothCoords = pickupCoords != null && deliveryCoords != null;

  // Fetch matching orders based on coordinates
  const { data: laneData, isLoading } = useQuery({
    queryKey: ["heatmap-lane", pickupCoords, deliveryCoords, startDateStr, endDateStr, pickupRadius, deliveryRadius],
    queryFn: async () => {
      if (!pickupCoords && !deliveryCoords) return null;
      const { data, error } = await supabase.functions.invoke("lane-search", {
        body: {
          pickup: pickupCoords,
          delivery: deliveryCoords,
          pickupRadius,
          deliveryRadius,
          dateFrom: startDateStr ?? null,
          dateTo: endDateStr ?? null,
        },
      });
      if (error) throw error;
      return data as {
        overall: { count: number; avgFreight: number; avgMiles: number; rpm: number };
        brokerStats: BrokerStat[];
      };
    },
    enabled: hasCoords && !triHaulMode,
    staleTime: 5 * 60 * 1000,
  });

  // Deep search query
  const deepEnabled = deepMode && (deepScope === "global" || hasCoords);
  const { data: deepData, isLoading: isLoadingDeep } = useQuery({
    queryKey: ["heatmap-lane-deep", deepScope, pickupCoords, deliveryCoords, startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("lane-deep-search", {
        body: {
          scope: deepScope,
          pickup: deepScope === "filtered" ? pickupCoords : null,
          delivery: deepScope === "filtered" ? deliveryCoords : null,
          dateFrom: startDateStr ?? null,
          dateTo: endDateStr ?? null,
          minRepeats: 3,
        },
      });
      if (error) throw error;
      return data as { lanes: DeepLane[]; truncated: boolean; scanned: number };
    },
    enabled: deepEnabled,
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

  // Order details for selected deep lane (reuse same shape as broker dialog)
  const deepDialogOrderIds = selectedDeepLane?.order_ids || [];
  const { data: deepOrderDetails = [], isLoading: isLoadingDeepOrders } = useQuery({
    queryKey: ["heatmap-lane-deep-orders", deepDialogOrderIds],
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
      // newest first
      allDetails.sort((a, b) => (b.pickup_datetime || "").localeCompare(a.pickup_datetime || ""));
      return allDetails;
    },
    enabled: deepDialogOrderIds.length > 0,
    staleTime: 0,
  });

  // Tri-haul query
  const { data: triHaulData, isLoading: isLoadingTri } = useQuery({
    queryKey: ["heatmap-trihaul", pickupCoords, deliveryCoords, startDateStr, endDateStr, pickupRadius, deliveryRadius],
    queryFn: async () => {
      if (!pickupCoords || !deliveryCoords) return null;
      const { data, error } = await supabase.functions.invoke("lane-trihaul", {
        body: {
          pickup: pickupCoords,
          delivery: deliveryCoords,
          pickupRadius,
          deliveryRadius,
          dateFrom: startDateStr ?? null,
          dateTo: endDateStr ?? null,
          topN: 30,
        },
      });
      if (error) throw error;
      return data as { combos: TriHaulCombo[] };
    },
    enabled: hasBothCoords && triHaulMode,
    staleTime: 5 * 60 * 1000,
  });

  const sortedTri = useMemo(() => {
    if (!triHaulData?.combos) return [];
    const rows = [...triHaulData.combos];
    const { key, dir } = triSort;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "intermediate":
          cmp = `${a.intermediate.city}, ${a.intermediate.state}`.localeCompare(`${b.intermediate.city}, ${b.intermediate.state}`);
          break;
        case "leg1_freight": cmp = a.leg1.avg_freight - b.leg1.avg_freight; break;
        case "leg1_rpm": cmp = a.leg1.rpm - b.leg1.rpm; break;
        case "leg2_freight": cmp = a.leg2.avg_freight - b.leg2.avg_freight; break;
        case "leg2_rpm": cmp = a.leg2.rpm - b.leg2.rpm; break;
        case "total_freight": cmp = a.total_freight - b.total_freight; break;
        case "total_miles": cmp = a.total_miles - b.total_miles; break;
        case "combined_rpm": cmp = a.combined_rpm - b.combined_rpm; break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [triHaulData?.combos, triSort]);

  const handleTriSort = (key: TriSortKey) => {
    setTriSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  const TriSortIcon = ({ columnKey }: { columnKey: TriSortKey }) => {
    if (triSort.key !== columnKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return triSort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  // Combined order ids for tri-haul dialog
  const triDialogOrderIds = useMemo(
    () => selectedTriCombo ? [...selectedTriCombo.leg1.order_ids, ...selectedTriCombo.leg2.order_ids] : [],
    [selectedTriCombo]
  );
  const { data: triOrderDetails = [], isLoading: isLoadingTriOrders } = useQuery({
    queryKey: ["heatmap-trihaul-orders", triDialogOrderIds],
    queryFn: async () => {
      if (triDialogOrderIds.length === 0) return [];
      const ids = triDialogOrderIds;
      const { data: orders } = await supabase
        .from("orders")
        .select("id, broker_load_number, freight_amount, loaded_miles")
        .in("id", ids);
      if (!orders) return [];
      const { data: pds } = await supabase
        .from("pickup_drops")
        .select("order_id, city, state, type, sequence_number")
        .in("order_id", orders.map(o => o.id))
        .order("sequence_number", { ascending: true });
      const pdMap = new Map<string, { city: string | null; state: string | null; stop_type: string | null }[]>();
      for (const pd of pds || []) {
        if (!pdMap.has(pd.order_id)) pdMap.set(pd.order_id, []);
        pdMap.get(pd.order_id)!.push({ city: pd.city, state: pd.state, stop_type: pd.type });
      }
      return orders.map(o => ({ ...o, pickup_drops: pdMap.get(o.id) || [] }));
    },
    enabled: triDialogOrderIds.length > 0,
    staleTime: 0,
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
          <div className="flex gap-2">
            <Input
              placeholder="City, State or address..."
              value={pickupAddress}
              onChange={e => setPickupAddress(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              max={450}
              value={pickupRadius}
              onChange={e => setPickupRadius(Math.min(450, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-[70px]"
              title="Radius in miles"
            />
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Delivery Location</label>
          <div className="flex gap-2">
            <Input
              placeholder="City, State or address..."
              value={deliveryAddress}
              onChange={e => setDeliveryAddress(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              max={450}
              value={deliveryRadius}
              onChange={e => setDeliveryRadius(Math.min(450, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-[70px]"
              title="Radius in miles"
            />
          </div>
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={setDateRange}
          placeholder="Pickup date range"
          className="w-[260px]"
        />
        <Button
          variant={triHaulMode ? "default" : "outline"}
          onClick={() => { setTriHaulMode(v => !v); if (deepMode) setDeepMode(false); }}
          title="Find best 2-leg routes A→X→B"
        >
          <Route className="h-4 w-4 mr-1" />
          TRI-HAUL
        </Button>
        <Button
          variant={deepMode ? "default" : "outline"}
          onClick={() => { setDeepMode(v => !v); if (triHaulMode) setTriHaulMode(false); }}
          title="Find repeat broker lanes (contract candidates) with rate trend"
        >
          <Repeat className="h-4 w-4 mr-1" />
          DEEP SEARCH
        </Button>
        <Button onClick={handleSearch} disabled={isGeocoding || (!pickupAddress.trim() && !deliveryAddress.trim())}>
          <Search className="h-4 w-4 mr-1" />
          {isGeocoding ? "Geocoding..." : "Search"}
        </Button>
      </div>

      {triHaulMode && (
        <div className="text-xs text-muted-foreground">
          Tri-Haul mode: finds intermediate cities X so you can run two paying loads A→X then X→B. Both pickup and delivery locations are required.
          {!hasBothCoords && hasCoords && (
            <span className="ml-1 text-destructive">Enter both pickup and delivery, then click Search.</span>
          )}
        </div>
      )}

      {deepMode && (
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span>
            Deep Search: surfaces broker × exact-lane pairs (≤1 mi on both ends) with ≥3 loads in window. Trend compares last 30 days vs prior 30 days; expected rate = last-30 RPM × avg miles.
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <span className="font-medium">Scope:</span>
            <Button size="sm" variant={deepScope === "global" ? "default" : "outline"} onClick={() => setDeepScope("global")}>All lanes</Button>
            <Button size="sm" variant={deepScope === "filtered" ? "default" : "outline"} onClick={() => setDeepScope("filtered")} disabled={!hasCoords}>Filter by pickup/delivery</Button>
          </div>
        </div>
      )}

      {/* Coordinate badges */}
      {hasCoords && (
        <div className="flex gap-2 flex-wrap">
          {pickupCoords && (
            <Badge variant="outline" className="text-xs">
              Pickup: {pickupCoords.lat.toFixed(3)}, {pickupCoords.lng.toFixed(3)} (±{pickupRadius}mi)
            </Badge>
          )}
          {deliveryCoords && (
            <Badge variant="outline" className="text-xs">
              Delivery: {deliveryCoords.lat.toFixed(3)}, {deliveryCoords.lng.toFixed(3)} (±{deliveryRadius}mi)
            </Badge>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && hasCoords && !triHaulMode && !deepMode && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading lane data...</div>
      )}
      {isLoadingTri && hasBothCoords && triHaulMode && !deepMode && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading tri-haul combos...</div>
      )}
      {isLoadingDeep && deepMode && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Scanning lanes... this may take a moment.</div>
      )}

      {/* Overall summary */}
      {!triHaulMode && !deepMode && laneData?.overall && (
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
      {!triHaulMode && !deepMode && hasCoords && !isLoading && laneData && laneData.overall?.count === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">No loads found for this lane.</div>
      )}

      {/* Broker breakdown table */}
      {!triHaulMode && !deepMode && sorted.length > 0 && (
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

      {/* Tri-Haul results */}
      {triHaulMode && hasBothCoords && !isLoadingTri && triHaulData && (
        triHaulData.combos.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No tri-haul combos found for this lane.</div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px] cursor-pointer select-none" onClick={() => handleTriSort("intermediate")}>
                    <span className="inline-flex items-center">Intermediate (X) <TriSortIcon columnKey="intermediate" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[110px] cursor-pointer select-none" onClick={() => handleTriSort("leg1_freight")}>
                    <span className="inline-flex items-center justify-end w-full">Leg 1 Avg $ <TriSortIcon columnKey="leg1_freight" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[90px] cursor-pointer select-none" onClick={() => handleTriSort("leg1_rpm")}>
                    <span className="inline-flex items-center justify-end w-full">Leg 1 RPM <TriSortIcon columnKey="leg1_rpm" /></span>
                  </TableHead>
                  <TableHead className="text-center w-[70px]">L1 #</TableHead>
                  <TableHead className="text-right w-[110px] cursor-pointer select-none" onClick={() => handleTriSort("leg2_freight")}>
                    <span className="inline-flex items-center justify-end w-full">Leg 2 Avg $ <TriSortIcon columnKey="leg2_freight" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[90px] cursor-pointer select-none" onClick={() => handleTriSort("leg2_rpm")}>
                    <span className="inline-flex items-center justify-end w-full">Leg 2 RPM <TriSortIcon columnKey="leg2_rpm" /></span>
                  </TableHead>
                  <TableHead className="text-center w-[70px]">L2 #</TableHead>
                  <TableHead className="text-right w-[120px] cursor-pointer select-none" onClick={() => handleTriSort("total_freight")}>
                    <span className="inline-flex items-center justify-end w-full">Total $ <TriSortIcon columnKey="total_freight" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[100px] cursor-pointer select-none" onClick={() => handleTriSort("total_miles")}>
                    <span className="inline-flex items-center justify-end w-full">Total Mi <TriSortIcon columnKey="total_miles" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[100px] cursor-pointer select-none" onClick={() => handleTriSort("combined_rpm")}>
                    <span className="inline-flex items-center justify-end w-full">Combo RPM <TriSortIcon columnKey="combined_rpm" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTri.map((c, i) => (
                  <TableRow
                    key={`${c.intermediate.city}-${c.intermediate.state}-${i}`}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedTriCombo(c)}
                  >
                    <TableCell className="font-medium text-sm">{c.intermediate.city}, {c.intermediate.state}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmt(c.leg1.avg_freight)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmtRpm(c.leg1.rpm)}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary" className="font-mono">{c.leg1.count}</Badge></TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmt(c.leg2.avg_freight)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmtRpm(c.leg2.rpm)}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary" className="font-mono">{c.leg2.count}</Badge></TableCell>
                    <TableCell className="text-right text-sm font-mono font-semibold">{fmt(c.total_freight)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmtMiles(c.total_miles)}</TableCell>
                    <TableCell className="text-right text-sm font-mono font-semibold">{fmtRpm(c.combined_rpm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* Prompt to search */}
      {!hasCoords && !isGeocoding && !triHaulMode && !deepMode && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Enter pickup and/or delivery locations to search lane history.
        </div>
      )}
      {triHaulMode && !hasBothCoords && !isGeocoding && !deepMode && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Enter both pickup and delivery locations, then click Search.
        </div>
      )}

      {/* Deep Search prompts / results */}
      {deepMode && deepScope === "filtered" && !hasCoords && !isGeocoding && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Enter pickup and/or delivery, click Search, then results will filter to that lane.
        </div>
      )}
      {deepMode && !isLoadingDeep && deepData && deepData.lanes.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No repeat lanes (≥3 loads) found{deepData.truncated ? " in the first batch scanned" : ""}.
        </div>
      )}
      {deepMode && deepData && deepData.lanes.length > 0 && (
        <>
          {deepData.truncated && (
            <div className="text-xs text-amber-600">
              Scan was capped at {deepData.scanned.toLocaleString()} loads. Narrow the date range for full coverage.
            </div>
          )}
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
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[130px]">Broker Load #</TableHead>
                    <TableHead className="w-[280px]">Lane</TableHead>
                    <TableHead className="text-right w-[100px]">Freight</TableHead>
                    <TableHead className="text-right w-[80px]">Miles</TableHead>
                    <TableHead className="text-right w-[70px]">RPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDetails.map(order => {
                    const miles = Number(order.loaded_miles) || 0;
                    const freight = Number(order.freight_amount) || 0;
                    const pickups = order.pickup_drops.filter(s => s.stop_type === "pickup");
                    const deliveries = order.pickup_drops.filter(s => s.stop_type === "delivery");
                    const p = pickups[0];
                    const d = deliveries[deliveries.length - 1];
                    const lane = `${p ? `${p.city || "?"}, ${p.state || "?"}` : "?"} → ${d ? `${d.city || "?"}, ${d.state || "?"}` : "?"}`;
                    return (
                      <TableRow key={order.id} className="hover:bg-transparent">
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

      {/* Tri-Haul Combo Dialog */}
      <Dialog open={!!selectedTriCombo} onOpenChange={(open) => { if (!open) setSelectedTriCombo(null); }}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Tri-Haul via {selectedTriCombo?.intermediate.city}, {selectedTriCombo?.intermediate.state} — {triDialogOrderIds.length} loads
            </DialogTitle>
          </DialogHeader>

          {isLoadingTriOrders ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Loading orders...</div>
          ) : triOrderDetails.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">No orders found.</div>
          ) : (
            <div className="space-y-4">
              {(["leg1", "leg2"] as const).map((legKey) => {
                const idSet = new Set(selectedTriCombo?.[legKey].order_ids || []);
                const rows = triOrderDetails.filter(o => idSet.has(o.id));
                return (
                  <div key={legKey}>
                    <div className="text-sm font-semibold mb-2">
                      {legKey === "leg1" ? "Leg 1: Pickup → Intermediate" : "Leg 2: Intermediate → Delivery"} ({rows.length})
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[130px]">Broker Load #</TableHead>
                            <TableHead className="w-[300px]">Lane</TableHead>
                            <TableHead className="text-right w-[100px]">Freight</TableHead>
                            <TableHead className="text-right w-[80px]">Miles</TableHead>
                            <TableHead className="text-right w-[70px]">RPM</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map(order => {
                            const miles = Number(order.loaded_miles) || 0;
                            const freight = Number(order.freight_amount) || 0;
                            const pickups = order.pickup_drops.filter((s: any) => s.stop_type === "pickup");
                            const deliveries = order.pickup_drops.filter((s: any) => s.stop_type === "delivery");
                            const p = pickups[0];
                            const d = deliveries[deliveries.length - 1];
                            const lane = `${p ? `${p.city || "?"}, ${p.state || "?"}` : "?"} → ${d ? `${d.city || "?"}, ${d.state || "?"}` : "?"}`;
                            return (
                              <TableRow key={order.id} className="hover:bg-transparent">
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
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deep Search Lane Dialog */}
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
