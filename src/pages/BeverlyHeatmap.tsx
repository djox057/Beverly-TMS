import { useState, useMemo } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BeverlyHeatmapFacilities from "./BeverlyHeatmapFacilities";
import BeverlyHeatmapBrokers from "./BeverlyHeatmapBrokers";
import BeverlyHeatmapLane from "./BeverlyHeatmapLane";
import BeverlyHeatmapDeepSearch from "./BeverlyHeatmapDeepSearch";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, MapPin, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HeatmapRow {
  city_name: string;
  city_state: string;
  city_lat: number;
  city_lng: number;
  count_date: string;
  truck_count: number;
  total_freight: number;
  total_miles: number;
  order_ids: string[] | null;
}

interface OrderDetail {
  broker_load_number: string | null;
  freight_amount: number | null;
  loaded_miles: number | null;
  dh_miles: number | null;
  mileage: number | null;
  pickup_drops: { city: string | null; state: string | null; stop_type: string | null }[];
}

const formatCurrency = (val: number) =>
  val > 0 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "";

const formatMiles = (val: number) =>
  val > 0 ? val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "";

const formatRpm = (freight: number, miles: number) =>
  miles > 0 ? `$${(freight / miles).toFixed(2)}` : "";

interface CityAgg {
  city: string;
  lat: number;
  lng: number;
  total: number;
  totalFreight: number;
  totalMiles: number;
  daysWithData: number;
  orderIds: string[];
}

/** Haversine distance in miles between two lat/lng points */
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CLUSTER_RADIUS_MILES = 60;

interface CityNextData {
  freight: number;
  miles: number;
  count: number;
  deliveryTotal: number;
  nextOrderIds: string[];
}

type SortKey = "city" | "total" | "rpm";

// --- Date filter helpers ---

const getWeekStartDate = (weeksAgo: number) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - diff - weeksAgo * 7);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const generateWeekOptions = () => {
  const weeks = [];
  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const dayOfWeek = startOfYear.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const firstMonday = new Date(startOfYear);
  firstMonday.setDate(startOfYear.getDate() - diff);
  const currentWeekStart = getWeekStartDate(0);
  const weeksFromStart = Math.floor((currentWeekStart.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  for (let i = 0; i < 52; i++) {
    const weekStart = getWeekStartDate(i);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const fmtDate = (date: Date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    weeks.push({
      value: i.toString(),
      label: i === 0 ? "This Week" : i === 1 ? "Last Week" : `${fmtDate(weekStart)} - ${fmtDate(weekEnd)}`,
      weekNumber: weeksFromStart - i,
    });
  }
  return weeks;
};

const generateMonthOptions = () => {
  const months = [];
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const yearMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      value: yearMonth,
      label: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      start: monthStart,
      end: monthEnd,
    });
  }
  return months;
};

export default function BeverlyHeatmap() {
  const { hasRole } = useAuthContext();
  const canRecompute = hasRole("admin") || hasRole("manager");
  const isDispatchOnly = hasRole("dispatch") && !hasRole("admin") && !hasRole("manager") && !hasRole("chicago_management");
  const canDeepSearch = hasRole("admin") || hasRole("manager") || hasRole("supervisor");

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<CityAgg | null>(null);
  const [dialogOrderIds, setDialogOrderIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "total", dir: "desc" });

  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const monthOptions = useMemo(() => generateMonthOptions(), []);

  const handleWeekChange = (value: string) => {
    setSelectedWeek(value);
    setSelectedMonth("all");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const startDate = getWeekStartDate(parseInt(value));
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      setDateRange({ from: startDate, to: endDate });
    }
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    setSelectedWeek("all");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const monthOption = monthOptions.find((m) => m.value === value);
      if (monthOption) {
        setDateRange({ from: monthOption.start, to: monthOption.end });
      }
    }
  };

  const startStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  const { data: rawData = [], isLoading, refetch } = useQuery({
    queryKey: ["heatmap-city-counts", startStr, endStr],
    queryFn: async () => {
      if (!startStr || !endStr) return [];
      const { data, error } = await supabase
        .from("heatmap_city_counts")
        .select("city_name, city_state, city_lat, city_lng, count_date, truck_count, total_freight, total_miles, order_ids")
        .gte("count_date", startStr)
        .lte("count_date", endStr)
        .order("truck_count", { ascending: false });
      if (error) throw error;
      return (data || []) as HeatmapRow[];
    },
    enabled: !!startStr && !!endStr,
  });

  // Build city rows (unsorted – sorting applied later)
  const baseCities = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to || rawData.length === 0) return [] as CityAgg[];

    const cityTotals = new Map<string, number>();
    const cityFreight = new Map<string, number>();
    const cityMiles = new Map<string, number>();
    const cityDays = new Map<string, Set<string>>();
    const cityOrderIds = new Map<string, Set<string>>();
    const cityCoords = new Map<string, { lat: number; lng: number }>();

    for (const row of rawData) {
      const ck = `${row.city_name}, ${row.city_state}`;
      cityTotals.set(ck, (cityTotals.get(ck) || 0) + row.truck_count);
      cityFreight.set(ck, (cityFreight.get(ck) || 0) + (row.total_freight || 0));
      cityMiles.set(ck, (cityMiles.get(ck) || 0) + (row.total_miles || 0));
      if (!cityDays.has(ck)) cityDays.set(ck, new Set());
      cityDays.get(ck)!.add(row.count_date);
      if (!cityOrderIds.has(ck)) cityOrderIds.set(ck, new Set());
      if (row.order_ids) {
        for (const oid of row.order_ids) cityOrderIds.get(ck)!.add(oid);
      }
      if (!cityCoords.has(ck)) cityCoords.set(ck, { lat: row.city_lat, lng: row.city_lng });
    }

    return [...cityTotals.entries()].map(([city, total]) => ({
      city,
      lat: cityCoords.get(city)?.lat || 0,
      lng: cityCoords.get(city)?.lng || 0,
      total,
      totalFreight: cityFreight.get(city) || 0,
      totalMiles: cityMiles.get(city) || 0,
      daysWithData: cityDays.get(city)?.size || 1,
      orderIds: [...(cityOrderIds.get(city) || [])],
    }));
  }, [rawData, dateRange]);

  // Collect all order IDs across all cities for next-order lookup
  const allOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of baseCities) for (const oid of c.orderIds) ids.add(oid);
    return [...ids];
  }, [baseCities]);

  // Fetch next-order financials + delivery-only filtering
  const { data: nextOrderMap, isLoading: isLoadingNext } = useQuery({
    queryKey: ["heatmap-next-orders", allOrderIds],
    queryFn: async () => {
      if (allOrderIds.length === 0) return new Map<string, CityNextData>();

      // Step 1: Fetch heatmap orders to get driver1_id and pickup_datetime
      const heatmapOrders: { id: string; driver1_id: string; pickup_datetime: string }[] = [];
      for (let i = 0; i < allOrderIds.length; i += 200) {
        const chunk = allOrderIds.slice(i, i + 200);
        const { data } = await supabase
          .from("orders")
          .select("id, driver1_id, pickup_datetime")
          .in("id", chunk);
        if (data) heatmapOrders.push(...(data as any[]));
      }

      // Step 2: Fetch pickup_drops with coordinates for all heatmap orders
      const allPds: { order_id: string; type: string; latitude: number | null; longitude: number | null }[] = [];
      for (let i = 0; i < allOrderIds.length; i += 200) {
        const chunk = allOrderIds.slice(i, i + 200);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, type, latitude, longitude")
          .in("order_id", chunk);
        if (pds) allPds.push(...(pds as any[]));
      }

      // Build map: orderId -> delivery stops with coords
      const orderDeliveryStops = new Map<string, { lat: number; lng: number }[]>();
      for (const pd of allPds) {
        if (pd.type === "delivery" && pd.latitude != null && pd.longitude != null) {
          if (!orderDeliveryStops.has(pd.order_id)) orderDeliveryStops.set(pd.order_id, []);
          orderDeliveryStops.get(pd.order_id)!.push({ lat: pd.latitude, lng: pd.longitude });
        }
      }

      // Build a map: orderId -> { driver1_id, pickup_datetime }
      const orderDriverMap = new Map<string, { driver1_id: string; pickup_datetime: string }>();
      const driverIds = new Set<string>();
      let minPickup = "";
      let maxPickup = "";
      for (const o of heatmapOrders) {
        if (o.driver1_id && o.pickup_datetime) {
          orderDriverMap.set(o.id, { driver1_id: o.driver1_id, pickup_datetime: o.pickup_datetime });
          driverIds.add(o.driver1_id);
          if (!minPickup || o.pickup_datetime < minPickup) minPickup = o.pickup_datetime;
          if (!maxPickup || o.pickup_datetime > maxPickup) maxPickup = o.pickup_datetime;
        }
      }

      // Compute date window: from minPickup to maxPickup + 30 days
      const maxPickupPlus30 = maxPickup
        ? new Date(new Date(maxPickup).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : "";

      if (driverIds.size === 0) return new Map<string, CityNextData>();

      // Step 3: Fetch all non-canceled orders for these drivers
      const driverIdArr = [...driverIds];
      const allDriverOrders: { id: string; driver1_id: string; pickup_datetime: string; freight_amount: number | null; loaded_miles: number | null; dh_miles: number | null; mileage: number | null }[] = [];
      for (let i = 0; i < driverIdArr.length; i += 200) {
        const chunk = driverIdArr.slice(i, i + 200);
        let offset = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data } = await supabase
            .from("orders")
            .select("id, driver1_id, pickup_datetime, freight_amount, loaded_miles, dh_miles, mileage")
            .in("driver1_id", chunk)
            .eq("canceled", false)
            .gte("pickup_datetime", minPickup)
            .lte("pickup_datetime", maxPickupPlus30)
            .order("pickup_datetime", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (data) allDriverOrders.push(...(data as any[]));
          if (!data || data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
      }

      // Group by driver and sort deterministically
      const driverOrdersSorted = new Map<string, typeof allDriverOrders>();
      const driverOrderIndex = new Map<string, Map<string, number>>();
      for (const o of allDriverOrders) {
        if (!o.driver1_id || !o.pickup_datetime) continue;
        if (!driverOrdersSorted.has(o.driver1_id)) driverOrdersSorted.set(o.driver1_id, []);
        driverOrdersSorted.get(o.driver1_id)!.push(o);
      }
      for (const [driverId, orders] of driverOrdersSorted) {
        orders.sort((a, b) => {
          const t = a.pickup_datetime.localeCompare(b.pickup_datetime);
          return t !== 0 ? t : a.id.localeCompare(b.id);
        });
        const idx = new Map<string, number>();
        orders.forEach((o, i) => idx.set(o.id, i));
        driverOrderIndex.set(driverId, idx);
      }

      // Step 4: For each heatmap order, find the next order for that driver
      const nextOrderForHeatmap = new Map<string, { id: string; freight: number; miles: number }>();
      for (const [orderId, info] of orderDriverMap) {
        const dOrders = driverOrdersSorted.get(info.driver1_id);
        if (!dOrders || dOrders.length === 0) continue;

        const idx = driverOrderIndex.get(info.driver1_id)?.get(orderId);
        let nextCandidate: (typeof dOrders)[number] | undefined;

        if (idx != null) {
          for (let i = idx + 1; i < dOrders.length; i++) {
            if (dOrders[i].id !== orderId) {
              nextCandidate = dOrders[i];
              break;
            }
          }
        }

        if (!nextCandidate) {
          nextCandidate = dOrders.find(
            (o) => o.id !== orderId && o.pickup_datetime >= info.pickup_datetime
          );
        }

        if (!nextCandidate) continue;

        const miles =
          nextCandidate.mileage != null
            ? Number(nextCandidate.mileage)
            : (Number(nextCandidate.loaded_miles) || 0) + (Number(nextCandidate.dh_miles) || 0);

        nextOrderForHeatmap.set(orderId, {
          id: nextCandidate.id,
          freight: Number(nextCandidate.freight_amount) || 0,
          miles,
        });
      }


      // Step 5: Aggregate per city — only delivery-to-cluster orders, include ALL next orders

      // Step 5: Aggregate per city — only delivery-to-cluster orders, verify next pickup is near cluster
      const cityNextMap = new Map<string, CityNextData>();
      for (const cityAgg of baseCities) {
        // Filter to orders that have a delivery stop within 60 miles of this cluster center
        const deliveryFilteredIds = cityAgg.orderIds.filter((oid) => {
          const delivStops = orderDeliveryStops.get(oid);
          if (!delivStops) return false;
          return delivStops.some(
            (s) => haversineDistanceMiles(s.lat, s.lng, cityAgg.lat, cityAgg.lng) <= CLUSTER_RADIUS_MILES
          );
        });

        let freight = 0, miles = 0, count = 0;
        const nextIds: string[] = [];
        for (const oid of deliveryFilteredIds) {
          const next = nextOrderForHeatmap.get(oid);
          if (!next) continue;

          freight += next.freight;
          miles += next.miles;
          count++;
          nextIds.push(next.id);
        }
        cityNextMap.set(cityAgg.city, {
          freight,
          miles,
          count,
          deliveryTotal: deliveryFilteredIds.length,
          nextOrderIds: [...new Set(nextIds)],
        });
      }

      return cityNextMap;
    },
    enabled: allOrderIds.length > 0,
    staleTime: 0,
  });

  // Apply sorting
  const sortedCities = useMemo(() => {
    let cities = [...baseCities];
    const { key, dir } = sortConfig;
    cities.sort((a, b) => {
      let cmp = 0;
      if (key === "city") {
        cmp = a.city.localeCompare(b.city);
      } else if (key === "total") {
        const aTotal = a.total;
        const bTotal = b.total;
        cmp = aTotal - bTotal;
      } else if (key === "rpm") {
        const aNext = nextOrderMap?.get(a.city);
        const bNext = nextOrderMap?.get(b.city);
        const aRpm = aNext && aNext.miles > 0 ? aNext.freight / aNext.miles : 0;
        const bRpm = bNext && bNext.miles > 0 ? bNext.freight / bNext.miles : 0;
        cmp = aRpm - bRpm;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return cities;
  }, [baseCities, sortConfig, nextOrderMap]);

  // Fetch order details when a city is selected (shows NEXT orders)
  const { data: orderDetails = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["heatmap-order-details", dialogOrderIds],
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-semibold text-foreground">Beverly Heatmap</h1>
      </div>

      <Tabs defaultValue={isDispatchOnly ? "lane" : "heatmap"} className="w-full">
        <TabsList>
          {!isDispatchOnly && <TabsTrigger value="heatmap">Heatmap</TabsTrigger>}
          {!isDispatchOnly && <TabsTrigger value="facilities">Facilities</TabsTrigger>}
          {!isDispatchOnly && <TabsTrigger value="brokers">Brokers</TabsTrigger>}
          <TabsTrigger value="lane">Lane</TabsTrigger>
          {canDeepSearch && <TabsTrigger value="deep-search">Deep Search</TabsTrigger>}
        </TabsList>

        <TabsContent value="heatmap">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                City Truck Density
              </CardTitle>
              {canRecompute && (
                <Button variant="outline" size="sm" onClick={handleRecompute} disabled={isRecomputing} className="ml-auto">
                  <RefreshCw className={`h-4 w-4 mr-1 ${isRecomputing ? "animate-spin" : ""}`} />
                  Recompute
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center w-full sm:w-auto">
              <Select value={selectedWeek} onValueChange={handleWeekChange}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time weekly</SelectItem>
                  {weekOptions.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMonth} onValueChange={handleMonthChange}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time monthly</SelectItem>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DateRangePicker
                date={selectedWeek === "all" && selectedMonth === "all" ? dateRange : undefined}
                onDateChange={(range) => {
                  setDateRange(range);
                  setSelectedWeek("all");
                  setSelectedMonth("all");
                }}
                placeholder="Custom date range"
                className="w-full sm:w-72"
              />

              {dateRange && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange(undefined);
                    setSelectedWeek("all");
                    setSelectedMonth("all");
                  }}
                >
                  Clear Filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading heatmap data...</div>
          ) : sortedCities.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No heatmap data for this date range. {canRecompute && "Try clicking Recompute."}
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      className="sticky left-0 z-10 bg-card w-[200px] cursor-pointer select-none"
                      onClick={() => handleSort("city")}
                    >
                      <span className="inline-flex items-center">
                        City <SortIcon columnKey="city" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-center w-[70px] cursor-pointer select-none"
                      onClick={() => handleSort("total")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Total <SortIcon columnKey="total" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right w-[100px]">Avg Freight</TableHead>
                    <TableHead className="text-right w-[90px]">Avg Miles</TableHead>
                    <TableHead
                      className="text-right w-[70px] cursor-pointer select-none"
                      onClick={() => handleSort("rpm")}
                    >
                      <span className="inline-flex items-center justify-end w-full">
                        RPM <SortIcon columnKey="rpm" />
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCities.map((cityAgg) => {
                    const { city } = cityAgg;
                    const nextData = nextOrderMap?.get(city);
                    const displayTotal = cityAgg.total;
                    const avgFreight = nextData && nextData.count > 0 ? nextData.freight / nextData.count : 0;
                    const avgMiles = nextData && nextData.count > 0 ? nextData.miles / nextData.count : 0;
                    const totalNextFreight = nextData?.freight || 0;
                    const totalNextMiles = nextData?.miles || 0;
                    return (
                      <TableRow key={city} className="hover:bg-transparent">
                        <TableCell className="sticky left-0 z-10 bg-card font-medium text-sm whitespace-nowrap">
                          {city}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className="font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => {
                              setSelectedCity(cityAgg);
                              setDialogOrderIds(nextData?.nextOrderIds || []);
                            }}
                          >
                            {displayTotal}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                          {formatCurrency(avgFreight)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                          {formatMiles(avgMiles)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                          {formatRpm(totalNextFreight, totalNextMiles)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedCity} onOpenChange={(open) => { if (!open) { setSelectedCity(null); setDialogOrderIds([]); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Next Orders from {selectedCity?.city} ({dialogOrderIds.length} orders)
            </DialogTitle>
          </DialogHeader>

          {isLoadingOrders ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Loading order details...</div>
          ) : orderDetails.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              No order data available. Try recomputing to populate order IDs.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[130px]">Broker Load #</TableHead>
                    <TableHead className="w-[300px]">Lane</TableHead>
                    <TableHead className="text-right w-[100px]">Freight</TableHead>
                    <TableHead className="text-right w-[80px]">Miles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDetails.map((order, idx) => (
                    <TableRow key={idx} className="hover:bg-transparent">
                      <TableCell className="font-mono text-sm">{order.broker_load_number || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{getLane(order.pickup_drops)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {formatCurrency(Number(order.freight_amount) || 0)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {formatMiles(getMiles(order))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="facilities">
          <BeverlyHeatmapFacilities />
        </TabsContent>

        <TabsContent value="brokers">
          <BeverlyHeatmapBrokers />
        </TabsContent>

        <TabsContent value="lane">
          <BeverlyHeatmapLane />
        </TabsContent>
        {canDeepSearch && (
          <TabsContent value="deep-search">
            <BeverlyHeatmapDeepSearch />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
