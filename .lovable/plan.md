

# Fix Truck Note History Not Refreshing

## Problem

When a user opens the note history dialog, TanStack Query serves cached (stale) data from a previous open. The realtime subscription only catches new INSERT events, but with the dedup trigger now skipping duplicate inserts, the subscription fires less often. The result: the dialog shows outdated history.

## Fix

Set `staleTime: 0` on the `useTruckNoteHistory` query so it always refetches when the dialog opens (when `enabled` flips from false to true).

## Technical Details

### File: `src/hooks/useTruckNoteHistory.ts`

Add `staleTime: 0` to the `useQuery` options (around line 88). This ensures that every time the dialog opens and the query becomes enabled, TanStack Query treats the cached data as stale and triggers a background refetch.

```typescript
return useQuery({
  queryKey: ['truck-note-history', driverId],
  queryFn: async () => { /* ... */ },
  enabled: !!driverId,
  staleTime: 0,  // <-- add this
});
```

This is a one-line change. The realtime subscription remains as a bonus for live updates while the dialog stays open.

