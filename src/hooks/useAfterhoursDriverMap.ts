import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AfterhoursDriverInfo {
  userName: string;
  userId: string;
}

/**
 * Builds a map of driver_id -> afterhours user info for display in Reports.
 * Only active when today is a scheduled afterhours day (weekends/holidays from afterhours_schedule),
 * between 6:00 AM and 5:00 PM Chicago time.
 */
export const useAfterhoursDriverMap = () => {
  const [driverAfterhoursMap, setDriverAfterhoursMap] = useState<Map<string, AfterhoursDriverInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isWeekendWindow, setIsWeekendWindow] = useState(false);

  useEffect(() => {
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const hour = chicagoNow.getHours();

    // Must be between 6 AM and 5 PM Chicago time
    if (hour < 6 || hour >= 17) {
      setLoading(false);
      return;
    }

    // Check if today is a scheduled afterhours day
    const todayStr = `${chicagoNow.getFullYear()}-${String(chicagoNow.getMonth() + 1).padStart(2, '0')}-${String(chicagoNow.getDate()).padStart(2, '0')}`;

    const fetchData = async () => {
      try {
        // Check if today exists in afterhours_schedule
        const { data: scheduleData, error: scheduleErr } = await supabase
          .from('afterhours_schedule')
          .select('id')
          .eq('scheduled_date', todayStr)
          .limit(1);

        if (scheduleErr) throw scheduleErr;

        if (!scheduleData || scheduleData.length === 0) {
          // Today is not a scheduled afterhours day
          setLoading(false);
          return;
        }

        setIsWeekendWindow(true);

        // Fetch assignments for today only
        const { data: assignData, error: assignErr } = await supabase
          .from('afterhours_assignments')
          .select('afterhours_user_id, driver_id')
          .eq('scheduled_date', todayStr);

        if (assignErr) throw assignErr;
        if (!assignData || assignData.length === 0) {
          setLoading(false);
          return;
        }

        const userIds = [...new Set(assignData.map(a => a.afterhours_user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);

        const profileMap = new Map<string, string>();
        (profiles || []).forEach(p => {
          profileMap.set(p.user_id, p.full_name || p.email);
        });

        const map = new Map<string, AfterhoursDriverInfo>();
        assignData.forEach(a => {
          const userName = profileMap.get(a.afterhours_user_id);
          if (userName) {
            map.set(a.driver_id, { userName, userId: a.afterhours_user_id });
          }
        });
        setDriverAfterhoursMap(map);
      } catch (err) {
        console.error('Error fetching afterhours driver map:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { driverAfterhoursMap, isWeekendWindow, loading };
};
