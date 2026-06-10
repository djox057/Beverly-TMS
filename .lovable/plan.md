## Problem

On Reports, after a BOL/POD upload (and sometimes after unrelated edits), one or more orders disappear from the grid and stay gone until the page is refreshed.

## Root cause (the persistent-disappear case)

`src/hooks/useReportsDateWindowAdapter.ts` → `flushPending` (lines ~1330–1407) re-fetches an order whenever realtime fires, then re-evaluates scope:

```ts
const inScope =
  (fullOrder.driver1_id && currentDriverIds.has(fullOrder.driver1_id)) ||
  (fullOrder.driver2_id && currentDriverIds.has(fullOrder.driver2_id));
if (inScope) patchOrderInGlobalStore(fullOrder, false);
else removeOrderFromGlobalStore(fullOrder.id, false);   // ← evicts permanently
```

`currentDriverIds` (`driverIdsSetRef.current`) is the **current office scope**. But the global store can hold orders whose driver is *no longer* in that scope, because:

- The original window fetch (`useReportsDateWindow`) seeds the store using a broader date/driver query (e.g. recovery loads, transfer drivers, last-load fallbacks, off-duty dispatchers reconstructed in Reports).
- A driver can be reassigned (`drivers.dispatcher_id` change) between the seed fetch and the realtime event, shrinking `driverIdsForScope` while the order is still rightfully visible.
- `driverIdsForScope` excludes transfer-only drivers; the order_transfers realtime path adds the order to `pendingOrderIds`, then flush re-checks against `driver1/driver2` only and evicts it.

A BOL/POD upload reliably triggers this because the same handler also updates `pickup_drops.checked_out_at`, `orders.weight_bol`, and (sometimes) `orders.status='delivered'` (Reports.tsx ~1502, 1525, 1539, 1550) → multiple realtime events → flush re-evaluates → if any of the conditions above hits, the order is removed and never re-added (no realtime brings it back).

The earlier flicker symptom (appearing/disappearing during the upload) is the same code path with a transient scope set, and is also addressed by the fix below.

## Fix

### A. Stop the destructive scope re-check in `flushPending`
`src/hooks/useReportsDateWindowAdapter.ts` (~1382–1391):
- If `hasOrderInGlobalStore(fullOrder.id)` returned true at enqueue time, **always patch**, never remove based on scope. The seed fetch is the authority on what belongs in the store; realtime only updates fields.
- Only remove when the realtime event itself proves the order should leave the grid: the order row was DELETEd, or `canceled` flipped to true, or `pickup_datetime` moved entirely outside the active date window. Encode that as an explicit `shouldRemove` check, not a scope diff.

### B. Same fix in the orders realtime callback
`src/hooks/useReportsDateWindowAdapter.ts` (~1431–1460) DELETE branch: keep scope check (a DELETE is unambiguous). For INSERT/UPDATE: if `hasOrderInGlobalStore(orderId)` already, always enqueue. Today line 1455 already includes this OR-clause, but the subsequent flush re-check (A) can still drop it — A must be the source of truth.

### C. Make the pickup_drops / order_transfers realtime not depend on scope
Same file (~1463–1483): keep the current `inStore || alreadyPending` gate, but extend it so that if `inStore` was true at *any* point in the last flush cycle, the order stays included even when the related order row hasn't been refetched yet. Practically: enqueue using `hasOrderInGlobalStore` (already correct) and let A guarantee it's not silently removed.

### D. Coalesce + patch order_files cache (fixes the flicker symptom)
Same file:
- Introduce a single debounced helper (250 ms) for `invalidateQueries({ queryKey: ["adapter-order-files"], refetchType: "active" })` and route the two existing call sites (order_files realtime handler ~983 and `flushPending` ~1397) through it.
- In the order_files realtime handler, patch the module-level `orderFilesCacheByOrderId` map and the React Query cache in place (append on INSERT, replace by id on UPDATE, filter by id on DELETE) using the payload `new`/`old` rows. Only fall back to the debounced invalidate when the payload is missing required fields.

### E. Drop redundant blanket invalidations on the upload path
- `src/pages/Reports.tsx` (~1627–1628): remove `invalidateQueries({ queryKey: ["reports"], exact:false })` and `["orders"]`. The store + adapter-order-files refetch already drives the grid.
- `src/hooks/useReportsRealtime.ts` (line 75): drop `queryClient.invalidateQueries({ queryKey: ["reports"], exact:false })`. The `injectOrdersIntoGlobalStore` call above it already notifies the date-window pipeline.

### F. Align synthetic upload rows with realtime inserts
`src/pages/Reports.tsx` (~1586–1625): keep synthetic `temp-upload-*` rows, but when the in-place patcher (D) sees a real `order_files` INSERT whose `file_path` matches a synthetic row, replace the synthetic entry (by id) instead of appending a duplicate.

## Files

- `src/hooks/useReportsDateWindowAdapter.ts` — A, B, C, D.
- `src/hooks/useReportsRealtime.ts` — E.
- `src/pages/Reports.tsx` — E, F.

No DB / schema / business-logic changes.

## Verification

1. Reproduce the disappear case: upload a POD on a transfer/recovery load (driver2 on the load doesn't belong to the active office). Today the row vanishes until refresh; after the fix it stays.
2. Standard upload: BOL on a multi-stop load — row stays, badge updates once, no flicker.
3. Console: a single `[adapter] order_files realtime: INSERT` per upload; no `[adapter] Orders realtime: batch-fetching` followed by the order silently leaving the store. Add a temporary `console.warn` in the new `shouldRemove` branch to confirm it never fires for in-store orders during uploads.
4. Reassign a driver to a different office while their load is on screen → load stays (it was in the original window), and the next refresh re-scopes correctly.
