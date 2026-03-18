

## Analysis of Reports Realtime Logs

### What the logs tell us

The diagnostic logging is working correctly. Here's the breakdown:

1. **`pickup_drops UPDATE/INSERT: inStore=false`** -- These events are for orders belonging to **other offices/dispatchers** not currently displayed. They are correctly ignored.

2. **`order_files realtime: INSERT for order X`** -- File uploads are detected and processed (adapter-order-files re-runs in 0-1ms from cache).

3. **`Orders realtime: batch-fetching 1 changed orders`** -- Order changes ARE being detected and flushed correctly, with pickup_drops refetched (e.g., "fetched 2 pickup_drops, 0 transfers for 1 orders").

4. **`truck_notes realtime: UPDATE ignored - driver X not in scope`** -- Correctly ignoring out-of-scope truck note changes.

### The race condition problem

There IS a gap in the pickup_drops handler. Currently it only checks `hasOrderInGlobalStore(orderId)`. But there are two scenarios where this fails:

- **New order race**: `pickup_drops INSERT` arrives before the `orders INSERT` has been flushed into the global store
- **Pending but not yet flushed**: An order is already in `pendingOrderIds` (queued by the orders handler) but `pickup_drops` fires before flush completes

In both cases, the pickup_drops event is silently dropped. The subsequent `orders` flush will refetch pickup_drops anyway, so the data is eventually correct -- but if ONLY a pickup_drop changes (no order change), the update is permanently missed for in-scope orders.

### Fix plan

**File: `src/hooks/useReportsDateWindowAdapter.ts`**

**Change 1**: In the `pickup_drops` handler (lines 1256-1263), add a fallback check against `pendingOrderIds` -- if the order is already queued for flush, it's relevant:

```typescript
.on("postgres_changes", { event: "*", schema: "public", table: "pickup_drops" }, (payload) => {
  const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
  const inStore = orderId ? hasOrderInGlobalStore(orderId) : false;
  const alreadyPending = orderId ? pendingOrderIds.has(orderId) : false;
  console.log(`[adapter] pickup_drops ${payload.eventType}: order_id=${orderId}, inStore=${inStore}, pending=${alreadyPending}`);
  if (orderId && (inStore || alreadyPending)) {
    pendingOrderIds.add(orderId);
    scheduleFlush();
  }
})
```

**Change 2**: Apply the same fix to the `order_transfers` handler (lines 1266-1273).

**Change 3**: Reduce log noise -- downgrade the `inStore=false` + `pending=false` case to a debug-level log (or remove it), since these are expected background events from other offices.

### Why this is safe

- If `inStore=true`: order is displayed, pickup_drops change matters -- flush and refetch
- If `alreadyPending=true`: order was just created/updated, pickup_drops is part of the same transaction -- the flush will pick up everything
- If both false: order is genuinely out of scope -- correctly ignored
- The `flushPending` function always refetches pickup_drops alongside orders, so no extra network calls are needed

### What this does NOT fix

The logs confirm the system is generally working. If you're seeing a specific order in your current view where stops don't update in real-time, that would indicate a different issue (the order IS in the store but something in the transform chain drops the update). To verify: edit a stop on an order you can see in Reports, and check if the log shows `inStore=true` for that specific order.

