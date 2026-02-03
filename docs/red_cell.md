# Red Cell / Lost Day Notes Investigation & Documentation

## Problem Summary

Lost day notes (displayed in red cells on the Reports page) are correctly saved to the database but **disappear after page refresh** when there's a load with a pickup date the next day. The red cell still appears but shows "Empty" or "Lost day" instead of the saved custom note.

## Root Cause Analysis

After extensive investigation, the issue was identified as a **stale closure bug** in the lost_day_notes query in `useReportsDateWindowAdapter.ts`.

### Original Problematic Code

```typescript
// Line 359-365 in useReportsDateWindowAdapter.ts (BEFORE FIX)
const { data: lostDayNotes } = useQuery({
  queryKey: ["adapter-lost-day-notes", priorityOffice, modeKeySuffix],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("lost_day_notes")
      .select("*")
      .in("driver_id", driverIdsForScope);  // <-- STALE CLOSURE
    if (error) throw error;
    return data || [];
  },
  enabled: scopeEnabled,
});
```

### Why It Failed

The `driverIdsForScope` variable was captured at the time the component first rendered:

1. On initial mount, `driverIdsForScope` might be empty or partial while the initial data loads
2. When React Query's `queryFn` executed, it used the captured (stale) value
3. If the driver's ID wasn't in that initial scope, their `lost_day_notes` weren't fetched
4. On subsequent renders, the closure still held the old value

### Fix Applied

The fix follows the same pattern used for `order_files` - passing driver IDs via the query key:

```typescript
// AFTER FIX
const driverIdsForLostNotes = useMemo(() => {
  return JSON.stringify(driverIdsForScope);
}, [driverIdsForScope]);

const { data: lostDayNotes } = useQuery({
  queryKey: ["adapter-lost-day-notes", priorityOffice, modeKeySuffix, driverIdsForLostNotes],
  queryFn: async ({ queryKey }) => {
    // Extract driver IDs from query key to avoid stale closure
    const driverIdsJson = queryKey[3] as string;
    const driverIds: string[] = driverIdsJson ? JSON.parse(driverIdsJson) : [];
    
    if (driverIds.length === 0) return [];
    
    const { data, error } = await supabase
      .from("lost_day_notes")
      .select("*")
      .in("driver_id", driverIds);
    if (error) throw error;
    return data || [];
  },
  // ...
});
```

## Files Involved

### 1. Database Table: `lost_day_notes`
- Unique constraint: `(driver_id, date)`
- Fields: `id`, `driver_id`, `date`, `note`, `note_type`, `updated_by`, `updated_at`
- `note_type` values: `home_time`, `game_over`, or `null` (custom note)

### 2. `src/hooks/useReportsDateWindowAdapter.ts`
- **Lines 359-390**: Fixed lost_day_notes query with proper query key pattern
- **Lines 933-938**: Groups notes by driver_id into `lostNotesByDriverId` map
- **Lines 1221-1222**: Attaches notes to truck object as both `lost_day_notes` and `lostDayNotes`

### 3. `src/hooks/useReportsDateWindow.ts`
- **Lines 395-504**: `fetchDriverIdsForOffice()` - fetches ALL active drivers for office
- Returns complete driver list that should be used for lost_day_notes

### 4. `src/hooks/useReports.ts`
- **Lines 576-693**: `updateLostDayNote` mutation with optimistic updates
- Works correctly - patches cache immediately

### 5. `src/pages/Reports.tsx`
- **Lines 1451-1480**: `getLostDayNote()` inline helper
- **Lines 2324-2327**: Renders the note in red cells

### 6. `src/pages/Reports/helpers.ts`
- **Lines 264-291**: Global `getLostDayNote()` helper
- **Lines 297-308**: `isGameOverDay()` helper

## Technical Flow

### On Save (Works Correctly)
```
User clicks Save → updateLostDayNote mutation → 
  1. Upserts to database ✓
  2. Optimistic update to cache ✓
  3. Note displays immediately ✓
```

### On Refresh (FIXED)
```
Page loads → useReportsDateWindowAdapter →
  1. dateWindowHook.driverIds populated with ALL fleet drivers
  2. driverIdsForLostNotes memo updates with full list
  3. Query key changes → triggers fresh fetch
  4. lost_day_notes fetched for ALL drivers
  5. Notes correctly attached to trucks
  6. getLostDayNote returns custom note ✓
```

## How Notes Are Displayed

```typescript
// Reports.tsx:1451-1480
const getLostDayNote = (date: Date): string => {
  const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
  const lostDayNote = allLostDayNotes.find(
    (note: any) => String(note?.date || "").slice(0, 10) === dateStr
  );

  if (!lostDayNote) {
    if (isSameDay(checkDate, today)) return "Empty";
    return "Lost day";
  }

  return lostDayNote.note || "Lost day";
};
```

## Testing Checklist

After the fix:

1. ✅ Save a custom note in a red cell (e.g., "Driver sick")
2. ✅ Refresh the page
3. ✅ Note should persist and display correctly
4. ✅ Works even when next load has pickup date the following day
5. ✅ Works across office tab switches
6. ✅ Works in Individual Mode
