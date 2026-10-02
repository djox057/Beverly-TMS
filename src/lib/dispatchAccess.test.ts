import { describe, expect, it } from "vitest";
import { hasRoleAccess, isDispatcherRole, requiresLowStopAmountApproval, teamIncludesBooker, teamIncludesOrder } from "./dispatchAccess";
import type { UserRole } from "@/hooks/useAuth";

describe("supervisor permissions", () => {
  it("preserves the Low Stop Amount approval exemption", () => {
    expect(requiresLowStopAmountApproval(["dispatch"])).toBe(true);
    expect(requiresLowStopAmountApproval(["afterhours"])).toBe(true);
    expect(requiresLowStopAmountApproval(["supervisor"])).toBe(false);
    expect(requiresLowStopAmountApproval(["supervisor", "dispatch"])).toBe(false);
    expect(requiresLowStopAmountApproval(["admin"])).toBe(false);
  });
  it("inherits dispatch access without inheriting management, safety or financial permissions", () => {
    expect(hasRoleAccess(["supervisor"], "dispatch")).toBe(true);
    for (const role of ["admin", "manager", "accounting", "safety", "maintenance", "yard", "afterhours", "driver"] as UserRole[]) {
      expect(hasRoleAccess(["supervisor"], role), role).toBe(false);
    }
    expect(hasRoleAccess(["supervisor"], "supervisor")).toBe(true);
  });
  it("preserves permissions for every combination of non-supervisor roles", () => {
    const nonSupervisorRoles: UserRole[] = ["dispatch", "afterhours", "admin", "manager", "driver", "safety", "accounting", "maintenance", "chicago_management", "yard", "recruiting", "claims"];
    for (let mask = 0; mask < 2 ** nonSupervisorRoles.length; mask++) {
      const roles = nonSupervisorRoles.filter((_, index) => mask & (1 << index));
      for (const required of [...nonSupervisorRoles, "supervisor" as UserRole]) {
        const priorAccess = roles.length > 0 && (
          (roles.some(role => ["admin", "accounting", "manager", "chicago_management"].includes(role)) && required !== "driver") ||
          (roles.some(role => ["safety", "maintenance"].includes(role)) && required === "dispatch") ||
          roles.includes(required)
        );
        expect(hasRoleAccess(roles, required)).toBe(priorAccess);
      }
    }
  });
  it("preserves additional explicitly granted roles and existing admin behavior", () => {
    expect(hasRoleAccess(["supervisor", "maintenance"], "maintenance")).toBe(true);
    expect(hasRoleAccess(["admin"], "manager")).toBe(true);
    expect(hasRoleAccess(["dispatch"], "admin")).toBe(false);
    expect(isDispatcherRole("supervisor")).toBe(true);
  });
});
describe("assigned supervisor team", () => {
  const ids = new Set(["self", "assigned"]);
  const names = new Set(["Supervisor", "Assigned Dispatcher"]);
  const drivers = new Set(["assigned-driver"]);
  it("includes own and assigned bookers by name and ID", () => {
    for (const booker of ["self", "assigned", "Supervisor", "Assigned Dispatcher"]) expect(teamIncludesBooker(ids, names, booker)).toBe(true);
    expect(teamIncludesBooker(ids, names, "Unassigned colleague in same office")).toBe(false);
  });
  it("includes assigned drivers and historical/team-driver trips", () => {
    expect(teamIncludesOrder(ids, names, drivers, { driver2Id: "assigned-driver" })).toBe(true);
    expect(teamIncludesOrder(ids, names, drivers, { originalDriver1Id: "assigned-driver" })).toBe(true);
    expect(teamIncludesOrder(ids, names, drivers, { bookedBy: "Unassigned", driver1Id: "other" })).toBe(false);
  });
  it("fails closed until assignments load and supports supervisors without assignments", () => {
    expect(teamIncludesOrder(new Set(), new Set(), new Set(), { bookedBy: "self" })).toBe(false);
    expect(teamIncludesBooker(new Set(["self"]), new Set(), "self")).toBe(true);
    expect(teamIncludesBooker(new Set(["self"]), new Set(), "assigned")).toBe(false);
  });
});
