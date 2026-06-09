import { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin } from "lucide-react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import statesGeo from "@/assets/us-states-10m.json";

// Bundled locally to avoid a CDN round trip on first render.
const GEO_DATA = statesGeo as any;

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

function fromIsoForWindow(): string {
      const now = new Date();
      const currentMon = chicagoMondayOf(now);
      const lastMon = new Date(currentMon);
      lastMon.setUTCDate(lastMon.getUTCDate() - 7);
      return lastMon.toISOString();
}

async function fetchStateRatings(direction: Direction) {
      const fromIso = fromIsoForWindow();
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
}

function useStateRatings(direction: Direction) {
  return useQuery({
    queryKey: ["state-ratings", direction],
    queryFn: () => fetchStateRatings(direction),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}


export default function BeverlyHeatmapUsMap() {
  const [direction, setDirection] = useState<Direction>("inbound");
  const queryClient = useQueryClient();
  const { data } = useStateRatings(direction);

  // Prefetch the opposite direction in the background so toggling is instant.
  useEffect(() => {
    const other: Direction = direction === "inbound" ? "outbound" : "inbound";
    queryClient.prefetchQuery({
      queryKey: ["state-ratings", other],
      queryFn: () => fetchStateRatings(other),
      staleTime: 10 * 60 * 1000,
    });
  }, [direction, queryClient]);

  const ratings = data?.ratings || {};
  const metrics = data?.metrics || {};
  const [selectedState, setSelectedState] = useState<string | null>(null);

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
            <Geographies geography={GEO_DATA}>
              {({ geographies }) =>
                geographies
                  .filter((geo) => !EXCLUDED_STATE_IDS.has(String(geo.id)))
                  .map((geo) => {
                    const abbr = STATE_ABBR[String(geo.id)] || "";
                    const centroid = geoCentroid(geo);
                    const fillColor = fillForAbbr(abbr);
                    const rating = ratings[abbr];
                    const hasRating = !!rating;
                    const labelFill = hasRating ? "#ffffff" : "hsl(var(--muted-foreground))";
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
