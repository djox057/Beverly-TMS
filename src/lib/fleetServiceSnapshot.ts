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
