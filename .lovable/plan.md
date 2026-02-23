

## Fix: Reports Page Realtime Inconsistencies

Two targeted changes in `src/hooks/useReportsDateWindowAdapter.ts` to fix canceled orders persisting and new orders being missed.

### Change 1: Remove canceled orders in flushPending (line ~1111)

Insert a canceled check before the scope check inside the `for (const order of flatOrders)` loop. After assembling `fullOrder`, if `fullOrder.canceled === true`, call `removeOrderFromGlobalStore(fullOrder.id, false)`, push the ID to `affectedOrderIds`, and `continue`.

```typescript
// After line 1118 (fullOrder assembly), before the existing scope check:
if (fullOrder.canceled) {
  removeOrderFromGlobalStore(fullOrder.id, false);
  affectedOrderIds.push(fullOrder.id);
  continue;
}
```

This mirrors the initial load filtering and ensures canceled orders are evicted from the store on any realtime update.

### Change 2: Broaden relevance check for INSERT/UPDATE events (line ~1183)

Add `hasOrderInGlobalStore(orderId)` to the `relevant` condition so that orders already in the store (e.g., after driver reassignment to out-of-scope driver) still trigger a re-fetch and subsequent removal via the scope check in `flushPending`.

```typescript
const relevant =
  (newRecord?.driver1_id && currentDriverIds.has(newRecord.driver1_id)) ||
  (newRecord?.driver2_id && currentDriverIds.has(newRecord.driver2_id)) ||
  (oldRecord?.driver1_id && currentDriverIds.has(oldRecord.driver1_id)) ||
  (oldRecord?.driver2_id && currentDriverIds.has(oldRecord.driver2_id)) ||
  hasOrderInGlobalStore(orderId);
```

### Verification Notes

- `removeOrderFromGlobalStore` is a no-op on unknown IDs (guarded by `Map.delete` return value)
- `hasOrderInGlobalStore` re-fetch + out-of-scope removal path is already handled cleanly in `flushPending`
- INSERT payloads always include full row data from Supabase, so `newRecord.driver1_id` is always populated
- Single file change, no new queries or subscriptions

