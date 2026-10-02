import type { UserRole } from "@/hooks/useAuth";

export const isDispatcherRole = (role: UserRole | null): boolean => role === "dispatch" || role === "supervisor";
export const hasDispatcherRole = (roles: readonly string[]) => roles.includes("dispatch") || roles.includes("supervisor");

export function hasRoleAccess(roles: readonly UserRole[], requiredRole: UserRole): boolean {
  if (roles.length === 0) return false;
  if (roles.some((role) => ["admin", "accounting", "manager", "chicago_management"].includes(role)) && requiredRole !== "driver") return true;
  if (requiredRole === "dispatch" && roles.some((role) => ["supervisor", "safety", "maintenance"].includes(role))) return true;
  return roles.includes(requiredRole);
}

export const requiresLowStopAmountApproval = (roles: readonly UserRole[]) =>
  !hasRoleAccess(roles, "supervisor") &&
  (hasRoleAccess(roles, "dispatch") || hasRoleAccess(roles, "afterhours")) &&
  !hasRoleAccess(roles, "manager") && !hasRoleAccess(roles, "admin");

export interface TeamOrder {
  bookedBy?: string; booked_by?: string;
  driver1Id?: string; driver2Id?: string; originalDriver1Id?: string; originalDriver2Id?: string;
}
export const teamIncludesBooker = (ids: ReadonlySet<string>, names: ReadonlySet<string>, booker?: string | null) =>
  !!booker && (ids.has(booker) || names.has(booker));
export const teamIncludesOrder = (ids: ReadonlySet<string>, names: ReadonlySet<string>, driverIds: ReadonlySet<string>, order: TeamOrder) =>
  teamIncludesBooker(ids, names, order.bookedBy ?? order.booked_by) ||
  [order.driver1Id, order.driver2Id, order.originalDriver1Id, order.originalDriver2Id].some((id) => !!id && driverIds.has(id));
