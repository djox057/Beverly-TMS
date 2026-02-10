

# Performance Fix: Batch Realtime Notifications in Reports

## Problem
Every realtime order change triggers a separate `globalOrdersVersion++` and listener notification, causing the expensive ~450-line `transformedData` memo to re-run N times per batch instead of once. Office switching also leaves stale channels alive due to early-return guards.

## Changes

### File 1: `src/hooks/useReportsDateWindow.ts`

**Add `notify` parameter to `patchOrderInGlobalStore` and `removeOrderFromGlobalStore`; add new `flushGlobalStoreNotifications` function.**

- `patchOrderInGlobalStore(order, notify = true)` -- when `notify` is false, only updates the Map without incrementing version or calling listeners. Default `true` preserves backward compatibility.
- `removeOrderFromGlobalStore(orderId, notify = true)` -- same treatment.
- New export: `flushGlobalStoreNotifications()` -- increments `globalOrdersVersion` once and calls all `versionListeners`. Called after a batch of silent patches/removes.

### File 2: `src/hooks/useReportsDateWindowAdapter.ts`

**Three changes:**

**1. Batch notifications in `flushPending` (lines 991-1082)**

Replace all `patchOrderInGlobalStore(fullOrder)` and `removeOrderFromGlobalStore(id)` calls inside `flushPending` with `notify = false` variants. After all patches and removes are done, call `flushGlobalStoreNotifications()` once. The condition covers all cases -- deletes, in-scope patches, and out-of-scope removes:

```
// After all patches/removes:
const hadChanges = deleteIds.length > 0 || fetchIds.length > 0;
if (hadChanges) {
  flushGlobalStoreNotifications();
}
```

This ensures out-of-scope removes (where `fetchIds` might be empty but removes happened) still trigger notification.

Note: The DELETE handler in the event callback (line 1107) calls `removeOrderFromGlobalStore` directly (outside of flush) -- this one keeps `notify = true` (default) since it's a single immediate operation, not part of a batch.

**2. Fix channel cleanup on office switch (lines 972-973 and 759-760)**

For the orders realtime channel (P5, line 973) and the truck_notes channel (P3, line 760), replace the early-return guard:
```
// Before:
if (ordersRealtimeChannelRef.current) return;

// After:
if (ordersRealtimeChannelRef.current) {
  supabase.removeChannel(ordersRealtimeChannelRef.current);
  ordersRealtimeChannelRef.current = null;
}
```

This ensures a fresh channel is created with the correct scope when `priorityOffice` changes.

**3. Fix order_files channel cleanup (lines 699-736)**

Add `priorityOffice` to the dependency array (line 736) and use a dynamic channel name:
```
.channel(`adapter-order-files-realtime-${priorityOffice || 'default'}`)
```

The existing cleanup function at lines 730-735 already calls `supabase.removeChannel`, so adding the dependency is sufficient.

## Files Modified
1. `src/hooks/useReportsDateWindow.ts` -- Add `notify` param to patch/remove, add `flushGlobalStoreNotifications`
2. `src/hooks/useReportsDateWindowAdapter.ts` -- Batch notifications, fix channel cleanup on office switch, fix order_files channel

## Known Limitation
Single-event updates outside of batch flushes (e.g., a one-off DELETE in the event handler) still trigger a full re-render. This is acceptable -- the batching fix handles the busy-day case where many events arrive within the 1-second window.
