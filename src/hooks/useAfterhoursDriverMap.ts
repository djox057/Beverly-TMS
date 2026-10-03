import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fetchAllRows } from '@/lib/fetchAllRows';

interface AfterhoursDriverInfo {
  userName: string;
  userId: string;
}

interface CoverageRow {
  afterhours_user_id: string;
  driver_id: string;
  scheduled_date?: string;
  shift?: string;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const EMPTY_MAP = new Map<string, AfterhoursDriverInfo>();

/** Reports labels only: keep the existing weekend and 16:00–07:00 tag windows.
 * Own coverage wins; otherwise prefer the live shift (tonight's night shift
 * during evening preview). Refresh while Reports stays open across shifts.
 */
export const useAfterhoursDriverMap = () => {
  const { profile } = useAuthContext();
  const currentUserId = profile?.user_id ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ['afterhours-driver-map', currentUserId],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      // Calculate on every refresh, not only when the component mounts.
      const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = chicagoNow.getHours();
      const todayStr = fmt(chicagoNow);
      const yesterday = new Date(chicagoNow);
      yesterday.setDate(chicagoNow.getDate() - 1);
      const yesterdayStr = fmt(yesterday);
      const inAfterhoursTagWindow = hour >= 16 || hour < 7;
      const preferredShift = hour < 6 || hour >= 16 ? 'night' : 'morning';
      const preferredDate = hour < 6 ? yesterdayStr : todayStr;
      const rows: CoverageRow[] = [];

      const { data: scheduleData, error: scheduleErr } = await supabase
        .from('afterhours_schedule')
        .select('id')
        .eq('scheduled_date', todayStr)
        .limit(1);
      if (scheduleErr) throw scheduleErr;

      if (scheduleData?.length) {
        rows.push(...await fetchAllRows<CoverageRow>((from, to) =>
          supabase
            .from('afterhours_assignments')
            .select('afterhours_user_id, driver_id')
            .eq('scheduled_date', todayStr)
            .order('id')
            .range(from, to)));
      }

      if (inAfterhoursTagWindow) {
        const shiftData = await fetchAllRows<CoverageRow>((from, to) =>
          supabase
            .from('afterhours_shift_assignments')
            .select('afterhours_user_id, driver_id, scheduled_date, shift')
            .in('scheduled_date', [yesterdayStr, todayStr])
            .order('id')
            .range(from, to));
        rows.push(...shiftData.filter(r => hour >= 16
          ? r.scheduled_date === todayStr
          : (r.scheduled_date === yesterdayStr && r.shift === 'night') ||
            (r.scheduled_date === todayStr && r.shift === 'morning')));
      }

      const map = new Map<string, AfterhoursDriverInfo>();
      // Returning an empty map clears labels after removals/day/window changes.
      if (!rows.length) return { map, isWeekendWindow: false };

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', [...new Set(rows.map(r => r.afterhours_user_id))]);
      if (profilesErr) throw profilesErr;
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name || p.email]));

      const priority = (r: CoverageRow) =>
        (currentUserId && r.afterhours_user_id === currentUserId ? 4 : 0) +
        (r.shift === preferredShift && r.scheduled_date === preferredDate ? 2 : r.shift ? 1 : 0);
      // Lowest priority first: Map.set deliberately overwrites it. Resolve ties
      // consistently instead of depending on the database's return order.
      rows.sort((a, b) => priority(a) - priority(b) ||
        a.afterhours_user_id.localeCompare(b.afterhours_user_id));
      for (const r of rows) {
        const userName = profileMap.get(r.afterhours_user_id);
        if (userName && r.driver_id) {
          map.set(r.driver_id, { userName, userId: r.afterhours_user_id });
        }
      }
      return { map, isWeekendWindow: map.size > 0 };
    },
  });

  return {
    driverAfterhoursMap: data?.map ?? EMPTY_MAP,
    isWeekendWindow: data?.isWeekendWindow ?? false,
    loading: isLoading,
  };
};
