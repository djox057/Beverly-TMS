import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Bracket table: [minMiles, maxMiles, minRpm, maxRpm]
const BRACKETS: Array<[number, number, number, number]> = [
  [1500, 1599, 3.50, 3.60],
  [1600, 1699, 3.40, 3.49],
  [1700, 1799, 3.30, 3.39],
  [1800, 1899, 3.20, 3.29],
  [1900, 1999, 3.10, 3.19],
  [2000, 2099, 3.00, 3.09],
  [2100, 2199, 2.95, 2.99],
  [2200, 2299, 2.90, 2.94],
  [2300, 2399, 2.85, 2.89],
  [2400, 2499, 2.80, 2.84],
  [2500, 2599, 2.75, 2.79],
  [2600, 2699, 2.70, 2.74],
  [2700, 2799, 2.65, 2.69],
  [2800, 2899, 2.60, 2.64],
  [2900, 2999, 2.55, 2.59],
  [3000, 3099, 2.50, 2.54],
  [3100, 3199, 2.45, 2.49],
  [3200, 3299, 2.40, 2.44],
  [3300, 3399, 2.35, 2.39],
  [3400, 3499, 2.30, 2.34],
  [3500, 3600, 2.25, 2.29],
];

const DAY_WEIGHTS: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 }; // Mon..Fri (Chicago)

function chicagoParts(iso: string): { y: number; m: number; d: number; dow: number } {
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(dt);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: parseInt(get("year"), 10),
    m: parseInt(get("month"), 10),
    d: parseInt(get("day"), 10),
    dow: dowMap[get("weekday")] ?? 1,
  };
}

// Week key = ISO date of Monday (Chicago) for the pickup date
function mondayKey(iso: string): string {
  const p = chicagoParts(iso);
  // Compute Monday by subtracting (dow-1) days from the pickup date
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d));
  base.setUTCDate(base.getUTCDate() - (p.dow - 1));
  return base.toISOString().slice(0, 10);
}

function bracketFor(miles: number) {
  const clamped = Math.max(1500, Math.min(3600, miles));
  for (const [lo, hi, minR, maxR] of BRACKETS) {
    if (clamped >= lo && clamped <= hi) {
      const midpoint = (minR + maxR) / 2;
      return { minMiles: lo, maxMiles: hi, minRpm: minR, maxRpm: maxR, midpoint };
    }
  }
  const [lo, hi, minR, maxR] = BRACKETS[BRACKETS.length - 1];
  return { minMiles: lo, maxMiles: hi, minRpm: minR, maxRpm: maxR, midpoint: (minR + maxR) / 2 };
}

function roundTo50(n: number) {
  return Math.round(n / 50) * 50;
}

export interface PromoRateSuggestion {
  suggestedRate: number;
  requiredRpm: number;
  bracket: ReturnType<typeof bracketFor>;
  projectedMiles: number;
  milesBookedSoFar: number;
  paidSoFar: number;
  method: string;
  confidence: "normal" | "low";
  warning?: string;
}

export function usePromoRateSuggestion(
  driverId: string | null,
  pickupIso: string | null,
  loadMiles: number
) {
  return useQuery({
    queryKey: ["promo-rate", driverId, pickupIso ? mondayKey(pickupIso) : null, loadMiles],
    enabled: !!driverId && !!pickupIso && loadMiles > 0,
    queryFn: async (): Promise<PromoRateSuggestion | null> => {
      if (!driverId || !pickupIso) return null;

      const targetMonday = mondayKey(pickupIso);
      // Window: 6 weeks back through end of target week
      const windowStart = new Date(targetMonday);
      windowStart.setUTCDate(windowStart.getUTCDate() - 42);
      const windowEnd = new Date(targetMonday);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, pickup_datetime, dh_miles, loaded_miles, driver_price")
        .or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
        .eq("canceled", false)
        .gte("pickup_datetime", windowStart.toISOString())
        .lt("pickup_datetime", windowEnd.toISOString());

      if (error) throw error;

      // Group orders by Monday key, keep only Mon-Fri (dow 1..5)
      const byWeek = new Map<
        string,
        Array<{ dow: number; miles: number; paid: number }>
      >();
      for (const o of orders ?? []) {
        if (!o.pickup_datetime) continue;
        const p = chicagoParts(o.pickup_datetime);
        if (p.dow > 5) continue;
        const key = mondayKey(o.pickup_datetime);
        const miles = (Number(o.dh_miles) || 0) + (Number(o.loaded_miles) || 0);
        const paid = Number(o.driver_price) || 0;
        if (!byWeek.has(key)) byWeek.set(key, []);
        byWeek.get(key)!.push({ dow: p.dow, miles, paid });
      }

      // Baseline: previous week if "full" (a booking on every Mon-Fri), else avg of last 4 full weeks
      const priorKeys = [...byWeek.keys()].filter((k) => k < targetMonday).sort();
      const isFull = (rows: Array<{ dow: number }>) => {
        const s = new Set(rows.map((r) => r.dow));
        return [1, 2, 3, 4, 5].every((d) => s.has(d));
      };
      const totalMiles = (rows: Array<{ miles: number }>) =>
        rows.reduce((s, r) => s + r.miles, 0);

      let baseline: number | null = null;
      const prevKey = priorKeys[priorKeys.length - 1];
      if (prevKey && isFull(byWeek.get(prevKey)!)) {
        baseline = totalMiles(byWeek.get(prevKey)!);
      } else {
        const fullPriors = priorKeys
          .map((k) => byWeek.get(k)!)
          .filter(isFull)
          .slice(-4);
        if (fullPriors.length > 0) {
          baseline =
            fullPriors.reduce((s, r) => s + totalMiles(r), 0) / fullPriors.length;
        }
      }

      // Current week bookings so far (excluding today's new load - we don't have it yet)
      const currentWeekRows = byWeek.get(targetMonday) ?? [];
      const milesBooked = totalMiles(currentWeekRows);
      const paidSoFar = currentWeekRows.reduce((s, r) => s + r.paid, 0);
      const weightElapsed = currentWeekRows.reduce(
        (s, r) => s + (DAY_WEIGHTS[r.dow] ?? 0),
        0
      );

      // Determine target day-of-week
      const pickupDow = chicagoParts(pickupIso).dow;
      // Include this new load's weight in projection
      const projWeightElapsed = weightElapsed + (DAY_WEIGHTS[pickupDow] ?? 0);
      const projMilesBooked = milesBooked + loadMiles;

      let pace = 0;
      if (projWeightElapsed > 0) {
        pace = (projMilesBooked / projWeightElapsed) * 6;
      }

      let baselineWeight = 0.7;
      let paceWeight = 0.3;
      let method = "monday_blend_70_30";
      if (pickupDow === 2) {
        baselineWeight = 0.5;
        paceWeight = 0.5;
        method = "tuesday_blend_50_50";
      } else if (pickupDow === 3) {
        baselineWeight = 0.3;
        paceWeight = 0.7;
        method = "wednesday_blend_30_70";
      } else if (pickupDow === 4) {
        baselineWeight = 0;
        paceWeight = 1;
        method = "thursday_pace_only";
      } else if (pickupDow === 5) {
        // Friday: use actual = Mon-Thu booked + Friday actual (this load's miles)
        baselineWeight = 0;
        paceWeight = 0;
        method = "friday_actual";
      }

      let projection: number;
      if (pickupDow === 5) {
        projection = milesBooked + loadMiles;
      } else if (baseline == null) {
        projection = pace;
        method += "_no_baseline";
      } else {
        projection = baseline * baselineWeight + pace * paceWeight;
      }

      let warning: string | undefined;
      if (projection > 3600) warning = "Projection above 3,600 mi — top bracket in use.";
      if (projection < 1500) warning = "Projection below 1,500 mi — under promo minimum.";

      const bracket = bracketFor(projection);
      const targetRevenue = Math.min(Math.max(projection, 1500), 3600) * bracket.midpoint;
      const remainingMiles = Math.max(1, Math.min(Math.max(projection, 1500), 3600) - milesBooked);
      const requiredRpmOverall = (targetRevenue - paidSoFar) / remainingMiles;

      // Clamp per-load RPM
      let requiredRpm = requiredRpmOverall;
      if (requiredRpm < 2.0 || requiredRpm > 4.0) {
        warning = `Target requires ${requiredRpm.toFixed(2)} RPM — outside [2.00, 4.00]. Confirm manually.`;
        requiredRpm = Math.max(2.0, Math.min(4.0, requiredRpm));
      }

      const suggestedRate = roundTo50(loadMiles * requiredRpm);

      return {
        suggestedRate,
        requiredRpm,
        bracket,
        projectedMiles: Math.round(projection),
        milesBookedSoFar: milesBooked,
        paidSoFar,
        method,
        confidence: baseline == null ? "low" : "normal",
        warning,
      };
    },
    staleTime: 60_000,
  });
}
