import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovalManager {
  user_id: string;
  full_name: string | null;
  email: string;
  office: string | null;
}

/**
 * Managers (and admins) that can approve a below-floor Stop Amount.
 * Sorted so managers from the requester's own office come first.
 */
export const useApprovalManagers = (userOffice?: string | null) => {
  return useQuery({
    queryKey: ["approval-managers"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ApprovalManager[]> => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["manager", "admin"]);
      if (roleError) throw roleError;

      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office")
        .in("user_id", userIds);
      if (profileError) throw profileError;

      return (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        office: p.office,
      }));
    },
    select: (managers) =>
      [...managers].sort((a, b) => {
        const aSame = userOffice && a.office === userOffice ? 0 : 1;
        const bSame = userOffice && b.office === userOffice ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return (a.full_name || a.email).localeCompare(b.full_name || b.email);
      }),
  });
};
