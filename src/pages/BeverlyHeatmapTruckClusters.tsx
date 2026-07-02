import { useState, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { MapPin, Search, Loader2 } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CLUSTER_RADIUS_MILES = 100;
const MIN_TRUCKS_PER_AREA = 3;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

interface TruckPoint {
  truck_id: string;
  truck_number: string;
  order_id: string;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  delivery_datetime: string;
  driver_name: string;
  dispatcher_name: string;
  dispatcher_ext: string;
  dispatcher_office: string;
}

interface Cluster {
  centerLat: number;
  centerLng: number;
  label: string;
  trucks: TruckPoint[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function BeverlyHeatmapTruckClusters() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [runDate, setRunDate] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data, isFetching } = useQuery({
    queryKey: ["truck-clusters", runDate],
    enabled: !!runDate,
    staleTime: 0,
    queryFn: async (): Promise<{ points: TruckPoint[]; clusters: Cluster[] }> => {
      if (!runDate) return { points: [], clusters: [] };
      const start = `${runDate} 00:00:00`;
      const end = `${runDate} 23:59:59`;

      // 1) orders delivered on that date
      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select("id, truck_id, driver1_id, delivery_datetime")
        .eq("canceled", false)
        .not("truck_id", "is", null)
        .gte("delivery_datetime", start)
        .lte("delivery_datetime", end);
      if (ordErr) throw ordErr;
      if (!orders || orders.length === 0) return { points: [], clusters: [] };

      const truckIds = Array.from(new Set(orders.map((o: any) => o.truck_id as string)));

      // 2) fetch any later orders for those trucks (pickup_datetime > start of that day)
      const laterByTruck = new Map<string, string[]>(); // truck_id -> pickup_datetimes
      for (const c of chunk(truckIds, 200)) {
        const { data: later, error: lErr } = await supabase
          .from("orders")
          .select("truck_id, pickup_datetime")
          .eq("canceled", false)
          .in("truck_id", c)
          .gt("pickup_datetime", start);
        if (lErr) throw lErr;
        for (const row of later || []) {
          const arr = laterByTruck.get(row.truck_id as string) || [];
          arr.push(row.pickup_datetime as string);
          laterByTruck.set(row.truck_id as string, arr);
        }
      }

      // 3) keep only orders where the truck has NO later pickup after this delivery
      const kept = orders.filter((o: any) => {
        const laters = laterByTruck.get(o.truck_id) || [];
        return !laters.some((p) => p > o.delivery_datetime);
      });

      // If a truck has multiple kept deliveries same day, use the latest
      const byTruck = new Map<string, any>();
      for (const o of kept) {
        const cur = byTruck.get(o.truck_id);
        if (!cur || o.delivery_datetime > cur.delivery_datetime) byTruck.set(o.truck_id, o);
      }
      const finalOrders = Array.from(byTruck.values());
      if (finalOrders.length === 0) return { points: [], clusters: [] };

      // 4) fetch delivery drops with coords
      const orderIds = finalOrders.map((o) => o.id as string);
      const dropsByOrder = new Map<string, { lat: number; lng: number; city: string | null; state: string | null; seq: number }>();
      for (const c of chunk(orderIds, 200)) {
        const { data: pds, error: pErr } = await supabase
          .from("pickup_drops")
          .select("order_id, type, latitude, longitude, city, state, sequence_number")
          .in("order_id", c)
          .eq("type", "delivery")
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        if (pErr) throw pErr;
        for (const pd of pds || []) {
          const seq = Number(pd.sequence_number) || 0;
          const cur = dropsByOrder.get(pd.order_id as string);
          if (!cur || seq > cur.seq) {
            dropsByOrder.set(pd.order_id as string, {
              lat: Number(pd.latitude),
              lng: Number(pd.longitude),
              city: pd.city as string | null,
              state: pd.state as string | null,
              seq,
            });
          }
        }
      }

      // 5) truck numbers
      const truckNumMap = new Map<string, string>();
      for (const c of chunk(truckIds, 200)) {
        const { data: trs, error: tErr } = await supabase
          .from("trucks")
          .select("id, truck_number")
          .in("id", c);
        if (tErr) throw tErr;
        for (const t of trs || []) truckNumMap.set(t.id as string, (t.truck_number as string) || "");
      }

      // 5b) drivers (name + dispatcher) via orders.driver1_id
      const driverIds = Array.from(
        new Set(finalOrders.map((o: any) => o.driver1_id).filter(Boolean))
      ) as string[];
      const driverInfo = new Map<string, { name: string; dispatcher_id: string | null }>();
      for (const c of chunk(driverIds, 200)) {
        const { data: drs, error: dErr } = await supabase
          .from("drivers")
          .select("id, name, dispatcher_id")
          .in("id", c);
        if (dErr) throw dErr;
        for (const d of drs || [])
          driverInfo.set(d.id as string, {
            name: (d.name as string) || "",
            dispatcher_id: (d.dispatcher_id as string | null) ?? null,
          });
      }
      const dispatcherIds = Array.from(
        new Set(
          Array.from(driverInfo.values())
            .map((d) => d.dispatcher_id)
            .filter(Boolean) as string[]
        )
      );
      const dispatcherInfo = new Map<string, { name: string; ext: string; office: string }>();
      for (const c of chunk(dispatcherIds, 200)) {
        const { data: prs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, full_name, ext, office")
          .in("user_id", c);
        if (pErr) throw pErr;
        for (const p of prs || [])
          dispatcherInfo.set(p.user_id as string, {
            name: (p.full_name as string) || "",
            ext: (p.ext as string) || "",
            office: (p.office as string) || "",
          });
      }

      const points: TruckPoint[] = [];
      for (const o of finalOrders) {
        const drop = dropsByOrder.get(o.id);
        if (!drop) continue;
        const drv = o.driver1_id ? driverInfo.get(o.driver1_id) : undefined;
        const disp = drv?.dispatcher_id ? dispatcherInfo.get(drv.dispatcher_id) : undefined;
        points.push({
          truck_id: o.truck_id,
          truck_number: truckNumMap.get(o.truck_id) || "",
          order_id: o.id,
          city: drop.city,
          state: drop.state,
          lat: drop.lat,
          lng: drop.lng,
          delivery_datetime: o.delivery_datetime,
          driver_name: drv?.name || "",
          dispatcher_name: disp?.name || "",
          dispatcher_ext: disp?.ext || "",
          dispatcher_office: disp?.office || "",
        });
      }

      // 6) greedy clustering (100mi)
      const remaining = new Set(points.map((_, i) => i));
      const clusters: Cluster[] = [];
      while (remaining.size >= MIN_TRUCKS_PER_AREA) {
        let bestIdx = -1;
        let bestMembers: number[] = [];
        for (const i of remaining) {
          const members: number[] = [];
          for (const j of remaining) {
            if (haversineMiles(points[i].lat, points[i].lng, points[j].lat, points[j].lng) <= CLUSTER_RADIUS_MILES) {
              members.push(j);
            }
          }
          if (members.length > bestMembers.length) {
            bestMembers = members;
            bestIdx = i;
          }
        }
        if (bestIdx < 0 || bestMembers.length < MIN_TRUCKS_PER_AREA) break;
        // centroid
        let lat = 0, lng = 0;
        for (const m of bestMembers) { lat += points[m].lat; lng += points[m].lng; }
        lat /= bestMembers.length; lng /= bestMembers.length;
        // Label = most common city,state among members
        const labelCounts = new Map<string, number>();
        for (const m of bestMembers) {
          const k = `${points[m].city || "?"}, ${points[m].state || "?"}`;
          labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
        }
        const label = Array.from(labelCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
        clusters.push({
          centerLat: lat,
          centerLng: lng,
          label,
          trucks: bestMembers.map((m) => points[m]),
        });
        for (const m of bestMembers) remaining.delete(m);
      }
      clusters.sort((a, b) => b.trucks.length - a.trucks.length);
      return { points, clusters };
    },
  });

  const clusters = data?.clusters || [];
  const totalPoints = data?.points.length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Truck Clusters by Delivery Date
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <DatePicker date={date} onDateChange={setDate} placeholder="Select date" />
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (!date) return;
                setRunDate(format(date, "yyyy-MM-dd"));
              }}
              disabled={!date || isFetching}
            >
              {isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              Search
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!runDate && (
          <div className="text-center py-12 text-muted-foreground">
            Select a date and click Search to find clusters of 3+ trucks within a 100-mile area.
          </div>
        )}
        {runDate && !isFetching && clusters.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No areas with {MIN_TRUCKS_PER_AREA}+ trucks found on {runDate}. ({totalPoints} eligible trucks scanned.)
          </div>
        )}
        {clusters.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Found {clusters.length} area{clusters.length === 1 ? "" : "s"} with {MIN_TRUCKS_PER_AREA}+ trucks (100mi radius) — {totalPoints} eligible trucks total.
            </div>
            {clusters.map((cl, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{cl.label}</CardTitle>
                      <Badge variant="secondary">{cl.trucks.length} trucks</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpanded((s) => ({ ...s, [idx]: !s[idx] }))}
                    >
                      {expanded[idx] ? (
                        <><ChevronDown className="h-4 w-4 mr-1" />Hide trucks</>
                      ) : (
                        <><ChevronRight className="h-4 w-4 mr-1" />Show trucks</>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                {expanded[idx] && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Truck</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Dispatcher</TableHead>
                        <TableHead>Delivery City</TableHead>
                        <TableHead>Delivery Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cl.trucks
                        .slice()
                        .sort((a, b) => a.delivery_datetime.localeCompare(b.delivery_datetime))
                        .map((t) => (
                          <TableRow key={t.order_id}>
                            <TableCell className="font-medium">{t.truck_number || t.truck_id.slice(0, 8)}</TableCell>
                            <TableCell>{t.driver_name || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>{t.dispatcher_name || "—"}</span>
                                <span className="text-xs text-muted-foreground">
                                  {[t.dispatcher_ext && `ext ${t.dispatcher_ext}`, t.dispatcher_office]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{t.city || "?"}, {t.state || "?"}</TableCell>
                            <TableCell className="text-muted-foreground">{t.delivery_datetime.replace("T", " ").slice(0, 16)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}