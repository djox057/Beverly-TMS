import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the set of trailer ids that changed trucks within the last 14 days
 * (attached, detached or moved between trucks).
 */
export const useChangedTrailers = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['changed-trailers', 'last-14-days'],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('assignment_history')
        .select('trailer_id, old_trailer_id, truck_id, old_truck_id')
        .gte('changed_at', since)
        .order('changed_at', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const ids = new Set<string>();
      for (const row of data || []) {
        const trailerChanged = (row.trailer_id ?? null) !== (row.old_trailer_id ?? null);
        const truckChanged = (row.truck_id ?? null) !== (row.old_truck_id ?? null);
        if (!trailerChanged && !truckChanged) continue;
        if (row.trailer_id) ids.add(row.trailer_id);
        if (row.old_trailer_id) ids.add(row.old_trailer_id);
      }
      return ids;
    },
    enabled,
    staleTime: 60000,
  });
};
