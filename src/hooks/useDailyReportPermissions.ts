import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { busChannel } from "@/hooks/realtimeBus";

export interface DailyReportPermissions { canView: boolean; canEdit: boolean; loading: boolean; }
export const useDailyReportPermissions = (): DailyReportPermissions => {
  const { user, roles, loading: authLoading } = useAuthContext();
  const queryClient = useQueryClient();
  const admin = roles.includes("admin" as any);
  const query = useQuery({
    queryKey: ["daily-report-permissions", user?.id],
    enabled: !!user?.id && !authLoading && !admin,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_report_permissions" as any)
        .select("can_view, can_edit").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as { can_view?: boolean; can_edit?: boolean } | null;
    },
  });
  useEffect(() => {
    if (!user?.id || admin) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["daily-report-permissions", user.id] }); };
    const channel = busChannel(refresh, `daily-report-permissions:${user.id}`)
      .on("postgres_changes", { table: "daily_report_permissions", event: "*" }, refresh).subscribe();
    return () => channel.unsubscribe();
  }, [user?.id, admin, queryClient]);
  return {
    canView: !!user && (admin || !!query.data?.can_view),
    canEdit: !!user && (admin || !!query.data?.can_edit),
    loading: authLoading || (!!user && !admin && query.isPending),
  };
};
