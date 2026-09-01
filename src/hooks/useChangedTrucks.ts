import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the set of truck ids whose driver1/driver2 assignment changed
 * within the last 14 days (swaps, new assignments and removals all count).
 */
export const useChangedTrucks = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['changed-trucks', 'last-14-days'],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('assignment_history')
        .select('truck_id, driver1_id, driver2_id, old_driver1_id, old_driver2_id')
        .not('truck_id', 'is', null)
        .gte('changed_at', since)
        .order('changed_at', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const ids = new Set<string>();
      for (const row of data || []) {
        const driver1Changed = (row.driver1_id ?? null) !== (row.old_driver1_id ?? null);
        const driver2Changed = (row.driver2_id ?? null) !== (row.old_driver2_id ?? null);
        if ((driver1Changed || driver2Changed) && row.truck_id) {
          ids.add(row.truck_id);
        }
      }
      return ids;
    },
    enabled,
    staleTime: 60000,
  });
};
