
# Fix Instant Truck Notes Updates on Reports Page

## Problem Summary
When a user edits a truck note on the Reports page:
- The change appears in Note History immediately
- But the note text in the main Reports table does NOT update until page refresh
- Other users also don't see the change instantly (realtime exists but has latency)

## Root Cause Analysis

The data flow currently works like this:

```text
User edits note
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ updateTruckNote mutation (in useReports.ts)                  │
│                                                              │
│  onMutate (optimistic update):                               │
│    ✅ Updates ["reports", "priority"]    ← LEGACY keys       │
│    ✅ Updates ["reports", "full"]        ← LEGACY keys       │
│    ❌ Does NOT update adapter cache                          │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Database write → Supabase Realtime                           │
│                                                              │
│  100-500ms delay before realtime event fires                 │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Realtime subscription (in useReportsDateWindowAdapter.ts)    │
│                                                              │
│  ✅ Patches ["adapter-truck-notes", priorityOffice]          │
│  (But delayed - not instant for editing user)                │
└──────────────────────────────────────────────────────────────┘
```

The adapter uses `["adapter-truck-notes", priorityOffice]` for its data, but the mutation's optimistic update only targets the legacy query keys.

## Solution

Modify the `updateTruckNote` mutation in `useReports.ts` to ALSO optimistically update the adapter's truck notes cache.

### Changes Required

**File: `src/hooks/useReports.ts`**

In the `updateTruckNote` mutation's `onMutate` handler:

1. **Cancel adapter queries** to prevent race conditions:
   ```typescript
   await queryClient.cancelQueries({ queryKey: ["adapter-truck-notes"] });
   ```

2. **Snapshot adapter cache** for rollback:
   ```typescript
   const previousAdapterNotes = queryClient.getQueriesData({ 
     queryKey: ["adapter-truck-notes"] 
   });
   ```

3. **Optimistically update adapter cache** by patching the note directly:
   ```typescript
   queryClient.setQueriesData(
     { queryKey: ["adapter-truck-notes"] },
     (oldNotes: any[] | undefined) => {
       if (!oldNotes) return oldNotes;
       const existingIndex = oldNotes.findIndex((n) => n.driver_id === driverId);
       if (existingIndex >= 0) {
         const updated = [...oldNotes];
         updated[existingIndex] = {
           ...updated[existingIndex],
           note,
           updated_at: new Date().toISOString(),
         };
         return updated;
       }
       // If no existing note for this driver, add a new entry
       return [...oldNotes, {
         id: `temp-${driverId}`,
         driver_id: driverId,
         truck_id: truckId?.startsWith('driver-') ? null : truckId,
         note,
         updated_at: new Date().toISOString(),
       }];
     }
   );
   ```

4. **Rollback adapter cache on error**:
   ```typescript
   // In onError handler
   if (context?.previousAdapterNotes) {
     context.previousAdapterNotes.forEach(([queryKey, data]: [any, any]) => {
       queryClient.setQueryData(queryKey, data);
     });
   }
   ```

### Data Flow After Fix

```text
User edits note
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ updateTruckNote mutation                                     │
│                                                              │
│  onMutate (optimistic update):                               │
│    ✅ Updates ["reports", "priority"]                        │
│    ✅ Updates ["reports", "full"]                            │
│    ✅ Updates ["adapter-truck-notes", *]  ← NEW              │
│                                                              │
│  UI updates INSTANTLY for editing user                       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Database write → Supabase Realtime                           │
│                                                              │
│  Broadcasts to ALL connected users                           │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Realtime subscription                                        │
│                                                              │
│  ✅ Patches ["adapter-truck-notes", priorityOffice]          │
│  (Updates UI for OTHER users viewing the page)               │
└──────────────────────────────────────────────────────────────┘
```

## Technical Details

### Why setQueriesData (plural)?

The adapter query key includes `priorityOffice`, so different office tabs have different cache entries:
- `["adapter-truck-notes", "East"]`
- `["adapter-truck-notes", "West"]`
- etc.

Using `setQueriesData` with `{ queryKey: ["adapter-truck-notes"] }` will update ALL matching caches, ensuring the note updates regardless of which office tab is active.

### Edge Cases Handled

1. **Driver without existing note**: The update creates a temporary entry in the cache
2. **Driver without truck (unassigned)**: The `truckId` check handles `driver-{id}` format
3. **Error rollback**: All caches are restored if the mutation fails
4. **Race with realtime**: Realtime may overwrite the optimistic update, but with the same data (idempotent)

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useReports.ts` | Modify `updateTruckNote` mutation's `onMutate` and `onError` handlers |

## Testing Checklist

1. Edit a truck note - verify it updates instantly in the main table
2. Open Note History - verify it shows the new note
3. Have another user viewing the same page - verify their UI updates within 1 second
4. Edit a note for a driver without a truck - verify it still works
5. Simulate network error - verify the note reverts to previous value
6. Switch office tabs and edit notes - verify correct cache is updated
