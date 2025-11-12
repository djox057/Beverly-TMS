import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AssignmentHistoryEntry {
  id: string;
  truck_id: string | null;
  trailer_id: string | null;
  driver1_id: string | null;
  driver2_id: string | null;
  changed_at: string;
  changed_by: string | null;
  change_type: string;
  truck_number: string | null;
  trailer_number: string | null;
  driver1_name: string | null;
  driver2_name: string | null;
  changed_by_name: string | null;
}

export const useAssignmentHistory = (
  entityType: 'truck' | 'trailer' | 'driver',
  entityId: string | null
) => {
  return useQuery({
    queryKey: ['assignment-history', entityType, entityId],
    queryFn: async () => {
      if (!entityId) return [];

      const { data, error } = await supabase.rpc('get_assignment_history', {
        p_entity_type: entityType,
        p_entity_id: entityId
      });

      if (error) {
        console.error('Error fetching assignment history:', error);
        throw error;
      }

      return (data || []) as unknown as AssignmentHistoryEntry[];
    },
    enabled: !!entityId,
  });
};
