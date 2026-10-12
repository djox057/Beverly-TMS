import { describe, expect, it } from "vitest";
import { hasRoleAccess } from "./dispatchAccess";
import { canEditRecoveryCompanyDrugTests } from "./recoveryDrugTestsAccess";
import type { UserRole } from "@/hooks/useAuth";

describe("Recovery company drug test edit access", () => {
  it.each([
    ["dispatch", true, true],
    ["dispatch", false, false],
    ["dispatch", undefined, false],
    ["afterhours", true, false],
    ["driver", true, false],
    ["supervisor", true, true],
    ["supervisor", false, false],
    ["admin", false, true],
    ["manager", false, true],
    ["safety", false, true],
    ["maintenance", false, true],
  ] as [UserRole, boolean | undefined, boolean][])("%s with Recovery tag %s: editable=%s", (role, tagged, expected) => {
    expect(canEditRecoveryCompanyDrugTests((required) => hasRoleAccess([role], required), tagged)).toBe(expected);
  });
});
