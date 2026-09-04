import { supabase } from "@/integrations/supabase/client";

/**
 * Fuel level / miles away / ETA are written every few minutes by background
 * jobs. They live in `truck_telemetry` (which is NOT part of the realtime
 * publication) instead of `trucks`, so those machine writes no longer
 * broadcast a change for every truck to every connected client.
 *
 * Readers that display these values merge them back onto the truck rows.
 */
export interface TruckTelemetryRow {
  truck_id: string;
  fuel_level: number | null;
  miles_away: number | null;
  eta_minutes: number | null;
  miles_away_updated_at: string | null;
}

const CHUNK = 500;

export const fetchTruckTelemetry = async (
  truckIds?: string[]
): Promise<Map<string, TruckTelemetryRow>> => {
  const map = new Map<string, TruckTelemetryRow>();
  const select = "truck_id, fuel_level, miles_away, eta_minutes, miles_away_updated_at";

  const collect = (rows: any[] | null) => {
    for (const r of rows || []) map.set(r.truck_id, r as TruckTelemetryRow);
  };

  if (!truckIds) {
    const { data, error } = await supabase.from("truck_telemetry").select(select);
    if (error) {
      console.error("[truckTelemetry] fetch error", error);
      return map;
    }
    collect(data);
    return map;
  }

  const ids = [...new Set(truckIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("truck_telemetry")
      .select(select)
      .in("truck_id", ids.slice(i, i + CHUNK));
    if (error) {
      console.error("[truckTelemetry] fetch error", error);
      continue;
    }
    collect(data);
  }
  return map;
};

/** Returns the same truck rows with fresh telemetry values merged in. */
export const mergeTruckTelemetry = async <T extends { id: string }>(
  trucks: T[] | null | undefined
): Promise<T[]> => {
  const list = trucks || [];
  if (list.length === 0) return list as T[];
  const telemetry = await fetchTruckTelemetry(list.map((t) => t.id));
  if (telemetry.size === 0) return list as T[];
  return list.map((t) => {
    const tel = telemetry.get(t.id);
    if (!tel) return t;
    return {
      ...t,
      fuel_level: tel.fuel_level,
      miles_away: tel.miles_away,
      eta_minutes: tel.eta_minutes,
      miles_away_updated_at: tel.miles_away_updated_at,
    };
  });
};

/** Manual (dispatcher) miles-away override. */
export const setTruckMilesAway = async (truckId: string, milesAway: number) => {
  const { error } = await supabase.from("truck_telemetry").upsert(
    {
      truck_id: truckId,
      miles_away: milesAway,
      miles_away_updated_at: new Date().toISOString(),
    },
    { onConflict: "truck_id" }
  );
  if (error) throw error;
};
