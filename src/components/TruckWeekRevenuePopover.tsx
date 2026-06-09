import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";

interface Props {
  orders: any[] | undefined;
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
 * Returns [start, end) UTC timestamps for the current Chicago week (Mon 00:00 -> next Mon 00:00).
 */
function getChicagoWeekRange(): { start: number; end: number } {
  const now = new Date();
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

export const TruckWeekRevenuePopover = ({ orders }: Props) => {
  const stats = useMemo(() => {
    const { start, end } = getChicagoWeekRange();
    const inWeek = (orders ?? []).filter((o) => {
      if (!o || o.canceled) return false;
      const raw = getOrderPickupDate(o);
      if (!raw) return false;
      const t = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw).getTime();
      if (!Number.isFinite(t)) return false;
      return t >= start && t < end;
    });
    const num = (v: any) => Number(v) || 0;
    const freight = inWeek.reduce(
      (a, o) => a + num(o.freight_amount ?? o.freightAmount),
      0,
    );
    const pay = inWeek.reduce(
      (a, o) => a + num(o.driver_price ?? o.driverPrice),
      0,
    );
    const miles = inWeek.reduce(
      (a, o) => a + (num(o.loaded_miles ?? o.loadedMiles) || num(o.mileage)),
      0,
    );
    const comm = freight - pay;
    const chicagoNow = getChicagoNow();
    const isoDay = chicagoNow.getDay() === 0 ? 7 : chicagoNow.getDay(); // Mon=1 ... Sun=7
    const daysPlusOne = isoDay + 1;
    return {
      count: inWeek.length,
      freight,
      pay,
      miles,
      comm,
      freightRpm: miles > 0 ? freight / miles : 0,
      payRpm: miles > 0 ? pay / miles : 0,
      commPct: freight > 0 ? (comm / freight) * 100 : 0,
      daysPlusOne,
    };
  }, [orders]);

  return (
    <Popover>
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
        <div className="text-[11px] font-medium text-muted-foreground mb-2">
          This week · {stats.count} order{stats.count === 1 ? "" : "s"}
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
                ({stats.miles > 0 ? Math.round(stats.miles / stats.daysPlusOne).toLocaleString() : "—"})
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