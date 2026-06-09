import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// FIPS state IDs to exclude: Alaska (02), Hawaii (15), and territories.
const EXCLUDED_STATE_IDS = new Set(["02", "15", "60", "66", "69", "72", "78"]);

// FIPS -> USPS abbreviation
const STATE_ABBR: Record<string, string> = {
  "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO",
  "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR",
  "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX",
  "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

type Direction = "inbound" | "outbound";
type ViewMode = "states" | "cities";

interface StateAgg {
  count: number;
  freight: number;
  loadedMiles: number;
  dhMiles: number;
}

interface StateMetrics {
  count: number;
  rpm: number;
  dhPerLoad: number;
  avgGross: number;
  totalFreight: number;
  totalLoadedMiles: number;
  totalDhMiles: number;
  rating: number;
}

interface CityAgg {
  city: string;
  state: string;
  count: number;
  freight: number;
  loadedMiles: number;
  dhMiles: number;
  latSum: number;
  lngSum: number;
  coordN: number;
}

interface CityMetrics extends StateMetrics {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Compute Monday (Chicago time) of the week containing `d`.
function chicagoMondayOf(d: Date): Date {
  // Get Chicago wall-clock parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  const wk = get("weekday"); // Mon, Tue, ...
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[wk] ?? 1;
  const offsetToMon = dow === 0 ? 6 : dow - 1;
  const base = new Date(Date.UTC(y, m - 1, day));
  base.setUTCDate(base.getUTCDate() - offsetToMon);
  return base; // date-only UTC midnight representing Chicago Monday
}

const RATING_COLORS: Record<number, string> = {
  1: "#000000",
  2: "#2B0000",
  3: "#5A0000",
  4: "#8B0000",
  5: "#CC3300",
  6: "#FF6600",
  7: "#FFAA00",
  8: "#B6D900",
  9: "#66CC33",
  10: "#00A000",
};

function interpolateColor(rating: number): string {
  return RATING_COLORS[rating] || "#000000";
}

function useStateRatings(direction: Direction) {
  return useQuery({
    queryKey: ["state-ratings", direction],
    queryFn: async () => {
      const now = new Date();
      const currentMon = chicagoMondayOf(now);
      const lastMon = new Date(currentMon);
      lastMon.setUTCDate(lastMon.getUTCDate() - 7);
      const fromIso = lastMon.toISOString();

      // Fetch orders with pickup in last+current week
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, freight_amount, loaded_miles, dh_miles")
        .eq("canceled", false)
        .gte("pickup_datetime", fromIso)
        .limit(5000);
      if (error) throw error;
      if (!orders || orders.length === 0) return {} as Record<string, number>;

      const orderIds = orders.map((o: any) => o.id);
      const wantedType = direction === "inbound" ? "delivery" : "pickup";

      // Pick the relevant stop per order: for inbound use last delivery, for outbound use first pickup
      const stopsByOrder = new Map<string, string>();
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, state, type, sequence_number")
          .in("order_id", chunk)
          .eq("type", wantedType)
          .not("state", "is", null);
        if (!pds) continue;
        const grouped = new Map<string, any[]>();
        for (const pd of pds) {
          if (!grouped.has(pd.order_id)) grouped.set(pd.order_id, []);
          grouped.get(pd.order_id)!.push(pd);
        }
        for (const [oid, arr] of grouped) {
          arr.sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
          const chosen = wantedType === "delivery" ? arr[arr.length - 1] : arr[0];
          if (chosen?.state) {
            stopsByOrder.set(oid, String(chosen.state).toUpperCase().trim());
          }
        }
      }

      const agg = new Map<string, StateAgg>();
      const validAbbrs = new Set(Object.values(STATE_ABBR));
      for (const o of orders as any[]) {
        const st = stopsByOrder.get(o.id);
        if (!st || !validAbbrs.has(st)) continue;
        const cur = agg.get(st) || { count: 0, freight: 0, loadedMiles: 0, dhMiles: 0 };
        cur.count += 1;
        cur.freight += Number(o.freight_amount) || 0;
        cur.loadedMiles += Number(o.loaded_miles) || 0;
        cur.dhMiles += Number(o.dh_miles) || 0;
        agg.set(st, cur);
      }

      if (agg.size === 0) return { ratings: {}, metrics: {} } as { ratings: Record<string, number>; metrics: Record<string, StateMetrics> };

      // Compute metrics per state
      type Metrics = { st: string; count: number; rpm: number; dhPerLoad: number; avgGross: number };
      const metrics: Metrics[] = [];
      for (const [st, a] of agg) {
        metrics.push({
          st,
          count: a.count,
          rpm: a.loadedMiles > 0 ? a.freight / a.loadedMiles : 0,
          dhPerLoad: a.count > 0 ? a.dhMiles / a.count : 0,
          avgGross: a.count > 0 ? a.freight / a.count : 0,
        });
      }

      const minMax = (vals: number[]) => {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        return { min, max };
      };
      const norm = (v: number, min: number, max: number, invert = false) => {
        if (max === min) return 0.5;
        const n = (v - min) / (max - min);
        return invert ? 1 - n : n;
      };

      const c = minMax(metrics.map((m) => m.count));
      const r = minMax(metrics.map((m) => m.rpm));
      const d = minMax(metrics.map((m) => m.dhPerLoad));
      const g = minMax(metrics.map((m) => m.avgGross));

      // Weights in order of importance: count(0.4), rpm(0.3), dh inverted(0.2), avgGross(0.1)
      const ratings: Record<string, number> = {};
      const scores = metrics.map((m) => {
        const score =
          0.4 * norm(m.count, c.min, c.max) +
          0.3 * norm(m.rpm, r.min, r.max) +
          0.2 * norm(m.dhPerLoad, d.min, d.max, true) +
          0.1 * norm(m.avgGross, g.min, g.max);
        return { st: m.st, score };
      });

      const sMin = Math.min(...scores.map((s) => s.score));
      const sMax = Math.max(...scores.map((s) => s.score));
      for (const s of scores) {
        const n = sMax === sMin ? 0.5 : (s.score - sMin) / (sMax - sMin);
        ratings[s.st] = Math.max(1, Math.min(10, Math.round(1 + n * 9)));
      }

      const metricsMap: Record<string, StateMetrics> = {};
      for (const m of metrics) {
        const a = agg.get(m.st)!;
        metricsMap[m.st] = {
          count: m.count,
          rpm: m.rpm,
          dhPerLoad: m.dhPerLoad,
          avgGross: m.avgGross,
          totalFreight: a.freight,
          totalLoadedMiles: a.loadedMiles,
          totalDhMiles: a.dhMiles,
          rating: ratings[m.st],
        };
      }
      return { ratings, metrics: metricsMap };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useCityRatings(direction: Direction, enabled: boolean) {
  return useQuery({
    queryKey: ["city-ratings", direction],
    enabled,
    queryFn: async () => {
      const now = new Date();
      const currentMon = chicagoMondayOf(now);
      const lastMon = new Date(currentMon);
      lastMon.setUTCDate(lastMon.getUTCDate() - 7);
      const fromIso = lastMon.toISOString();

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, freight_amount, loaded_miles, dh_miles")
        .eq("canceled", false)
        .gte("pickup_datetime", fromIso)
        .limit(5000);
      if (error) throw error;
      if (!orders || orders.length === 0) return { metrics: [] as CityMetrics[] };

      const orderIds = (orders as any[]).map((o) => o.id);
      const wantedType = direction === "inbound" ? "delivery" : "pickup";

      const stopByOrder = new Map<string, { city: string; state: string; lat: number | null; lng: number | null }>();
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: pds } = await supabase
          .from("pickup_drops")
          .select("order_id, city, state, type, sequence_number, latitude, longitude")
          .in("order_id", chunk)
          .eq("type", wantedType)
          .not("state", "is", null)
          .not("city", "is", null);
        if (!pds) continue;
        const grouped = new Map<string, any[]>();
        for (const pd of pds) {
          if (!grouped.has(pd.order_id)) grouped.set(pd.order_id, []);
          grouped.get(pd.order_id)!.push(pd);
        }
        for (const [oid, arr] of grouped) {
          arr.sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
          const chosen = wantedType === "delivery" ? arr[arr.length - 1] : arr[0];
          if (chosen?.city && chosen?.state) {
            stopByOrder.set(oid, {
              city: String(chosen.city).trim(),
              state: String(chosen.state).toUpperCase().trim(),
              lat: chosen.latitude != null ? Number(chosen.latitude) : null,
              lng: chosen.longitude != null ? Number(chosen.longitude) : null,
            });
          }
        }
      }

      const validAbbrs = new Set(Object.values(STATE_ABBR));
      const agg = new Map<string, CityAgg>();
      for (const o of orders as any[]) {
        const s = stopByOrder.get(o.id);
        if (!s) continue;
        if (!validAbbrs.has(s.state)) continue;
        const key = `${s.city.toUpperCase()}|${s.state}`;
        const cur = agg.get(key) || {
          city: s.city,
          state: s.state,
          count: 0,
          freight: 0,
          loadedMiles: 0,
          dhMiles: 0,
          latSum: 0,
          lngSum: 0,
          coordN: 0,
        };
        cur.count += 1;
        cur.freight += Number(o.freight_amount) || 0;
        cur.loadedMiles += Number(o.loaded_miles) || 0;
        cur.dhMiles += Number(o.dh_miles) || 0;
        if (s.lat != null && s.lng != null && !Number.isNaN(s.lat) && !Number.isNaN(s.lng)) {
          cur.latSum += s.lat;
          cur.lngSum += s.lng;
          cur.coordN += 1;
        }
        agg.set(key, cur);
      }

      // Look up coords from reference cities for any city missing them
      const needRef = [...agg.values()].filter((c) => c.coordN === 0 && c.count >= 10);
      if (needRef.length > 0) {
        const names = Array.from(new Set(needRef.map((c) => c.city)));
        const { data: refs } = await supabase
          .from("heatmap_reference_cities")
          .select("city_name, state, latitude, longitude")
          .in("city_name", names);
        if (refs) {
          const refMap = new Map<string, { lat: number; lng: number }>();
          for (const r of refs as any[]) {
            refMap.set(`${String(r.city_name).toUpperCase()}|${String(r.state).toUpperCase()}`, {
              lat: Number(r.latitude),
              lng: Number(r.longitude),
            });
          }
          for (const c of needRef) {
            const m = refMap.get(`${c.city.toUpperCase()}|${c.state}`);
            if (m) {
              c.latSum = m.lat;
              c.lngSum = m.lng;
              c.coordN = 1;
            }
          }
        }
      }

      // Filter: min 10 loads, must have coords
      const filtered = [...agg.values()].filter((c) => c.count >= 10 && c.coordN > 0);
      if (filtered.length === 0) return { metrics: [] as CityMetrics[] };

      type M = { key: string; count: number; rpm: number; dhPerLoad: number; avgGross: number };
      const ms: M[] = filtered.map((a) => ({
        key: `${a.city.toUpperCase()}|${a.state}`,
        count: a.count,
        rpm: a.loadedMiles > 0 ? a.freight / a.loadedMiles : 0,
        dhPerLoad: a.count > 0 ? a.dhMiles / a.count : 0,
        avgGross: a.count > 0 ? a.freight / a.count : 0,
      }));

      const minMax = (vals: number[]) => ({ min: Math.min(...vals), max: Math.max(...vals) });
      const norm = (v: number, mn: number, mx: number, invert = false) => {
        if (mx === mn) return 0.5;
        const n = (v - mn) / (mx - mn);
        return invert ? 1 - n : n;
      };
      const c = minMax(ms.map((m) => m.count));
      const r = minMax(ms.map((m) => m.rpm));
      const d = minMax(ms.map((m) => m.dhPerLoad));
      const g = minMax(ms.map((m) => m.avgGross));
      const eps = 0.01;
      const scores = ms.map((m) => {
        const nC = norm(m.count, c.min, c.max) + eps;
        const nR = norm(m.rpm, r.min, r.max) + eps;
        const nD = norm(m.dhPerLoad, d.min, d.max, true) + eps;
        const nG = norm(m.avgGross, g.min, g.max) + eps;
        const score = Math.pow(nC, 0.4) * Math.pow(nR, 0.3) * Math.pow(nD, 0.2) * Math.pow(nG, 0.1);
        return { key: m.key, score };
      });
      const sMin = Math.min(...scores.map((s) => s.score));
      const sMax = Math.max(...scores.map((s) => s.score));
      const ratingFor = new Map<string, number>();
      for (const s of scores) {
        const n = sMax === sMin ? 0.5 : (s.score - sMin) / (sMax - sMin);
        ratingFor.set(s.key, Math.max(1, Math.min(10, Math.round(1 + n * 9))));
      }

      const out: CityMetrics[] = filtered.map((a) => {
        const key = `${a.city.toUpperCase()}|${a.state}`;
        const m = ms.find((x) => x.key === key)!;
        return {
          city: a.city,
          state: a.state,
          lat: a.latSum / a.coordN,
          lng: a.lngSum / a.coordN,
          count: m.count,
          rpm: m.rpm,
          dhPerLoad: m.dhPerLoad,
          avgGross: m.avgGross,
          totalFreight: a.freight,
          totalLoadedMiles: a.loadedMiles,
          totalDhMiles: a.dhMiles,
          rating: ratingFor.get(key) || 1,
        };
      });
      // Sort larger first so smaller dots render on top
      out.sort((a, b) => b.count - a.count);
      return { metrics: out };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function BeverlyHeatmapUsMap() {
  const [direction, setDirection] = useState<Direction>("inbound");
  const [viewMode, setViewMode] = useState<ViewMode>("states");
  const { data } = useStateRatings(direction);
  const ratings = data?.ratings || {};
  const metrics = data?.metrics || {};
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const { data: cityData } = useCityRatings(direction, viewMode === "cities");
  const cityMetrics = cityData?.metrics || [];
  const [selectedCityKey, setSelectedCityKey] = useState<string | null>(null);
  const selectedCity = selectedCityKey ? cityMetrics.find((c) => `${c.city}|${c.state}` === selectedCityKey) || null : null;

  const fillForAbbr = (abbr: string): string => {
    const r = ratings[abbr];
    if (!r) return "hsl(var(--muted))";
    return interpolateColor(r);
  };

  const selectedMetrics = selectedState ? metrics[selectedState] : null;
  const fmtMoney = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const fmtNum = (v: number, digits = 0) => v.toLocaleString("en-US", { maximumFractionDigits: digits });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            US Map
          </CardTitle>
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as Direction)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="inbound">Inbound</ToggleGroupItem>
            <ToggleGroupItem value="outbound">Outbound</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full">
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            width={975}
            height={610}
            style={{ width: "100%", height: "auto" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies
                  .filter((geo) => !EXCLUDED_STATE_IDS.has(String(geo.id)))
                  .map((geo) => {
                    const abbr = STATE_ABBR[String(geo.id)] || "";
                    const centroid = geoCentroid(geo);
                    const fillColor = fillForAbbr(abbr);
                    const rating = ratings[abbr];
                    const hasRating = !!rating;
                    const labelFill = hasRating ? "#ffffff" : "hsl(var(--foreground))";
                    return (
                      <g key={geo.rsmKey}>
                        <Geography
                          geography={geo}
                          onClick={() => abbr && setSelectedState(abbr)}
                          style={{
                            default: {
                              fill: fillColor,
                              stroke: "hsl(var(--border))",
                              strokeWidth: 0.75,
                              outline: "none",
                              cursor: "pointer",
                            },
                            hover: {
                              fill: fillColor,
                              opacity: 0.85,
                              stroke: "hsl(var(--border))",
                              strokeWidth: 0.75,
                              outline: "none",
                              cursor: "pointer",
                            },
                            pressed: {
                              fill: fillColor,
                              outline: "none",
                            },
                          }}
                        />
                        {abbr && (
                          <text
                            x={0}
                            y={0}
                            transform={`translate(${centroid[0]}, ${centroid[1]})`}
                            textAnchor="middle"
                            onClick={() => setSelectedState(abbr)}
                            style={{
                              fontFamily: "inherit",
                              fontSize: 10,
                              fontWeight: 600,
                              fill: labelFill,
                              pointerEvents: "auto",
                              cursor: "pointer",
                            }}
                          >
                            {hasRating ? `${abbr} ${rating}` : abbr}
                          </text>
                        )}
                      </g>
                    );
                  })
              }
            </Geographies>
          </ComposableMap>
        </div>
      </CardContent>

      <Dialog open={!!selectedState} onOpenChange={(o) => !o && setSelectedState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedState} — {direction === "inbound" ? "Inbound" : "Outbound"}
            </DialogTitle>
          </DialogHeader>
          {selectedMetrics ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="text-2xl font-bold" style={{ color: interpolateColor(selectedMetrics.rating) }}>
                  {selectedMetrics.rating}/10
                </span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs text-muted-foreground mb-1">
                  Based on (in order of importance):
                </div>
                <div className="flex justify-between">
                  <span>1. Number of loads</span>
                  <span className="font-medium">{fmtNum(selectedMetrics.count)}</span>
                </div>
                <div className="flex justify-between">
                  <span>2. RPM (loaded)</span>
                  <span className="font-medium">${selectedMetrics.rpm.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>3. DH miles per load</span>
                  <span className="font-medium">{fmtNum(selectedMetrics.dhPerLoad, 1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>4. Avg gross per load</span>
                  <span className="font-medium">{fmtMoney(selectedMetrics.avgGross)}</span>
                </div>
              </div>
              <div className="border-t pt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total freight</span>
                  <span>{fmtMoney(selectedMetrics.totalFreight)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total loaded miles</span>
                  <span>{fmtNum(selectedMetrics.totalLoadedMiles)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total DH miles</span>
                  <span>{fmtNum(selectedMetrics.totalDhMiles)}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t">
                {direction === "inbound"
                  ? "Loads delivered to this state (pickup in last + current week)."
                  : "Loads picked up in this state (last + current week)."}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              No loads {direction === "inbound" ? "delivered to" : "picked up in"} {selectedState} in the last + current week.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
