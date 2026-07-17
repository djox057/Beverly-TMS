import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMatchedOrders } from "@/hooks/useLoadSuggestions";
import { supabase } from "@/integrations/supabase/client";
import { calculateLoadedMiles, geocodeAddress } from "@/utils/mapboxRouteCalculator";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckId: string | null;
  truckNumber?: string | null;
  driverName?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtPickupRange = (start: string | null, end: string | null) => {
  const s = fmtTime(start);
  const e = fmtTime(end);
  if (!s && !e) return "—";
  if (!s || !e) return s || e || "—";
  if (s === e) return s;
  return `${s}-${e}`;
};

const fmtMoney = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtScore = (n: number | null) => (n == null ? "—" : n.toFixed(3));

const fmtMiles = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(1);

const fmtRatePerMile = (rate: number | null, miles: number | null) => {
  if (rate == null || miles == null || miles <= 0) return "—";
  return `$${(rate / miles).toFixed(2)}`;
};

const laneKey = (o: string, os: string, d: string, ds: string) =>
  `${(o || "").trim()}|${(os || "").trim()}|${(d || "").trim()}|${(ds || "").trim()}`.toUpperCase();

export const LoadSuggestionsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  truckId,
  truckNumber,
  driverName,
}) => {
  const { data, isLoading, isFetching, error } = useMatchedOrders(truckId, open && !!truckId);
  // Map of laneKey → loaded miles (null = failed, undefined = still loading)
  const [loadedMilesMap, setLoadedMilesMap] = useState<Record<string, number | null>>({});
  // Map of laneKey → expected average freight for the lane (null = failed, undefined = still loading)
  const [expectedMap, setExpectedMap] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!open || !data || data.length === 0) return;
    // Collect unique lanes we haven't computed yet.
    const seen = new Set<string>();
    const lanes: { key: string; pickup: string; delivery: string }[] = [];
    for (const m of data) {
      const key = laneKey(m.origin_city, m.origin_state, m.dest_city, m.dest_state);
      if (seen.has(key)) continue;
      seen.add(key);
      if (key in loadedMilesMap) continue;
      if (!m.origin_city || !m.origin_state || !m.dest_city || !m.dest_state) continue;
      lanes.push({
        key,
        pickup: `${m.origin_city}, ${m.origin_state}`,
        delivery: `${m.dest_city}, ${m.dest_state}`,
      });
    }
    if (lanes.length === 0) return;
    let cancelled = false;
    (async () => {
      // Fire lanes in parallel; each has its own internal timeout.
      const results = await Promise.all(
        lanes.map(async (l) => {
          const miles = await calculateLoadedMiles(l.pickup, l.delivery);
          return { key: l.key, miles: miles && miles > 0 ? miles : null };
        }),
      );
      if (cancelled) return;
      setLoadedMilesMap((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.key] = r.miles;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  useEffect(() => {
    if (!open || !data || data.length === 0) return;
    const seen = new Set<string>();
    const lanes: { key: string; pickup: string; delivery: string }[] = [];
    for (const m of data) {
      const key = laneKey(m.origin_city, m.origin_state, m.dest_city, m.dest_state);
      if (seen.has(key)) continue;
      seen.add(key);
      if (key in expectedMap) continue;
      if (!m.origin_city || !m.origin_state || !m.dest_city || !m.dest_state) continue;
      lanes.push({
        key,
        pickup: `${m.origin_city}, ${m.origin_state}`,
        delivery: `${m.dest_city}, ${m.dest_state}`,
      });
    }
    if (lanes.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        lanes.map(async (l) => {
          try {
            const [pickupCoords, deliveryCoords] = await Promise.all([
              geocodeAddress(l.pickup),
              geocodeAddress(l.delivery),
            ]);
            if (!pickupCoords || !deliveryCoords) return { key: l.key, expected: null };
            const { data: laneData, error: laneErr } = await supabase.functions.invoke("lane-search", {
              body: {
                pickup: { lat: pickupCoords.lat, lng: pickupCoords.lon },
                delivery: { lat: deliveryCoords.lat, lng: deliveryCoords.lon },
                pickupRadius: 60,
                deliveryRadius: 60,
              },
            });
            if (laneErr || !laneData || typeof laneData !== "object") return { key: l.key, expected: null };
            const avgFreight = (laneData as any).overall?.avgFreight;
            return { key: l.key, expected: avgFreight && avgFreight > 0 ? avgFreight : null };
          } catch {
            return { key: l.key, expected: null };
          }
        }),
      );
      if (cancelled) return;
      setExpectedMap((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.key] = r.expected;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl p-0"
        // Prevent clicks inside the dialog from bubbling through the React tree
        // to the underlying cell's onClick (which would open the Home Time dialog).
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            Suggested loads
            {isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </DialogTitle>
          <DialogDescription>
            {truckNumber ? `Truck ${truckNumber}` : ""}
            {driverName ? ` · ${driverName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto text-sm">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading matches…
            </div>
          ) : error ? (
            <div className="p-6 flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Couldn't reach LoadMatch</div>
                <div className="text-xs">{(error as Error).message}</div>
              </div>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-muted-foreground">No matching loads.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Load number</th>
                  <th className="text-left px-3 py-2">origin</th>
                  <th className="text-left px-3 py-2">destination</th>
                  <th className="text-right px-3 py-2">rate</th>
                  <th className="text-right px-3 py-2">loaded_miles</th>
                  <th className="text-right px-3 py-2">RPM</th>
                  <th className="text-right px-3 py-2">deadhead_miles</th>
                  <th className="text-right px-3 py-2">score</th>
                  <th className="text-left px-3 py-2">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => {
                  const key = laneKey(m.origin_city, m.origin_state, m.dest_city, m.dest_state);
                  const loadedMiles = loadedMilesMap[key];
                  const totalMiles =
                    loadedMiles == null || m.deadhead_miles == null
                      ? null
                      : loadedMiles + m.deadhead_miles;
                  return (
                  <tr key={`${m.source_load_id}-${m.count}`} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {m.source_load_id}
                      {m.count > 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">x{m.count}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {m.origin_city}, {m.origin_state}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {m.dest_city}, {m.dest_state}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtMoney(m.rate)}</td>
                    <td className="px-3 py-2 text-right">
                      {loadedMiles === undefined ? (
                        <Loader2 className="h-3 w-3 animate-spin inline text-muted-foreground" />
                      ) : (
                        fmtMiles(loadedMiles)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {loadedMiles === undefined ? (
                        <Loader2 className="h-3 w-3 animate-spin inline text-muted-foreground" />
                      ) : (
                        fmtRatePerMile(m.rate, totalMiles)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.deadhead_miles == null ? "—" : m.deadhead_miles.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtScore(m.score)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtPickupRange(m.pickup_start, m.pickup_end)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoadSuggestionsDialog;