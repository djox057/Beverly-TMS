import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import zip3Asset from "@/assets/us-zip3.json.asset.json";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const ZIP3_URL = zip3Asset.url;

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

const CITY_TERRAIN_COLORS: Record<number, string> = {
  1: "#8B6F2A",
  2: "#A78130",
  3: "#BD9837",
  4: "#D2B444",
  5: "#E3D65A",
  6: "#D1DC63",
  7: "#B8D86A",
  8: "#8DCD70",
  9: "#62BE76",
  10: "#39A96B",
};

const CITY_NO_DATA_FILL = "#E5E7EB";
const CITY_STATE_BASE_FILL = "#F3F4F6";
const CITY_STATE_BORDER = "#FFFFFF";
const CITY_ZIP_BORDER = "#F8FAFC";

function interpolateColor(rating: number): string {
  return RATING_COLORS[rating] || "#000000";
}

function interpolateCityTerrainColor(rating: number): string {
  return CITY_TERRAIN_COLORS[rating] || CITY_NO_DATA_FILL;
}

// Supabase REST API caps each response at ~1000 rows. Paginate to fetch all matching orders.
async function fetchAllOrdersInWindow(fromIso: string): Promise<any[]> {
  const pageSize = 1000;
  const all: any[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, freight_amount, loaded_miles, dh_miles")
      .eq("canceled", false)
      .gte("pickup_datetime", fromIso)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
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

      // Server-side aggregation via RPC (1 round trip)
      const { data: rows, error } = await supabase.rpc("get_us_map_state_stats", {
        p_direction: direction,
        p_from: fromIso,
      });
      if (error) throw error;
      const agg = new Map<string, StateAgg>();
      const validAbbrs = new Set(Object.values(STATE_ABBR));
      for (const row of (rows as any[]) || []) {
        const st = String(row.state).toUpperCase().trim();
        if (!validAbbrs.has(st)) continue;
        agg.set(st, {
          count: Number(row.count) || 0,
          freight: Number(row.freight) || 0,
          loadedMiles: Number(row.loaded_miles) || 0,
          dhMiles: Number(row.dh_miles) || 0,
        });
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
        // Use a small epsilon so a zero in one component doesn't fully zero the score,
        // but still pulls it down hard (weighted geometric mean / product).
        const eps = 0.01;
        const nC = Math.max(eps, norm(m.count, c.min, c.max));
        const nR = Math.max(eps, norm(m.rpm, r.min, r.max));
        const nD = Math.max(eps, norm(m.dhPerLoad, d.min, d.max, true));
        const nG = Math.max(eps, norm(m.avgGross, g.min, g.max));
        const score =
          Math.pow(nC, 0.4) *
          Math.pow(nR, 0.3) *
          Math.pow(nD, 0.2) *
          Math.pow(nG, 0.1);
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

      // Server-side aggregation via RPC (1 round trip)
      const { data: rows, error } = await supabase.rpc("get_us_map_city_stats", {
        p_direction: direction,
        p_from: fromIso,
        p_min_loads: 3,
      });
      if (error) throw error;
      const validAbbrs = new Set(Object.values(STATE_ABBR));
      const filtered = ((rows as any[]) || [])
        .filter((r) => validAbbrs.has(String(r.state).toUpperCase().trim()))
        .map((r) => ({
          city: String(r.city || "").trim(),
          state: String(r.state).toUpperCase().trim(),
          count: Number(r.count) || 0,
          freight: Number(r.freight) || 0,
          loadedMiles: Number(r.loaded_miles) || 0,
          dhMiles: Number(r.dh_miles) || 0,
          latSum: Number(r.latitude) || 0,
          lngSum: Number(r.longitude) || 0,
          coordN: 1,
        }));
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

  // Fetch the simplified ZIP3 polygon GeoJSON once and cache it.
  const { data: zip3Geo } = useQuery({
    queryKey: ["zip3-geojson"],
    enabled: viewMode === "cities",
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(ZIP3_URL);
      if (!res.ok) throw new Error("zip3 geojson fetch failed");
      return (await res.json()) as any;
    },
  });

  // Aggregate cities into the ZIP3 zone that contains their centroid.
  type ZoneAgg = {
    zip3: string;
    cities: CityMetrics[];
    count: number;
    freight: number;
    loadedMiles: number;
    dhMiles: number;
  };
  // Planar ray-casting point-in-polygon. Required because d3-geo's spherical
  // geoContains misclassifies clockwise-wound ZIP3 polygons (treats them as
  // the polygon's complement), so every point matches the first feature.
  const pointInRing = (pt: [number, number], ring: number[][]): boolean => {
    let inside = false;
    const [x, y] = pt;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  const featureContains = (feature: any, pt: [number, number]): boolean => {
    const geom = feature?.geometry;
    if (!geom) return false;
    const polys: number[][][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const poly of polys) {
      if (poly.length === 0) continue;
      if (!pointInRing(pt, poly[0])) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(pt, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  };
  const zoneByZip3: Record<string, ZoneAgg & { rating: number; rpm: number; dhPerLoad: number; avgGross: number }> = (() => {
    const out: Record<string, any> = {};
    if (!zip3Geo || cityMetrics.length === 0) return out;
    const features = (zip3Geo.features || []) as any[];
    // Build a lat-band index for faster point-in-polygon scans.
    // Precompute per-feature bbox once.
    const featBbox = (f: any): [number, number, number, number] => {
      if (f.__bbox) return f.__bbox;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const visit = (ring: number[][]) => {
        for (const [x, y] of ring) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      };
      const geom = f.geometry;
      if (geom?.type === "Polygon") for (const r of geom.coordinates) visit(r);
      else if (geom?.type === "MultiPolygon") for (const p of geom.coordinates) for (const r of p) visit(r);
      f.__bbox = [minX, minY, maxX, maxY];
      return f.__bbox;
    };
    const byZip: Record<string, ZoneAgg> = {};
    for (const c of cityMetrics) {
      const pt: [number, number] = [c.lng, c.lat];
      let hit: any = null;
      for (const f of features) {
        const bb = featBbox(f);
        if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) continue;
        if (featureContains(f, pt)) { hit = f; break; }
      }
      if (!hit) continue;
      const zip3 = String(hit.properties?.ZCTA3 || hit.properties?.zip3 || "");
      if (!zip3) continue;
      const z = (byZip[zip3] ||= { zip3, cities: [], count: 0, freight: 0, loadedMiles: 0, dhMiles: 0 });
      z.cities.push(c);
      z.count += c.count;
      z.freight += c.totalFreight;
      z.loadedMiles += c.totalLoadedMiles;
      z.dhMiles += c.totalDhMiles;
    }
    const zones = Object.values(byZip);
    if (zones.length === 0) return out;
    // Compute the same 4-metric weighted rating used elsewhere.
    const ms = zones.map((z) => ({
      zip3: z.zip3,
      count: z.count,
      rpm: z.loadedMiles > 0 ? z.freight / z.loadedMiles : 0,
      dhPerLoad: z.count > 0 ? z.dhMiles / z.count : 0,
      avgGross: z.count > 0 ? z.freight / z.count : 0,
    }));
    const mm = (vals: number[]) => ({ min: Math.min(...vals), max: Math.max(...vals) });
    const nrm = (v: number, mn: number, mx: number, inv = false) => {
      if (mx === mn) return 0.5;
      const n = (v - mn) / (mx - mn);
      return inv ? 1 - n : n;
    };
    const c = mm(ms.map((m) => m.count));
    const r = mm(ms.map((m) => m.rpm));
    const d = mm(ms.map((m) => m.dhPerLoad));
    const g = mm(ms.map((m) => m.avgGross));
    const eps = 0.01;
    const scored = ms.map((m) => {
      const nC = nrm(m.count, c.min, c.max) + eps;
      const nR = nrm(m.rpm, r.min, r.max) + eps;
      const nD = nrm(m.dhPerLoad, d.min, d.max, true) + eps;
      const nG = nrm(m.avgGross, g.min, g.max) + eps;
      return { zip3: m.zip3, score: Math.pow(nC, 0.4) * Math.pow(nR, 0.3) * Math.pow(nD, 0.2) * Math.pow(nG, 0.1), m };
    });
    const sMin = Math.min(...scored.map((s) => s.score));
    const sMax = Math.max(...scored.map((s) => s.score));
    for (const s of scored) {
      const n = sMax === sMin ? 0.5 : (s.score - sMin) / (sMax - sMin);
      const rating = Math.max(1, Math.min(10, Math.round(1 + n * 9)));
      const z = byZip[s.zip3];
      out[s.zip3] = { ...z, rating, rpm: s.m.rpm, dhPerLoad: s.m.dhPerLoad, avgGross: s.m.avgGross };
    }
    return out;
  })();

  const [selectedZip3, setSelectedZip3] = useState<string | null>(null);
  const selectedZone = selectedZip3 ? zoneByZip3[selectedZip3] : null;

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
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as ViewMode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="states">States</ToggleGroupItem>
              <ToggleGroupItem value="cities">Cities</ToggleGroupItem>
            </ToggleGroup>
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
                    const isCitiesView = viewMode === "cities";
                    const fillColor = isCitiesView ? CITY_STATE_BASE_FILL : fillForAbbr(abbr);
                    const rating = ratings[abbr];
                    const hasRating = !isCitiesView && !!rating;
                    const labelFill = hasRating ? "#ffffff" : "hsl(var(--muted-foreground))";
                    return (
                      <g key={geo.rsmKey}>
                        <Geography
                          geography={geo}
                          onClick={() => !isCitiesView && abbr && setSelectedState(abbr)}
                          style={{
                            default: {
                              fill: fillColor,
                              stroke: isCitiesView ? CITY_STATE_BORDER : "hsl(var(--border))",
                              strokeWidth: isCitiesView ? 0.5 : 0.75,
                              outline: "none",
                              cursor: isCitiesView ? "default" : "pointer",
                            },
                            hover: {
                              fill: fillColor,
                              opacity: isCitiesView ? 1 : 0.85,
                              stroke: isCitiesView ? CITY_STATE_BORDER : "hsl(var(--border))",
                              strokeWidth: isCitiesView ? 0.5 : 0.75,
                              outline: "none",
                              cursor: isCitiesView ? "default" : "pointer",
                            },
                            pressed: {
                              fill: fillColor,
                              outline: "none",
                            },
                          }}
                        />
                        {abbr && !isCitiesView && (
                          <text
                            x={0}
                            y={0}
                            transform={`translate(${centroid[0]}, ${centroid[1]})`}
                            textAnchor="middle"
                            onClick={() => !isCitiesView && setSelectedState(abbr)}
                            style={{
                              fontFamily: "inherit",
                              fontSize: 10,
                              fontWeight: 600,
                              fill: labelFill,
                              pointerEvents: isCitiesView ? "none" : "auto",
                              cursor: isCitiesView ? "default" : "pointer",
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
            {viewMode === "cities" && zip3Geo && (
              <Geographies geography={zip3Geo}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const zip3 = String(geo.properties?.ZCTA3 || geo.properties?.zip3 || "");
                    const zone = zoneByZip3[zip3];
                    const fill = zone ? interpolateColor(zone.rating) : "hsl(var(--muted))";
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => zone && setSelectedZip3(zip3)}
                        style={{
                          default: {
                            fill,
                            stroke: "hsl(var(--background))",
                            strokeWidth: 0.15,
                            outline: "none",
                            cursor: zone ? "pointer" : "default",
                          },
                          hover: {
                            fill,
                            opacity: zone ? 0.8 : 1,
                            stroke: "hsl(var(--background))",
                            strokeWidth: 0.15,
                            outline: "none",
                            cursor: zone ? "pointer" : "default",
                          },
                          pressed: { fill, outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            )}
            {viewMode === "cities" && (
              /* State borders overlay on top of zip3 choropleth, no fill */
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies
                    .filter((geo) => !EXCLUDED_STATE_IDS.has(String(geo.id)))
                    .map((geo) => {
                      const abbr = STATE_ABBR[String(geo.id)] || "";
                      const centroid = geoCentroid(geo);
                      return (
                        <g key={`overlay-${geo.rsmKey}`} style={{ pointerEvents: "none" }}>
                          <Geography
                            geography={geo}
                            style={{
                              default: { fill: "transparent", stroke: "hsl(var(--foreground))", strokeWidth: 0.7, outline: "none", pointerEvents: "none" },
                              hover: { fill: "transparent", stroke: "hsl(var(--foreground))", strokeWidth: 0.7, outline: "none", pointerEvents: "none" },
                              pressed: { fill: "transparent", outline: "none", pointerEvents: "none" },
                            }}
                          />
                          {abbr && (
                            <text
                              transform={`translate(${centroid[0]}, ${centroid[1]})`}
                              textAnchor="middle"
                              style={{
                                fontFamily: "inherit",
                                fontSize: 11,
                                fontWeight: 700,
                                fill: "hsl(var(--foreground))",
                                paintOrder: "stroke",
                                stroke: "hsl(var(--background))",
                                strokeWidth: 2,
                                strokeLinejoin: "round",
                                pointerEvents: "none",
                              }}
                            >
                              {abbr}
                            </text>
                          )}
                        </g>
                      );
                    })
                }
              </Geographies>
            )}
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

      <Dialog open={!!selectedCity} onOpenChange={(o) => !o && setSelectedCityKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedCity ? `${selectedCity.city}, ${selectedCity.state}` : ""} — {direction === "inbound" ? "Inbound" : "Outbound"}
            </DialogTitle>
          </DialogHeader>
          {selectedCity && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="text-2xl font-bold" style={{ color: interpolateColor(selectedCity.rating) }}>
                  {selectedCity.rating}/10
                </span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs text-muted-foreground mb-1">Based on (in order of importance):</div>
                <div className="flex justify-between"><span>1. Number of loads</span><span className="font-medium">{fmtNum(selectedCity.count)}</span></div>
                <div className="flex justify-between"><span>2. RPM (loaded)</span><span className="font-medium">${selectedCity.rpm.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>3. DH miles per load</span><span className="font-medium">{fmtNum(selectedCity.dhPerLoad, 1)}</span></div>
                <div className="flex justify-between"><span>4. Avg gross per load</span><span className="font-medium">{fmtMoney(selectedCity.avgGross)}</span></div>
              </div>
              <div className="border-t pt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Total freight</span><span>{fmtMoney(selectedCity.totalFreight)}</span></div>
                <div className="flex justify-between"><span>Total loaded miles</span><span>{fmtNum(selectedCity.totalLoadedMiles)}</span></div>
                <div className="flex justify-between"><span>Total DH miles</span><span>{fmtNum(selectedCity.totalDhMiles)}</span></div>
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t">
                {direction === "inbound"
                  ? "Loads delivered to this city (pickup in last + current week). Min 10 loads to be rated."
                  : "Loads picked up in this city (last + current week). Min 10 loads to be rated."}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedZone} onOpenChange={(o) => !o && setSelectedZip3(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              ZIP {selectedZip3} — {direction === "inbound" ? "Inbound" : "Outbound"}
            </DialogTitle>
          </DialogHeader>
          {selectedZone && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="text-2xl font-bold" style={{ color: interpolateColor(selectedZone.rating) }}>
                  {selectedZone.rating}/10
                </span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs text-muted-foreground mb-1">Based on (in order of importance):</div>
                <div className="flex justify-between"><span>1. Number of loads</span><span className="font-medium">{fmtNum(selectedZone.count)}</span></div>
                <div className="flex justify-between"><span>2. RPM (loaded)</span><span className="font-medium">${selectedZone.rpm.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>3. DH miles per load</span><span className="font-medium">{fmtNum(selectedZone.dhPerLoad, 1)}</span></div>
                <div className="flex justify-between"><span>4. Avg gross per load</span><span className="font-medium">{fmtMoney(selectedZone.avgGross)}</span></div>
              </div>
              <div className="border-t pt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Total freight</span><span>{fmtMoney(selectedZone.freight)}</span></div>
                <div className="flex justify-between"><span>Total loaded miles</span><span>{fmtNum(selectedZone.loadedMiles)}</span></div>
                <div className="flex justify-between"><span>Total DH miles</span><span>{fmtNum(selectedZone.dhMiles)}</span></div>
              </div>
              {selectedZone.cities.length > 0 && (
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground mb-2">Cities in this zone ({selectedZone.cities.length}):</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedZone.cities
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((c) => (
                        <button
                          key={`${c.city}|${c.state}`}
                          className="w-full flex justify-between text-left hover:bg-muted px-2 py-1 rounded"
                          onClick={() => { setSelectedZip3(null); setSelectedCityKey(`${c.city}|${c.state}`); }}
                        >
                          <span>{c.city}, {c.state}</span>
                          <span className="text-muted-foreground">{fmtNum(c.count)} loads</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
