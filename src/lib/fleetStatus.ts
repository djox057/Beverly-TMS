export type InactiveFleetStatus = "temporary_inactive" | "inactive";
export type FleetStatus = "active" | InactiveFleetStatus;
export type FleetStatusFilter = FleetStatus | "all" | "changed";

interface FleetStatusFields {
  is_active?: boolean | null;
  is_temporary_inactive?: boolean | null;
}

export function getFleetStatus(unit: FleetStatusFields): FleetStatus {
  if (unit.is_active !== false) return "active";
  return unit.is_temporary_inactive ? "temporary_inactive" : "inactive";
}

export function matchesFleetStatus(unit: FleetStatusFields, filter: FleetStatusFilter, changed = false): boolean {
  if (filter === "all") return true;
  const status = getFleetStatus(unit);
  return filter === "changed" ? status === "active" && changed : status === filter;
}
