export type FleetServiceSnapshot = {
  miles: number | null;
  miles_updated_at: string | null;
  last_oil_change_miles: number | null;
  oil_change_date: string | null;
  air_filter: number | null;
  last_oc_invoice: string | null;
  fleet_pm_readiness: string;
  oil_log_entry_id: string | null;
  air_filter_log_entry_id: string | null;
};

// Keep raw truck data in the query cache. Only the displayed row uses the
// resolved readings, so edits and realtime events retain their original source.
export function applyFleetServiceSnapshot<T extends { fleet_service_snapshot?: FleetServiceSnapshot | null }>(truck: T) {
  const snapshot = truck.fleet_service_snapshot;
  return snapshot ? { ...truck, ...snapshot } : truck;
}

// Reports must use the same oil service and odometer as Live Oil Change.
// Resolve only while building display rows; leave cached truck fields untouched.
export function getReportOilService(truck: {
  miles?: number | null;
  last_oil_change_miles?: number | null;
  oil_change_date?: string | null;
  fleet_service_snapshot?: unknown;
}) {
  const service = applyFleetServiceSnapshot({
    ...truck,
    fleet_service_snapshot: truck.fleet_service_snapshot as FleetServiceSnapshot | null | undefined,
  });
  return {
    truck_miles: service.miles ?? null,
    last_oil_change_miles: service.last_oil_change_miles ?? null,
    oil_change_date: service.oil_change_date || null,
  };
}
