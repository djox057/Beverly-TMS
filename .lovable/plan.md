

# Red Cell / Lost Day Notes Investigation & Documentation

## Problem Summary

Lost day notes (displayed in red cells on the Reports page) are correctly saved to the database but **disappear after page refresh** when there's a load with a pickup date the next day. The red cell still appears but shows "Empty" or "Lost day" instead of the saved custom note.

## Root Cause Analysis

After extensive investigation, the issue is in the **data fetching scope**. The lost_day_notes query in `useReportsDateWindowAdapter.ts` fetches notes using `driverIdsForScope`:

```typescript
// Line 359-365 in useReportsDateWindowAdapter.ts
const { data: lostDayNotes } = useQuery({
  queryKey: ["adapter-lost-day-notes", priorityOffice, modeKeySuffix],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("lost_day_notes")
      .select("*")
      .in("driver_id", driverIdsForScope);  // <-- Scope filtering
    if (error) throw error;
    return data || [];
  },
  enabled: scopeEnabled,
});
```

The problem: `driverIdsForScope` is calculated from `dateWindowHook.driverIds`, which comes from the orders that fall within the date window. When there's a load with pickup the next day:

1. The red cell date has NO orders for that driver on that specific date
2. The date window calculation might not include that driver in `driverIdsForScope` for certain edge cases
3. The `lost_day_notes` query doesn't fetch the note because the driver isn't in scope

**Key insight**: The `driverIdsForScope` is derived from which drivers have orders in the visible date window, but `lost_day_notes` should be fetched for ALL drivers in the current dispatcher's fleet, regardless of whether they have orders.

## Files Involved

### 1. Database Table: `lost_day_notes`
- Unique constraint: `(driver_id, date)`
- Fields: `id`, `driver_id`, `date`, `note`, `note_type`, `updated_by`, `updated_at`
- `note_type` values: `home_time`, `game_over`, or `null` (custom note)

### 2. `src/hooks/useReportsDateWindowAdapter.ts`
- **Lines 359-370**: Fetches `lost_day_notes` with `.in("driver_id", driverIdsForScope)`
- **Lines 933-938**: Groups notes by driver_id into `lostNotesByDriverId` map
- **Lines 1221-1222**: Attaches notes to truck object as both `lost_day_notes` and `lostDayNotes`

### 3. `src/hooks/useReportsDateWindow.ts`
- **Lines 395-501**: Calculates `driverIds` for the scope
- Fetches drivers based on trucks and dispatcher assignments
- Does NOT directly include all drivers for lost_day_notes purposes

### 4. `src/hooks/useReports.ts`
- **Lines 576-693**: `updateLostDayNote` mutation with optimistic updates
- Patches cache correctly, but the refetch on page load uses wrong scope

### 5. `src/pages/Reports.tsx`
- **Lines 1451-1480**: `getLostDayNote()` inline helper that retrieves note from `truck.lost_day_notes`
- **Lines 2324-2327**: Renders the note in red cells via `{getLostDayNote(day)}`

### 6. `src/pages/Reports/helpers.ts`
- **Lines 264-291**: Global `getLostDayNote()` helper (same logic)
- **Lines 297-308**: `isGameOverDay()` helper

## Technical Flow

### On Save (Works Correctly)
```
User clicks Save → updateLostDayNote mutation → 
  1. Upserts to database ✓
  2. Optimistic update to cache ✓
  3. Note displays immediately ✓
```

### On Refresh (Bug Occurs)
```
Page loads → useReportsDateWindowAdapter →
  1. dateWindowHook.driverIds calculated from orders in date window
  2. lost_day_notes fetched with .in("driver_id", driverIdsForScope)
  3. If driver not in driverIdsForScope → note not fetched
  4. truck.lost_day_notes is empty → getLostDayNote returns "Empty"/"Lost day"
```

## Proposed Fix

The lost_day_notes query should use a separate driver scope that includes ALL active drivers for the current dispatcher's fleet, not just drivers who have orders in the date window.

**Option A**: Modify the adapter to fetch lost_day_notes using all driver IDs from the drivers query (not the date-window-filtered driverIds)

**Option B**: Ensure `driverIdsForScope` always includes all drivers regardless of orders

## Code Snippets for Reference

### How notes are fetched (problematic)
```typescript
// useReportsDateWindowAdapter.ts:359-370
const { data: lostDayNotes } = useQuery({
  queryKey: ["adapter-lost-day-notes", priorityOffice, modeKeySuffix],
  queryFn: async () => {
    // BUG: driverIdsForScope is derived from orders, 
    // not all drivers in the fleet
    const { data, error } = await supabase
      .from("lost_day_notes")
      .select("*")
      .in("driver_id", driverIdsForScope);
    if (error) throw error;
    return data || [];
  },
  enabled: scopeEnabled,
});
```

### How notes are attached to trucks
```typescript
// useReportsDateWindowAdapter.ts:933-938, 1221-1222
const lostNotesByDriverId = new Map<string, any[]>();
for (const note of lostDayNotes || []) {
  const existing = lostNotesByDriverId.get(note.driver_id) || [];
  existing.push(note);
  lostNotesByDriverId.set(note.driver_id, existing);
}

// Later, when building truck object:
group.trucks.push({
  // ...
  lost_day_notes: driverLostNotes,  // from lostNotesByDriverId
  lostDayNotes: driverLostNotes,
});
```

### How notes are displayed
```typescript
// Reports.tsx:1451-1480
const getLostDayNote = (date: Date): string => {
  const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
  const lostDayNote = allLostDayNotes.find(
    (note: any) => String(note?.date || "").slice(0, 10) === dateStr
  );

  if (!lostDayNote) {
    // Returns "Empty", "Lost day", or "No pre-book" - THE BUG MANIFESTATION
    if (isSameDay(checkDate, today)) return "Empty";
    return "Lost day";
  }

  return lostDayNote.note || "Lost day";
};
```

## Implementation Steps

1. Create `docs/red_cell.md` with this documentation
2. Fix the `driverIdsForScope` calculation in `useReportsDateWindowAdapter.ts` to ensure all fleet drivers are included for lost_day_notes queries
3. Alternatively, create a separate query for lost_day_notes that uses a broader driver scope

## File to Create

```
docs/red_cell.md
```

This documentation file will contain all the above analysis, code snippets, and fix recommendations.

