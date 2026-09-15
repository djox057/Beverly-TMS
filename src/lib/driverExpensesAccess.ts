import type { UserRole } from "@/hooks/useAuth";

// Driver expense sheet: recruiting-side spend. Chicago management is view-only.
export const DRIVER_EXPENSES_ROLES: UserRole[] = ["admin", "manager", "recruiting", "chicago_management"];
export const DRIVER_EXPENSES_EDIT_ROLES: UserRole[] = ["admin", "manager", "recruiting"];
