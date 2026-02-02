import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AssignmentHistoryEntry {
  id: string;
  truck_id: string | null;
  trailer_id: string | null;
  driver1_id: string | null;
  driver2_id: string | null;
  // Before/after columns for explicit change tracking
  old_truck_id: string | null;
  old_trailer_id: string | null;
  old_driver1_id: string | null;
  old_driver2_id: string | null;
  changed_at: string;
  changed_by: string | null;
  change_type: string;
  truck_number: string | null;
  trailer_number: string | null;
  driver1_name: string | null;
  driver2_name: string | null;
  changed_by_name: string | null;
  reason: string | null;
  // Resolved names for old values
  old_truck_number: string | null;
  old_trailer_number: string | null;
  old_driver1_name: string | null;
  old_driver2_name: string | null;
  // Dispatcher fields
  dispatcher_id: string | null;
  old_dispatcher_id: string | null;
  dispatcher_name: string | null;
  old_dispatcher_name: string | null;
}

interface UseAssignmentHistoryOptions {
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}

export const useAssignmentHistory = (
  entityType: 'truck' | 'trailer' | 'driver',
  entityId: string | null,
  options?: UseAssignmentHistoryOptions
) => {
  return useQuery({
    queryKey: ['assignment-history', entityType, entityId, options?.fromDate, options?.toDate, options?.limit],
    queryFn: async () => {
      if (!entityId) return [];

      const { data, error } = await supabase.rpc('get_assignment_history' as any, {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_from_date: options?.fromDate || null,
        p_to_date: options?.toDate || null,
        p_limit: options?.limit || 100
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

/**
 * Builds a human-readable description of what changed using before/after values.
 * This is deterministic and doesn't rely on comparing with previous array entries.
 */
export const buildChangeDescription = (
  entry: AssignmentHistoryEntry,
  filterType: 'driver' | 'truck' | 'trailer'
): string => {
  if (filterType === 'driver') {
    // For driver filter, show truck changes
    const oldTruck = entry.old_truck_number;
    const newTruck = entry.truck_number;
    
    if (newTruck && oldTruck && newTruck !== oldTruck) {
      return `Switched to truck ${newTruck} from ${oldTruck}`;
    } else if (newTruck && !oldTruck) {
      return `Assigned to truck ${newTruck}`;
    } else if (!newTruck && oldTruck) {
      return `Removed from truck ${oldTruck}`;
    } else if (newTruck) {
      return `Assigned to truck ${newTruck}`;
    }
    return "Assignment updated";
  } else if (filterType === 'truck') {
    // For truck filter, show driver changes
    const oldDriver = entry.old_driver1_name;
    const newDriver = entry.driver1_name;
    const oldDriver2 = entry.old_driver2_name;
    const newDriver2 = entry.driver2_name;
    
    // Build driver text
    let newDriverText = newDriver || "";
    if (newDriver2) newDriverText += ` / ${newDriver2}`;
    
    let oldDriverText = oldDriver || "";
    if (oldDriver2) oldDriverText += ` / ${oldDriver2}`;
    
    if (newDriverText && oldDriverText && newDriverText !== oldDriverText) {
      return `Switched to ${newDriverText} from ${oldDriverText}`;
    } else if (newDriverText && !oldDriverText) {
      return `Assigned ${newDriverText}`;
    } else if (!newDriverText && oldDriverText) {
      return `Removed ${oldDriverText}`;
    } else if (newDriverText) {
      return `Assigned ${newDriverText}`;
    }
    return "Assignment updated";
  } else {
    // For trailer filter, show truck/driver changes
    const oldTruck = entry.old_truck_number;
    const newTruck = entry.truck_number;
    
    if (newTruck && oldTruck && newTruck !== oldTruck) {
      return `Moved to truck ${newTruck} from ${oldTruck}`;
    } else if (newTruck && !oldTruck) {
      return `Attached to truck ${newTruck}`;
    } else if (!newTruck && oldTruck) {
      return `Detached from truck ${oldTruck}`;
    } else if (newTruck) {
      return `Attached to truck ${newTruck}`;
    }
    return "Assignment updated";
  }
};

/**
 * Extracts the date part from a timestamp string without timezone conversion.
 * Returns YYYY-MM-DD format.
 */
export const extractDatePart = (timestamp: string | null): string => {
  if (!timestamp) return '';
  // Handle both ISO format (T separator) and space separator
  const normalized = timestamp.replace(' ', 'T');
  return normalized.split('T')[0] || '';
};
