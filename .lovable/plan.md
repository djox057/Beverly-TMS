
# Tenure-Based Assignment History Redesign

## Overview
Transform the assignment history from an event-log view to a **tenure-based timeline** that shows continuous date ranges when equipment was assigned together. This provides a clearer "who was on what, and when" view.

## Current State
- History shows individual **change events** (e.g., "Driver: None → John Smith")
- Users see a list of timestamps with before/after snapshots
- For trucks, there's already partial tenure calculation for drivers (merging within 7-day gaps)

## New Design

### Truck History Dialog
Shows two tabs with tenure timelines:

**Driver Tenures Tab**
```text
┌─────────────────────────────────────────────────────────────┐
│  John Smith                                                  │
│  01/15/2026 - Current (18 days)                             │
│  ─────────────────────────────────────────────────── ▓▓▓▓▓  │
├─────────────────────────────────────────────────────────────┤
│  Mike Johnson                                                │
│  11/20/2025 - 01/14/2026 (56 days)                          │
│  ─────────────────── ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                      │
│  Reason ended: Driver requested transfer                     │
├─────────────────────────────────────────────────────────────┤
│  No driver assigned                                          │
│  11/01/2025 - 11/19/2025 (19 days)                          │
│  ───── ░░░░░░░░░░░░░░░░░░░░                                 │
└─────────────────────────────────────────────────────────────┘
```

**Trailer Tenures Tab**
```text
┌─────────────────────────────────────────────────────────────┐
│  Trailer #53-2847                                            │
│  12/01/2025 - Current (63 days)                             │
│  ─────────────────────────────────────────────────── ▓▓▓▓▓  │
├─────────────────────────────────────────────────────────────┤
│  Trailer #53-1923                                            │
│  10/15/2025 - 11/30/2025 (47 days)                          │
│  ─────────────────── ▓▓▓▓▓▓▓▓▓▓▓▓▓                          │
│  Reason ended: Trailer sent for repair                       │
└─────────────────────────────────────────────────────────────┘
```

### Driver History Dialog
Shows two tabs with tenure timelines:

**Truck Tenures Tab**
- Shows which trucks this driver has been assigned to, with date ranges
- "Current" badge for active assignment

**Trailer Tenures Tab**  
- Shows which trailers this driver has worked with, with date ranges

### Trailer History Dialog
Shows two tabs:

**Truck Tenures Tab**
- Shows which trucks this trailer has been attached to

**Driver Tenures Tab**
- Shows which drivers have operated with this trailer

## Technical Implementation

### 1. Create Tenure Calculation Utility
New file: `src/utils/tenureCalculator.ts`

```typescript
interface Tenure {
  entityId: string | null;
  entityName: string | null;
  startDate: string;           // YYYY-MM-DD
  endDate: string | null;      // null = Current
  durationDays: number;
  endReason: string | null;    // From assignment_history.reason
  changedByName: string | null;
}

// Calculate tenures for a given relationship type
function calculateTenures(
  history: AssignmentHistoryEntry[],
  tenureType: 'driver1' | 'driver2' | 'trailer' | 'truck'
): Tenure[]
```

**Algorithm:**
1. Sort history chronologically (oldest first)
2. Track "current state" for the entity slot
3. When state changes:
   - Close previous tenure with end date and reason
   - Open new tenure with start date
4. Merge consecutive tenures for same entity within 7-day threshold
5. Mark final tenure as "Current" if entity still assigned

### 2. Update Database RPC (Optional Enhancement)
The current `get_assignment_history` RPC returns raw events. We could add a new RPC `get_assignment_tenures` that performs tenure calculation in SQL for better performance, but the client-side approach is simpler to implement first.

### 3. Redesign AssignmentHistoryDialog Component

**New Component Structure:**
```text
AssignmentHistoryDialog.tsx
├── TenureCard.tsx          (displays single tenure with timeline bar)
├── TenureList.tsx          (list of TenureCards with scroll)
└── TenureEmptyState.tsx    (no history message)
```

**TenureCard Features:**
- Entity name (driver name, truck#, trailer#) 
- Date range: "MM/DD/YYYY - MM/DD/YYYY" or "MM/DD/YYYY - Current"
- Duration in days/weeks
- Visual progress bar showing relative position in timeline
- "Reason ended" if available
- "Current" badge with green styling for active assignments
- Show "No driver/trailer assigned" periods as gaps

### 4. File Changes Summary

| File | Change |
|------|--------|
| `src/utils/tenureCalculator.ts` | **NEW** - Tenure calculation logic |
| `src/components/AssignmentHistoryDialog.tsx` | **MAJOR** - Complete UI redesign |
| `src/components/TenureCard.tsx` | **NEW** - Individual tenure display |
| `src/hooks/useAssignmentHistory.ts` | Minor - Increase default limit if needed |

### 5. UI/UX Details

**Tenure Card Design:**
- Clean card with subtle border
- Large entity name as primary text
- Date range as secondary text with duration in parentheses
- Green "Current" badge for active assignments
- Gray text for ended assignments
- Optional: Mini timeline bar showing relative position

**Timeline Visualization (Optional):**
- Horizontal bar under each tenure
- Filled portion represents tenure duration relative to oldest entry
- Helps users visually understand overlap and gaps

**Sorting:**
- Most recent tenures first (descending by start date)
- "Current" assignment always at top

### 6. Edge Cases to Handle

1. **Same-day changes**: Multiple assignments in one day - show each as separate entry
2. **Gap periods**: When entity was unassigned - optionally show as "No assignment" blocks
3. **Legacy data**: History entries without `old_*` columns - handle gracefully
4. **Team drivers**: Show both driver1 and driver2 slots separately or combined
5. **Deleted entities**: Show "Unknown Driver" or "Deleted Trailer #X" using existing fallback patterns

## Benefits

1. **Clarity**: Users immediately see "John drove this truck for 56 days"
2. **Context**: Reasons for changes are attached to the tenure that ended
3. **Visual**: Duration shown in days/weeks, not just timestamps
4. **Simpler**: Fewer cards to scroll through (tenures vs events)
5. **Actionable**: Easy to spot short tenures that might indicate problems
