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

      let query = supabase
        .from('assignment_history')
        .select(`
          id,
          truck_id,
          trailer_id,
          driver1_id,
          driver2_id,
          changed_at,
          changed_by,
          change_type,
          trucks:truck_id (truck_number),
          trailers:trailer_id (trailer_number),
          driver1:driver1_id (name),
          driver2:driver2_id (name),
          profiles:changed_by (full_name)
        `)
        .order('changed_at', { ascending: false })
        .limit(50);

      // Filter based on entity type
      if (entityType === 'truck') {
        query = query.eq('truck_id', entityId);
      } else if (entityType === 'trailer') {
        query = query.eq('trailer_id', entityId);
      } else if (entityType === 'driver') {
        query = query.or(`driver1_id.eq.${entityId},driver2_id.eq.${entityId}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching assignment history:', error);
        throw error;
      }

      return (data || []).map((entry: any) => ({
        id: entry.id,
        truck_id: entry.truck_id,
        trailer_id: entry.trailer_id,
        driver1_id: entry.driver1_id,
        driver2_id: entry.driver2_id,
        changed_at: entry.changed_at,
        changed_by: entry.changed_by,
        change_type: entry.change_type,
        truck_number: entry.trucks?.truck_number || null,
        trailer_number: entry.trailers?.trailer_number || null,
        driver1_name: entry.driver1?.name || null,
        driver2_name: entry.driver2?.name || null,
        changed_by_name: entry.profiles?.full_name || null,
      })) as AssignmentHistoryEntry[];
    },
    enabled: !!entityId,
  });
};
