import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AfterhoursDriverInfo {
  userName: string;
  userId: string;
}

/**
 * Builds a map of driver_id -> afterhours user info for display in Reports.
 * Only active during the weekend window (Friday 17:00 – Monday 08:00 Chicago time).
 * Fetches afterhours_assignments + profiles for the assigned users.
 */
export const useAfterhoursDriverMap = () => {
  const [driverAfterhoursMap, setDriverAfterhoursMap] = useState<Map<string, AfterhoursDriverInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isWeekendWindow, setIsWeekendWindow] = useState(false);

  useEffect(() => {
    // Check if we're in the weekend window (Saturday 6:00 AM – Sunday 11:59 PM Chicago time)
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const day = chicagoNow.getDay(); // 0=Sun, 6=Sat
    const hour = chicagoNow.getHours();

    const inWeekendWindow =
      (day === 6 && hour >= 6) || // Saturday after 6am
      (day === 0 && hour < 17);    // Sunday before 5pm

    setIsWeekendWindow(inWeekendWindow);

    if (!inWeekendWindow) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [assignRes, profilesNeeded] = await Promise.all([
          supabase.from('afterhours_assignments').select('afterhours_user_id, driver_id'),
          null, // placeholder
        ]);

        if (assignRes.error) throw assignRes.error;
        const assignData = assignRes.data || [];
        if (assignData.length === 0) {
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
