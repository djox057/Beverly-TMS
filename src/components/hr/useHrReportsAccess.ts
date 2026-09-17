import { useAuthContext } from "@/contexts/AuthContext";

/** HR Reports board: admins, managers and Chicago management only. */
export function useHrReportsAccess() {
  const { roles } = useAuthContext();
  const canAccess =
    roles.includes("admin") || roles.includes("manager") || roles.includes("chicago_management");
  return { canAccess };
}
