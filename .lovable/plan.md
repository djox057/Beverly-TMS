

# Confirmation: Both Pre-Merge Items Verified

## Item 1: No server-side filter on the channel ✅

Line 1227-1276 shows the channel subscription uses:
```typescript
.on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ...)
.on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, ...)
.on("postgres_changes", { event: "*", schema: "public", table: "order_transfers" }, ...)
```

No `filter:` parameter exists on any of the three listeners. The channel receives events for ALL orders regardless of office or driver. Client-side scope checking happens inside the callback via `driverIdsSetRef.current`. Removing `priorityOffice` from the dependency array is safe.

## Item 2: `flushPending` closure is safe ✅

`flushPending` (lines 1100-1218) references only:
- `pendingDeletes`, `pendingOrderIds` — local `Set` objects scoped to the effect closure (not React state)
- `isFlushing` — local boolean in the effect closure
- `removeOrderFromGlobalStore`, `patchOrderInGlobalStore`, `flushGlobalStoreNotifications`, `hasOrderInGlobalStore` — **module-level** functions imported from `useReportsDateWindow` (line 14). They operate on the module-scoped global store, not component state.
- `driverIdsSetRef` — a ref, stable across renders
- `queryClient` — from TanStack, stable object
- `fetchPickupDropsForOrders`, `fetchOrderTransfersForOrders` — module-level imports

No React state setters are called. Fire-and-forget from cleanup is safe — no stale closures, no React warnings.

## Plan: Three surgical edits to `src/hooks/useReportsDateWindowAdapter.ts`

### Change 1 — Flush before cleanup (line 1285-1291)
Replace the cleanup function to call `flushPending()` before clearing the timer and removing the channel.

### Change 2 — Stable channel name (line 1225)
Change from `` `adapter-orders-realtime-${priorityOffice || 'default'}` `` to `"adapter-orders-realtime-global"`.

### Change 3 — Remove `priorityOffice` from deps (line 1293)
Change from `[scopeEnabled, driverIdsForScope.length, priorityOffice, queryClient]` to `[scopeEnabled, driverIdsForScope.length, queryClient]`.

