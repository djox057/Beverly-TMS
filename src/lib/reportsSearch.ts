const text = (value: unknown) => String(value ?? "").toLowerCase();

export function matchesReportUnit(truck: any, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const numeric = /^\d+$/.test(term);
  const matchesNumber = (value: unknown) => numeric ? text(value) === term : text(value).includes(term);
  return matchesNumber(truck.truckNumber) || matchesNumber(truck.trailerNumber) ||
    [truck.driver, truck.driver1Name, truck.driver2Name].some(name => text(name).includes(term));
}

export function matchesReportLoad(order: any, search: string, today?: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term || !order) return false;
  if (today && order.canceled) {
    const pickup = order.pickupStops?.[0]?.datetime || order.pickup_drops?.filter((s: any) => s.type === "pickup")
      .sort((a: any, b: any) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))[0]?.datetime ||
      order.pickup_datetime || order.pickupStop?.datetime;
    if (String(pickup ?? "").slice(0, 10) !== today) return false;
  }
  return [order.broker_load_number, order.internal_load_number].some(value => text(value).includes(term));
}

export interface ReportSearchFilters {
  unit?: string;
  dispatch?: string;
  load?: string;
  company?: string;
  proximity?: ReadonlyMap<string, number> | null;
  offices?: string[];
  driverIds?: readonly string[];
  today: string;
}

/** The same predicates drive the displayed rows and coverage search feedback. */
export function filterReportGroups(groups: any[] | null, filters: ReportSearchFilters): any[] {
  const allowed = filters.driverIds ? new Set(filters.driverIds) : null;
  return (groups ?? [])
    .filter(group => (!filters.offices || filters.offices.includes(group.office)) &&
      text(group.dispatcher).includes(text(filters.dispatch).trim()))
    .map(group => ({ ...group, trucks: (group.trucks ?? []).filter((truck: any) =>
      (!allowed || allowed.has(truck.driverId)) &&
      (!filters.company || truck.companyName === filters.company) &&
      (!filters.proximity || filters.proximity.has(truck.id)) &&
      matchesReportUnit(truck, filters.unit ?? "") &&
      (!filters.load?.trim() || (truck.allOrders ?? []).some((order: any) => matchesReportLoad(order, filters.load!, filters.today)))
    ) }))
    .filter(group => group.trucks.length > 0);
}

/** Mirrors the adapter's current-driver, yard-load and recovery-leg row mapping. */
export function reportOrderBelongsToDrivers(order: any, driverIds: readonly string[]): boolean {
  const allowed = new Set(driverIds);
  if ([order.driver1_id, order.driver2_id].some(id => allowed.has(id))) return true;
  if (!order.driver1_id && !order.driver2_id &&
      [order.original_driver1_id, order.original_driver2_id].some(id => allowed.has(id))) return true;
  return !!order.is_recovery && (order.order_transfers ?? []).some((transfer: any) =>
    [transfer.driver1_id, transfer.driver2_id].some(id => allowed.has(id)));
}
