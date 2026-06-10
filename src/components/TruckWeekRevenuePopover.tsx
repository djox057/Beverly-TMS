import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  orders: any[] | undefined;
  referenceDate?: Date;
  driverId?: string | null;
  driver2Id?: string | null;
}

function getChicagoNow(): Date {
  const now = new Date();
  const chicagoStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return new Date(chicagoStr.replace(/\//g, "-"));
}

/**
 * Returns [start, end) UTC timestamps for the Chicago Mon 00:00 -> next Mon 00:00 week
 * containing the provided reference date (defaults to now).
 */
function getChicagoWeekRange(reference?: Date): { start: number; end: number } {
  const now = reference ?? new Date();
  // Get Chicago Y/M/D and weekday parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const wd = get("weekday"); // Sun, Mon, ...
  const wdIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  // Days since Monday (Mon=0)
  const daysSinceMon = (wdIndex + 6) % 7;

  // Chicago Monday at 00:00 expressed as a Date. Chicago is UTC-5 (CDT) or UTC-6 (CST).
  // We approximate by finding the UTC instant matching Chicago Mon 00:00 via offset probing.
  // Easier: build a UTC date for that calendar day, then adjust by Chicago offset for that day.
  const monUtcGuess = Date.UTC(y, m - 1, d - daysSinceMon, 0, 0, 0);
  // Determine Chicago offset (minutes) at monUtcGuess
  const offsetMin = chicagoOffsetMinutes(new Date(monUtcGuess));
  const start = monUtcGuess + offsetMin * 60 * 1000;
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return { start, end };
}

function chicagoOffsetMinutes(date: Date): number {
  // Returns the offset (in minutes) you add to a UTC time to get Chicago wall time.
  // For CST (UTC-6) -> -360, CDT (UTC-5) -> -300. Sign convention: chicagoWall = utc + offset.
  // We want the reverse: utc = chicagoWall - offset, so we negate when applying.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  // asUtc - date.getTime() = offset of Chicago vs UTC in ms (negative for west of UTC)
  const diffMin = (asUtc - date.getTime()) / 60000;
  // We want: chicagoWall + (-diffMin) -> utc, i.e. utc = wallEpoch - diffMin*60s. Return -diffMin.
  return -diffMin;
}

function getOrderPickupDate(order: any): string | null {
  return (
    order?.pickupStops?.[0]?.datetime ||
    order?.pickup_datetime ||
    order?.pickupDatetime ||
    null
  );
}

function getOrderLastDeliveryDate(order: any): string | null {
  const stops = order?.deliveryStops;
  if (Array.isArray(stops) && stops.length > 0) {
    const last = stops[stops.length - 1];
    if (last?.datetime) return last.datetime;
  }
  return order?.delivery_datetime || order?.deliveryDatetime || null;
}

export const TruckWeekRevenuePopover = ({ orders, referenceDate, driverId, driver2Id }: Props) => {
  const refTime = referenceDate ? referenceDate.getTime() : undefined;
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (!open) setWeekOffset(0);
  }, [open]);

  const { start: weekStart, end: weekEnd } = useMemo(
    () => {
      const base = refTime !== undefined ? new Date(refTime) : new Date();
      const shifted = new Date(base.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
      return getChicagoWeekRange(shifted);
    },
    [refTime, weekOffset],
  );

  // When popover opens, fetch the full Mon-Sun week directly for this truck's driver(s).
  // This guarantees correctness even when the lazy-loaded cache only covers the visible
  // 7-day carousel window (which can omit days at the start of the Chicago week).
  useEffect(() => {
    if (!open) return;
    const ids = [driverId, driver2Id].filter((x): x is string => !!x);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startIso = new Date(weekStart).toISOString();
      const endIso = new Date(weekEnd).toISOString();
      const idList = ids.join(",");
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, canceled, driver1_id, driver2_id, pickup_datetime, delivery_datetime, freight_amount, driver_price, loaded_miles, mileage, detention, detention_driver, layover, layover_driver, tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, late_fee, late_fee_driver, no_tracking_fee, no_tracking_fee_driver, wrong_address_fee, wrong_address_fee_driver, escort_fee, other_charges, other_charges_driver, other_additionals_driver",
        )
        .eq("canceled", false)
        .or(`driver1_id.in.(${idList}),driver2_id.in.(${idList})`)
        .gte("pickup_datetime", startIso)
        .lt("pickup_datetime", endIso)
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error("[TruckWeekRevenuePopover] fetch error", error);
        setFetched([]);
      } else {
        setFetched(data || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, driverId, driver2Id, weekStart, weekEnd]);

  const stats = useMemo(() => {
    const start = weekStart;
    const end = weekEnd;
    const source = fetched ?? orders ?? [];
    const inWeek = source.filter((o) => {
      if (!o || o.canceled) return false;
      const raw = getOrderPickupDate(o);
      if (!raw) return false;
      const t = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw).getTime();
      if (!Number.isFinite(t)) return false;
      return t >= start && t < end;
    });
    const num = (v: any) => Number(v) || 0;
    const freight = inWeek.reduce(
      (a, o) =>
        a +
        num(o.freight_amount ?? o.freightAmount) +
        num(o.detention) +
        num(o.layover) +
        num(o.tonu) +
        num(o.extra_stop) +
        num(o.lumper) -
        num(o.late_fee) -
        num(o.no_tracking_fee) -
        num(o.wrong_address_fee) +
        num(o.escort_fee) -
        num(o.other_charges),
      0,
    );
    const pay = inWeek.reduce(
      (a, o) =>
        a +
        num(o.driver_price ?? o.driverPrice) +
        num(o.detention_driver) +
        num(o.layover_driver) +
        num(o.tonu_driver) +
        num(o.extra_stop_driver) +
        num(o.lumper_driver) -
        num(o.late_fee_driver) -
        num(o.no_tracking_fee_driver) -
        num(o.wrong_address_fee_driver) -
        num(o.other_charges_driver) +
        num(o.other_additionals_driver),
      0,
    );
    const miles = inWeek.reduce(
      (a, o) => a + (num(o.loaded_miles ?? o.loadedMiles) || num(o.mileage)),
      0,
    );
    const comm = freight - pay;
    // Find latest delivery date among the orders picked up this week
    let latestDelivery = -Infinity;
    for (const o of inWeek) {
      const raw = getOrderLastDeliveryDate(o);
      if (!raw) continue;
      const t = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw).getTime();
      if (Number.isFinite(t) && t > latestDelivery) latestDelivery = t;
    }
    let days = 0;
    if (Number.isFinite(latestDelivery)) {
      // Chicago weekday of latest delivery date (Mon=1 ... Sun=7)
      const wd = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
      }).format(new Date(latestDelivery));
      const wdIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
      const isoWd = wdIdx === 0 ? 7 : wdIdx; // Mon=1..Sun=7
      days = Math.max(1, isoWd - 1);
    }
    return {
      count: inWeek.length,
      freight,
      pay,
      miles,
      comm,
      freightRpm: miles > 0 ? freight / miles : 0,
      payRpm: miles > 0 ? pay / miles : 0,
      commPct: freight > 0 ? (comm / freight) * 100 : 0,
      days,
    };
  }, [orders, fetched, weekStart, weekEnd]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="This week's revenue"
          className="flex items-center justify-center w-[18px] h-[31px] text-[13px] font-bold text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 leading-none"
        >
          $
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto min-w-[220px] p-3 text-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v - 1)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <div className="flex-1 text-center text-[11px] font-medium text-muted-foreground">
            {weekOffset === 0 ? "This week" : weekOffset < 0 ? `${-weekOffset}w ago` : `+${weekOffset}w`} · {stats.count} order{stats.count === 1 ? "" : "s"}{loading ? " · loading…" : ""}
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v + 1)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Freight:</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(stats.freight)}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({stats.freightRpm > 0 ? `$${stats.freightRpm.toFixed(2)}/mi` : "—"})
              </span>
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Stop Amt:</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {formatCurrency(stats.pay)}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({stats.payRpm > 0 ? `$${stats.payRpm.toFixed(2)}/mi` : "—"})
              </span>
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Miles:</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {Math.round(stats.miles).toLocaleString()}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({stats.miles > 0 && stats.days > 0 ? Math.round(stats.miles / stats.days).toLocaleString() : "—"})
              </span>
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Comm:</span>
            <span className="font-semibold text-pink-600 dark:text-pink-400">
              {formatCurrency(stats.comm)}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({stats.freight > 0 ? `${stats.commPct.toFixed(1)}%` : "—"})
              </span>
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};