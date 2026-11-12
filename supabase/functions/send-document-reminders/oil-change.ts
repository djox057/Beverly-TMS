import { getOilChangeThresholds } from "../_shared/reminders.ts";

interface OilTruck {
  source?: string | null;
  miles: number | null;
  last_oil_change_miles: number | null;
  fleet_service_snapshot?: {
    miles: number | null;
    last_oil_change_miles: number | null;
  } | null;
}

export function oilChangeReminder(truck: OilTruck) {
  const service = truck.fleet_service_snapshot ?? truck;
  if (service.miles == null || service.last_oil_change_miles == null) return null;
  const since = Number(service.miles) - Number(service.last_oil_change_miles);
  const { red } = getOilChangeThresholds(truck.source);
  if (!Number.isFinite(since) || since <= red) return null;
  return {
    detail: `${since.toLocaleString("en-US")} mi since last oil change (limit ${red.toLocaleString("en-US")})`,
    statusLabel: `OVERDUE by ${(since - red).toLocaleString("en-US")} mi`,
  };
}
