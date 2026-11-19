import { combineDateAndTime } from "./dateUtils";

interface ScheduledStop {
  type: string;
  datetime?: string | null;
}

// Supabase returns timestamps with an offset. Form timestamps use the same
// wall-clock convention without an offset. Compare both independently of browser timezone.
export function orderSchedule(stops: readonly ScheduledStop[]) {
  let pickupDatetime: string | null = null;
  let deliveryDatetime: string | null = null;
  let earliest = Infinity;
  let latest = -Infinity;
  for (const {type, datetime} of stops) {
    if (!datetime) continue;
    const iso = datetime.replace(" ", "T");
    const instant = Date.parse(iso.includes("T") && !/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso + "Z" : iso);
    if (type === "pickup" && instant < earliest) {
      earliest = instant;
      pickupDatetime = datetime;
    } else if ((type === "delivery" || type === "drop") && instant > latest) {
      latest = instant;
      deliveryDatetime = datetime;
    }
  }
  return { pickupDatetime, deliveryDatetime };
}

export function formOrderSchedule(stops: readonly {
  type: string; address: string; dateRange?: { from?: Date }; startTime?: string;
}[]) {
  return orderSchedule(stops.filter(stop => stop.address?.trim()).map(stop => ({
    type: stop.type,
    datetime: stop.dateRange?.from && stop.startTime ? combineDateAndTime(stop.dateRange.from, stop.startTime) : null,
  })));
}
