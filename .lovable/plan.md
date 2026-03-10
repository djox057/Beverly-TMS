

## Problem

Load 546143199 was transferred from Gary Newman to Thomas Rogers, then the transfer was reverted. After revert:
- `orders.is_recovery` = false (correct)
- `orders.driver1_id` = Gary Newman (correct, reverted back)
- `recovery_history.reverted_at` is set (correct)
- But `order_transfers` records still exist with both drivers

The Reports page groups orders by driver using `order_transfers` data (lines 1422-1438 in `useReportsDateWindowAdapter.ts`). It iterates over all `order_transfers` and adds the order to each transfer driver — **without checking if the recovery was reverted**. This causes the load to appear for both the original driver and the former recovery driver.

## Fix

Two changes needed:

### 1. Skip transfer driver grouping when recovery is reverted
In `src/hooks/useReportsDateWindowAdapter.ts`, at the order grouping logic (around line 1422), add a check: only process `order_transfers` for transfer driver assignment when `order.is_recovery` is true. When `is_recovery` is false, the transfer was reverted and the order should only show for the current `driver1_id`/`driver2_id`.

```ts
// Add to transfer drivers — only if order is still a recovery load
if (order.is_recovery) {
  for (const transfer of order.order_transfers || []) {
    // ... existing logic
  }
}
```

### 2. Clean up order_transfers on revert (defensive)
In `src/pages/Reports.tsx` (revert handler, around line 4863), delete the `order_transfers` records for the order after marking recovery as reverted. This prevents stale data from accumulating:

```ts
await supabase.from("order_transfers").delete().eq("order_id", order.id);
```

Also apply the same cleanup in `src/pages/EditOrder.tsx` revert handler if it exists there.

