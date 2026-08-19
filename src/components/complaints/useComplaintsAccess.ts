import { useAuthContext } from "@/contexts/AuthContext";

/** Extra user allowed view-only access even though their role is `yard`. */
export const COMPLAINTS_VIEW_ONLY_EMAILS = ["joey@bfprime.net"];

export function useComplaintsAccess() {
  const { roles, user } = useAuthContext();

  const canManage = roles.includes("admin") || roles.includes("manager");
  const isDispatch = !canManage && roles.includes("dispatch");
  const email = user?.email?.toLowerCase() ?? "";
  const viewOnly =
    !canManage &&
    !isDispatch &&
    (roles.includes("chicago_management") ||
      roles.includes("yard") ||
      COMPLAINTS_VIEW_ONLY_EMAILS.includes(email));

  return {
    canManage,
    isDispatchOnly: isDispatch,
    viewOnly,
    canView: canManage || isDispatch || viewOnly,
  };
}

export function isComplaintsViewOnlyEmail(email?: string | null) {
  return COMPLAINTS_VIEW_ONLY_EMAILS.includes((email ?? "").toLowerCase());
}
