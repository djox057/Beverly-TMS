import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

/** The clock changes the date/window without polling assignment data. */
export const useAfterhoursDriverMap = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const chicago = toZonedTime(now, "America/Chicago");
  const date = format(chicago, "yyyy-MM-dd");
  const inWindow = chicago.getHours() >= 6 && chicago.getHours() < 17;
  const query = useQuery({
    queryKey: ["afterhours-driver-map", date], enabled: inWindow,
    staleTime: 300000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: schedule, error: scheduleError } = await supabase.from("afterhours_schedule")
        .select("id").eq("scheduled_date", date).limit(1);
      if (scheduleError) throw scheduleError;
      const map = new Map<string, { userName: string; userId: string }>();
      if (!schedule?.length) return { scheduled: false, map };
      const { data: assignments, error } = await supabase.from("afterhours_assignments")
        .select("afterhours_user_id, driver_id").eq("scheduled_date", date);
      if (error) throw error;
      const ids = [...new Set((assignments || []).map(row => row.afterhours_user_id))];
      if (!ids.length) return { scheduled: true, map };
      const { data: profiles, error: profileError } = await supabase.from("profiles")
        .select("user_id, full_name, email").in("user_id", ids);
      if (profileError) throw profileError;
      const names = new Map((profiles || []).map(row => [row.user_id, row.full_name || row.email]));
      for (const row of assignments || []) {
        const userName = names.get(row.afterhours_user_id);
        if (userName) map.set(row.driver_id, { userName, userId: row.afterhours_user_id });
      }
      return { scheduled: true, map };
    },
  });
  const empty = useMemo(() => new Map<string, { userName: string; userId: string }>(), []);
  return {
    driverAfterhoursMap: inWindow ? query.data?.map || empty : empty,
    isWeekendWindow: inWindow && !!query.data?.scheduled,
    loading: inWindow && query.isPending,
  };
};
