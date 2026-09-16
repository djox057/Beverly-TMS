import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AfterhoursDriverInfo {
  userName: string;
  userId: string;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Builds a map of driver_id -> afterhours user info for display in Reports.
 *
 * Two sources, treated identically:
 *  - Weekend/holiday schedule (afterhours_schedule + afterhours_assignments),
 *    active 6:00 AM - 5:00 PM Chicago time on a scheduled day.
 *  - Afterhours shift schedule (afterhours_shift_assignments):
 *      night shift   22:00 -> 06:00 (belongs to the date the shift started)
 *      morning shift 06:00 -> 14:00
 */
export const useAfterhoursDriverMap = () => {
  const [driverAfterhoursMap, setDriverAfterhoursMap] = useState<Map<string, AfterhoursDriverInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isWeekendWindow, setIsWeekendWindow] = useState(false);

  useEffect(() => {
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const hour = chicagoNow.getHours();
    const todayStr = fmt(chicagoNow);

    // Which afterhours shift (if any) is live right now?
    let activeShift: { shift: 'night' | 'morning'; date: string } | null = null;
    if (hour >= 22) {
      activeShift = { shift: 'night', date: todayStr };
    } else if (hour < 6) {
      const y = new Date(chicagoNow);
      y.setDate(chicagoNow.getDate() - 1);
      activeShift = { shift: 'night', date: fmt(y) };
    } else if (hour < 14) {
      activeShift = { shift: 'morning', date: todayStr };
    }

    const weekendWindowOpen = hour >= 6 && hour < 17;

    if (!activeShift && !weekendWindowOpen) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        const rows: { afterhours_user_id: string; driver_id: string }[] = [];

        // Weekend / holiday schedule
        if (weekendWindowOpen) {
          const { data: scheduleData, error: scheduleErr } = await supabase
            .from('afterhours_schedule')
            .select('id')
            .eq('scheduled_date', todayStr)
            .limit(1);
          if (scheduleErr) throw scheduleErr;

          if (scheduleData && scheduleData.length > 0) {
            const { data: assignData, error: assignErr } = await supabase
              .from('afterhours_assignments')
              .select('afterhours_user_id, driver_id')
              .eq('scheduled_date', todayStr);
            if (assignErr) throw assignErr;
            rows.push(...((assignData || []) as any[]));
          }
        }

        // Afterhours shift schedule
        if (activeShift) {
          const { data: shiftData, error: shiftErr } = await supabase
            .from('afterhours_shift_assignments')
            .select('afterhours_user_id, driver_id')
            .eq('scheduled_date', activeShift.date)
            .eq('shift', activeShift.shift);
          if (shiftErr) throw shiftErr;
          rows.push(...((shiftData || []) as any[]));
        }

        if (cancelled) return;

        if (rows.length === 0) {
          setLoading(false);
          return;
        }

        setIsWeekendWindow(true);

        const userIds = [...new Set(rows.map(r => r.afterhours_user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);

        if (cancelled) return;

        const profileMap = new Map<string, string>();
        (profiles || []).forEach(p => {
          profileMap.set(p.user_id, p.full_name || p.email);
        });

        const map = new Map<string, AfterhoursDriverInfo>();
        rows.forEach(r => {
          const userName = profileMap.get(r.afterhours_user_id);
          if (userName && r.driver_id) {
            map.set(r.driver_id, { userName, userId: r.afterhours_user_id });
          }
        });
        setDriverAfterhoursMap(map);
      } catch (err) {
        console.error('Error fetching afterhours driver map:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, []);

  return { driverAfterhoursMap, isWeekendWindow, loading };
};
