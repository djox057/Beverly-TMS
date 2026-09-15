import type { UserRole } from "@/hooks/useAuth";

// Shared by navigation and the direct route. Dispatcher is stored as "dispatch".
export const UPCOMING_DRIVERS_ROLES: UserRole[] = [
  "admin",
  "manager",
  "supervisor",
  "safety",
  "recruiting",
  "chicago_management",
  "dispatch",
];
