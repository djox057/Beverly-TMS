import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export interface DailyReportPermissions {
  canView: boolean;
  canEdit: boolean;
  loading: boolean;
}

/**
 * Returns the current user's Daily Report permissions.
 * Admins always have full access. Managers/supervisors keep their existing
 * access for backwards compatibility. Other users get whatever was set in
 * `daily_report_permissions` by an admin.
 */
export const useDailyReportPermissions = (): DailyReportPermissions => {
  const { user, hasRole, loading: authLoading } = useAuthContext();
  const [canView, setCanView] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (authLoading) return;
      if (!user?.id) {
        setCanView(false);
        setCanEdit(false);
        setLoading(false);
        return;
      }

      // Admins always have full access
      if (hasRole("admin")) {
        if (!cancelled) {
          setCanView(true);
          setCanEdit(true);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("daily_report_permissions" as any)
        .select("can_view, can_edit")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      const row = data as { can_view?: boolean; can_edit?: boolean } | null;
      setCanView(!!row?.can_view);
      setCanEdit(!!row?.can_edit);
      setLoading(false);
    };

    load();

    // Live update when admins change permissions
    if (!user?.id) return;
    const channel = supabase
      .channel(`daily-report-perms-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_report_permissions",
          filter: `user_id=eq.${user.id}`,
        },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, authLoading, hasRole]);

  return { canView, canEdit, loading };
};