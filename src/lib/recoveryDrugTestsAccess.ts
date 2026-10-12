import type { UserRole } from "@/hooks/useAuth";

export function canEditRecoveryCompanyDrugTests(
  hasRole: (role: UserRole) => boolean,
  isRecoveryDispatcher: boolean | undefined,
): boolean {
  return hasRole("admin") || hasRole("manager") || hasRole("safety") || hasRole("maintenance") ||
    (hasRole("dispatch") && isRecoveryDispatcher === true);
}
