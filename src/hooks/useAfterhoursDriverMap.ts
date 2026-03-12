import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AfterhoursDriverInfo {
  userName: string;
  userId: string;
}

/**
 * Builds a map of driver_id -> afterhours user info for display in Reports.
 * Fetches afterhours_assignments + profiles for the assigned users.
 */
export const useAfterhoursDriverMap = () => {
  const [assignments, setAssignments] = useState<{ afterhours_user_id: string; driver_id: string }[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: assignData, error: assignErr } = await supabase
          .from('afterhours_assignments')
          .select('afterhours_user_id, driver_id');

        if (assignErr) throw assignErr;
        if (!assignData || assignData.length === 0) {
          setAssignments([]);
          setLoading(false);
          return;
        }

        setAssignments(assignData);

        // Get unique user IDs
        const userIds = [...new Set(assignData.map(a => a.afterhours_user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);

        const map = new Map<string, string>();
        (profiles || []).forEach(p => {
          // Use first name only for compact display
          const fullName = p.full_name || p.email;
          const firstName = fullName?.split(' ')[0] || fullName;
          map.set(p.user_id, firstName);
        });
        setUserProfiles(map);
      } catch (err) {
        console.error('Error fetching afterhours driver map:', err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  // Build driver_id -> afterhours user name map
  const driverAfterhoursMap = useMemo(() => {
    const map = new Map<string, AfterhoursDriverInfo>();
    assignments.forEach(a => {
      const userName = userProfiles.get(a.afterhours_user_id);
      if (userName) {
        map.set(a.driver_id, { userName, userId: a.afterhours_user_id });
      }
    });
    return map;
  }, [assignments, userProfiles]);

  return { driverAfterhoursMap, loading };
};
