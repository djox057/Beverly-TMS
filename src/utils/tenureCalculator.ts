import { AssignmentHistoryEntry, extractDatePart } from "@/hooks/useAssignmentHistory";
import { differenceInDays } from "date-fns";

export interface Tenure {
  entityId: string | null;
  entityName: string | null;
  startDate: string;           // YYYY-MM-DD
  endDate: string | null;      // null = Current
  durationDays: number;
  endReason: string | null;    // From assignment_history.reason
  changedByName: string | null;
  isGap: boolean;              // True if this represents an unassigned period
}

export type TenureType = 'driver1' | 'driver2' | 'trailer' | 'truck' | 'dispatcher';

// Merge threshold: 7 days - handles brief unassignment/reassignment cycles
const MERGE_THRESHOLD_DAYS = 7;

/**
 * Extract entity info from a history entry based on tenure type
 */
const getEntityFromEntry = (
  entry: AssignmentHistoryEntry,
  tenureType: TenureType
): { id: string | null; name: string | null } => {
  switch (tenureType) {
    case 'driver1':
      return { id: entry.driver1_id, name: entry.driver1_name };
    case 'driver2':
      return { id: entry.driver2_id, name: entry.driver2_name };
    case 'trailer':
      return { id: entry.trailer_id, name: entry.trailer_number };
    case 'truck':
      return { id: entry.truck_id, name: entry.truck_number };
    case 'dispatcher':
      return { id: entry.dispatcher_id, name: entry.dispatcher_name };
  }
};

/**
 * Calculate duration in days between two dates
 */
const calculateDuration = (startDate: string, endDate: string | null): number => {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  return Math.max(1, differenceInDays(end, start) + 1); // +1 to include start day
};

/**
 * Merge consecutive tenures for the same entity within threshold
 */
const mergeSimilarTenures = (tenures: Tenure[]): Tenure[] => {
  if (tenures.length <= 1) return tenures;

  // Sort by start date ascending for merging
  const sorted = [...tenures].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const merged: Tenure[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    
    // Skip gaps when checking for same entity
    if (current.isGap || next.isGap) {
      merged.push(current);
      current = { ...next };
      continue;
    }

    // Check if same entity and within threshold
    const sameEntity = current.entityId === next.entityId && 
                       current.entityName === next.entityName;
    
    if (!sameEntity) {
      merged.push(current);
      current = { ...next };
      continue;
    }

    const currentEndDate = current.endDate || new Date().toISOString().split('T')[0];
    const daysBetween = differenceInDays(
      new Date(next.startDate),
      new Date(currentEndDate)
    );

    if (daysBetween <= MERGE_THRESHOLD_DAYS) {
      // Merge: extend current tenure to include next
      current.endDate = next.endDate;
      current.durationDays = calculateDuration(current.startDate, current.endDate);
      // Keep the end reason from the later tenure if it exists
      if (next.endReason) {
        current.endReason = next.endReason;
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
};

/**
 * Calculate tenures from assignment history for a specific relationship type.
 * Returns a list of tenures sorted by start date descending (most recent first).
 */
export const calculateTenures = (
  history: AssignmentHistoryEntry[],
  tenureType: TenureType,
  includeGaps: boolean = false
): Tenure[] => {
  if (!history || history.length === 0) return [];

  // Sort chronologically (oldest first) to process in order
  const sorted = [...history].sort((a, b) =>
    new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );

  // Deduplicate: keep only one entry per day per entity to prevent multiple rows
  // when multiple assignment events fire on the same day for the same entity
  const deduped: AssignmentHistoryEntry[] = [];
  const seenDayEntity = new Map<string, AssignmentHistoryEntry>();
  
  for (const entry of sorted) {
    const datePart = extractDatePart(entry.changed_at);
    const entity = getEntityFromEntry(entry, tenureType);
    const key = `${datePart}|${entity.id || 'null'}|${entity.name || 'null'}`;
    
    // Keep entry with reason if one exists, otherwise latest
    const existing = seenDayEntity.get(key);
    if (!existing || (entry.reason && !existing.reason)) {
      seenDayEntity.set(key, entry);
    }
  }
  
  // Rebuild sorted array from deduplicated entries
  const dedupedSorted = Array.from(seenDayEntity.values()).sort((a, b) =>
    new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );

  const tenures: Tenure[] = [];
  let currentTenure: {
    entityId: string | null;
    entityName: string | null;
    startDate: string;
    changedByName: string | null;
  } | null = null;

  for (const entry of dedupedSorted) {
    const entryDate = extractDatePart(entry.changed_at);
    const entity = getEntityFromEntry(entry, tenureType);
    
    // Check if entity changed
    const entityChanged = !currentTenure || 
      currentTenure.entityId !== entity.id ||
      currentTenure.entityName !== entity.name;

    if (entityChanged) {
      // Close previous tenure
      if (currentTenure) {
        tenures.push({
          entityId: currentTenure.entityId,
          entityName: currentTenure.entityName,
          startDate: currentTenure.startDate,
          endDate: entryDate,
          durationDays: calculateDuration(currentTenure.startDate, entryDate),
          endReason: entry.reason || null, // Reason from the NEW entry explains why previous ended
          changedByName: currentTenure.changedByName,
          isGap: !currentTenure.entityId && !currentTenure.entityName,
        });
      }

      // Start new tenure if entity is assigned (or track gap if includeGaps)
      if (entity.id || entity.name || includeGaps) {
        currentTenure = {
          entityId: entity.id,
          entityName: entity.name,
          startDate: entryDate,
          changedByName: entry.changed_by_name,
        };
      } else {
        currentTenure = null;
      }
    }
  }

  // Add current/active tenure (endDate = null means still assigned)
  if (currentTenure) {
    const isGap = !currentTenure.entityId && !currentTenure.entityName;
    // Only add current tenure if it's not a gap (gaps shouldn't be "current")
    if (!isGap) {
      tenures.push({
        entityId: currentTenure.entityId,
        entityName: currentTenure.entityName,
        startDate: currentTenure.startDate,
        endDate: null, // Current
        durationDays: calculateDuration(currentTenure.startDate, null),
        endReason: null,
        changedByName: currentTenure.changedByName,
        isGap: false,
      });
    }
  }

  // Filter out gaps if not requested
  const filteredTenures = includeGaps 
    ? tenures 
    : tenures.filter(t => !t.isGap);

  // Merge consecutive tenures for same entity
  const mergedTenures = mergeSimilarTenures(filteredTenures);

  // Sort by start date descending (most recent first), with current at top
  return mergedTenures.sort((a, b) => {
    // Current assignments always first
    if (a.endDate === null && b.endDate !== null) return -1;
    if (b.endDate === null && a.endDate !== null) return 1;
    
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
};

/**
 * Calculate combined driver tenures (driver1 + driver2 merged)
 * This handles team drivers and slot changes
 */
export const calculateCombinedDriverTenures = (
  history: AssignmentHistoryEntry[],
  includeGaps: boolean = false
): Tenure[] => {
  const driver1Tenures = calculateTenures(history, 'driver1', includeGaps);
  const driver2Tenures = calculateTenures(history, 'driver2', includeGaps);
  
  // Combine and re-merge
  const combined = [...driver1Tenures, ...driver2Tenures];
  const merged = mergeSimilarTenures(combined);
  
  // Sort by start date descending, current first
  return merged.sort((a, b) => {
    if (a.endDate === null && b.endDate !== null) return -1;
    if (b.endDate === null && a.endDate !== null) return 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
};

/**
 * Format tenure date range as human-readable string
 */
export const formatTenureDateRange = (tenure: Tenure): string => {
  const formatDate = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const startFormatted = formatDate(tenure.startDate);
  const endFormatted = tenure.endDate ? formatDate(tenure.endDate) : 'Current';
  
  return `${startFormatted} - ${endFormatted}`;
};

/**
 * Format duration as human-readable string
 */
export const formatTenureDuration = (days: number): string => {
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  
  if (weeks >= 4) {
    const months = Math.floor(days / 30);
    if (months >= 1) {
      return months === 1 ? '1 month' : `${months} months`;
    }
  }
  
  if (remainingDays === 0) {
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  
  return `${days} days`;
};
