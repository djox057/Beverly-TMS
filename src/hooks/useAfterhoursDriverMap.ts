import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { getAfterhoursShiftTime } from '@/lib/afterhoursShiftTime';

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

/** Reports labels: weekend dates use Chicago; shifts use Serbia 22:00–14:00.
 * Shift labels always come from the active shift; personal assignment history
 * must not override the morning/night handoff. Refresh while Reports stays open.
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
      const todayStr = fmt(chicagoNow);
      const shiftTime = getAfterhoursShiftTime();
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

      // Reports hands scheduled weekend coverage over at 13:00 Belgrade,
      // even while the regular morning shift continues until 14:00.
      const belgradeHour = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Belgrade', hour: '2-digit', hourCycle: 'h23',
      }).format(new Date()));
      const weekendHandoff = Boolean(scheduleData?.length) && belgradeHour >= 13 && belgradeHour < 22;

      if (shiftTime.shift && !weekendHandoff) {
        const shiftData = await fetchAllRows<CoverageRow>((from, to) =>
          supabase
            .from('afterhours_shift_assignments')
            .select('afterhours_user_id, driver_id, scheduled_date, shift')
            .in('scheduled_date', [shiftTime.yesterday, shiftTime.today])
            .order('id')
            .range(from, to));
        rows.push(...shiftData.filter(r =>
          r.shift === shiftTime.shift && r.scheduled_date === shiftTime.scheduledDate));
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

      // Resolve duplicate assignments consistently instead of depending on
      // database return order. For shift coverage, only the active shift was
      // included above, so a night dispatcher cannot win during the morning.
      rows.sort((a, b) => Number(Boolean(a.shift)) - Number(Boolean(b.shift)) ||
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
