

# Add Realtime Orders/Stops/Transfers Subscriptions to Reports Page

## Overview
Add a new realtime subscription in `useReportsDateWindowAdapter.ts` that listens for changes on `orders`, `pickup_drops`, and `order_transfers` tables, then patches the `globalAccumulatedOrders` store directly. This makes new orders, status changes, driver reassignments, and stop changes appear instantly on the Reports page.

## Prerequisite Check (Done)
- REPLICA IDENTITY on `orders` table: **FULL** (confirmed via `relreplident = 'f'`). The `old` payload will include all columns, so checking previous driver IDs on UPDATE is safe.

## Changes

### File 1: `src/hooks/useReportsDateWindow.ts`

Export 4 items that are currently module-private:

1. **`fetchPickupDropsForOrders`** -- Already a pure async function at line 84. Add export keyword and a comment marking it as a pure async utility with no hook dependencies.

2. **`fetchOrderTransfersForOrders`** -- Already a pure async function at line 104. Same treatment.

3. **`patchOrderInGlobalStore(order)`** -- New function. Sets `globalAccumulatedOrders.set(order.id, order)`, increments `globalOrdersVersion`, and calls `notifyOrdersListeners()` (the existing `versionListeners.forEach(...)` pattern).

4. **`removeOrderFromGlobalStore(orderId)`** -- New function. Calls `globalAccumulatedOrders.delete(orderId)`, increments `globalOrdersVersion`, notifies listeners.

### File 2: `src/hooks/useReportsDateWindowAdapter.ts`

Add a new `useEffect` block (after the existing lost_day_notes subscription, around line 957) with a realtime channel subscribing to three tables.

**Channel setup:**
- Name: `adapter-orders-realtime-{office}`
- Tables: `orders` (event: `*`), `pickup_drops` (event: `*`), `order_transfers` (event: `*`)

**Debounce mechanism (matching `useOrdersRealtime` pattern):**
- Module-local `pendingOrderIds: Set<string>` and `pendingDeletes: Set<string>` inside the effect closure
- 1-second debounce timer via `setTimeout`

**Event handlers:**

*Orders table:*
- INSERT: If `new.driver1_id` or `new.driver2_id` is in `driverIdsSetRef`, add `new.id` to `pendingOrderIds`, schedule flush.
- UPDATE: If `old.driver1_id`, `old.driver2_id`, `new.driver1_id`, or `new.driver2_id` is in `driverIdsSetRef`, add order ID to `pendingOrderIds`, schedule flush.
- DELETE: If `old.driver1_id` or `old.driver2_id` is in `driverIdsSetRef`, call `removeOrderFromGlobalStore(old.id)` immediately (no fetch needed).

*pickup_drops / order_transfers tables:*
- Any event: Extract `order_id` from `new` or `old`. If `globalAccumulatedOrders.has(order_id)`, add to `pendingOrderIds`, schedule flush.

**Flush logic:**
1. Snapshot and clear `pendingOrderIds` and `pendingDeletes`
2. Process deletes: call `removeOrderFromGlobalStore` for each
3. For remaining IDs, batch-fetch: flat orders query + parallel `fetchPickupDropsForOrders` + `fetchOrderTransfersForOrders`
4. **Out-of-scope check (critical):** For each fetched order, verify `driver1_id` or `driver2_id` is in `driverIdsSetRef`. If neither is in scope, call `removeOrderFromGlobalStore` instead of patching (handles driver reassignment away from scope).
5. For in-scope orders, call `patchOrderInGlobalStore`
6. Invalidate `adapter-order-files` with `refetchType: "active"` for affected order IDs (reuses existing invalidation pattern, and `refetchType: "active"` prevents double-render if the file subscription fires independently)

**Cleanup:** Remove channel on unmount, clear debounce timer.

## Edge Cases Handled

1. **REPLICA IDENTITY**: Confirmed FULL on orders table -- `old` payload has all columns.
2. **Out-of-scope reassignment**: After fetching, orders where both `driver1_id` and `driver2_id` are outside `driverIdsSetRef` are removed rather than patched.
3. **Double-render with order_files**: Using `refetchType: "active"` on invalidation ensures it only triggers if the query is actively mounted, and the existing `order_files` subscription uses the same pattern, so at worst it's a no-op refetch.
4. **Stale closures**: Uses `driverIdsSetRef`, `priorityOfficeRef`, and `modeKeySuffixRef` (all already maintained) to read current values inside callbacks.

## Technical Details

### Fetch pattern for flush (reuses existing code)
The flush fetches flat orders with the same column list used by `fetchOrdersForDateWindow`, then calls the exported `fetchPickupDropsForOrders` and `fetchOrderTransfersForOrders` to attach child relations. This keeps the data shape consistent with what `globalAccumulatedOrders` already stores.

### No changes to useOrdersRealtime
The global `useOrdersRealtime` hook continues to patch the `["orders"]` query key family. The new subscription patches the separate `globalAccumulatedOrders` store used only by Reports. These are independent data stores with no overlap.

## Files Modified
1. `src/hooks/useReportsDateWindow.ts` -- Export 2 existing functions, add 2 new functions
2. `src/hooks/useReportsDateWindowAdapter.ts` -- Add orders/pickup_drops/order_transfers realtime subscription

