
# Direct Cache Update for truck_notes Realtime

## Problem
Currently, any change to `truck_notes` would trigger a full refetch of all truck notes for the entire office. The user wants only the specific changed truck note to be updated in the cache, avoiding unnecessary network requests and UI updates for unrelated data.

## Solution
Implement a targeted cache update strategy using `setQueryData` instead of `invalidateQueries`, following the same pattern used in `useOrdersRealtime.ts`.

## Technical Approach

### File: `src/hooks/useReportsDateWindowAdapter.ts`

**1. Add a new ref for the truck_notes channel (near line 387)**

```typescript
const truckNotesChannelRef = useRef<RealtimeChannel | null>(null);
```

**2. Add a new useEffect to subscribe to truck_notes changes with direct cache update**

```typescript
// Subscribe to truck_notes realtime changes with DIRECT cache update (no refetch)
useEffect(() => {
  if (!scopeEnabled) return;
  
  const channel = supabase
    .channel("adapter-truck-notes-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "truck_notes" },
      async (payload) => {
        const eventType = payload.eventType;
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;
        const noteId = newRecord?.id || oldRecord?.id;
        const driverId = newRecord?.driver_id || oldRecord?.driver_id;
        
        console.log(`[adapter] truck_notes realtime: ${eventType} for driver ${driverId}`);
        
        // Direct cache update using setQueryData (no refetch)
        queryClient.setQueryData(
          ["adapter-truck-notes", priorityOffice],
          (oldNotes: any[] | undefined) => {
            if (!oldNotes) return oldNotes;
            
            if (eventType === "DELETE") {
              // Remove the deleted note from cache
              return oldNotes.filter((n) => n.id !== noteId);
            }
            
            if (eventType === "INSERT") {
              // Add the new note to cache (if driver is in scope)
              if (driverIdsForScope.includes(driverId)) {
                return [...oldNotes, newRecord];
              }
              return oldNotes;
            }
            
            if (eventType === "UPDATE") {
              // Update the specific note in cache
              const existingIndex = oldNotes.findIndex((n) => n.id === noteId);
              if (existingIndex >= 0) {
                const updated = [...oldNotes];
                updated[existingIndex] = newRecord;
                return updated;
              }
              // If not found but driver is in scope, add it
              if (driverIdsForScope.includes(driverId)) {
                return [...oldNotes, newRecord];
              }
            }
            
            return oldNotes;
          }
        );
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[adapter] Subscribed to truck_notes realtime");
      }
    });
  
  truckNotesChannelRef.current = channel;
  
  return () => {
    if (truckNotesChannelRef.current) {
      supabase.removeChannel(truckNotesChannelRef.current);
      truckNotesChannelRef.current = null;
    }
  };
}, [scopeEnabled, queryClient, priorityOffice, driverIdsForScope]);
```

## Key Differences from Invalidation Approach

| Aspect | invalidateQueries | setQueryData (our approach) |
|--------|-------------------|------------------------------|
| Network | Triggers full refetch | No network request |
| Performance | Fetches all notes again | Updates only changed item |
| Latency | ~200-500ms round trip | Instant (~0ms) |
| UI Update | Entire list re-renders | Only affected row updates |

## Data Flow

```text
Supabase Realtime Event (truck_notes change)
                │
                ▼
    Realtime Subscription Handler
                │
                ▼
    queryClient.setQueryData()
    ┌───────────────────────────┐
    │ Update specific note in   │
    │ ["adapter-truck-notes"]   │
    │ cache array               │
    └───────────────────────────┘
                │
                ▼
    React Query triggers re-render
    for components using this cache
                │
                ▼
    Only affected truck row updates
```

## Testing Plan
1. Open `/reports` in two browser tabs (Tab A and Tab B)
2. Edit a truck note in Tab A (e.g., change "Test note" to "Updated note")
3. Verify Tab B updates the note immediately without network requests
4. Check browser DevTools Network tab - no `truck_notes` API calls should occur
5. Check console for `[adapter] truck_notes realtime: UPDATE` log message
