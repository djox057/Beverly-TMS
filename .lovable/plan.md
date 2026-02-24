

# Fix: Double-Counting of Locked Orders in Analytics

## Problem

When an order transitions from unlocked to locked (someone clicks "Lock" on an order), the realtime subscription updates it **in place** in the analytics cache. This means:

1. Order is initially fetched as unlocked and counted in `filteredOrders`
2. It gets locked via realtime UPDATE -- the cache entry is updated with `locked=true`
3. It remains in the cache and continues to be counted in `filteredOrders`
4. The recompute runs (or already ran) and includes it in precomputed aggregates
5. The order is now **counted twice**: once in precomputed aggregates, once in live orders

The growing gap ($1,200 becoming $1,350) confirms this: each time another order gets locked during the session, the double-count increases.

**SQL verification** shows the data sources are perfectly consistent:
- Precomputed: $22,396,698.58 (12,551 orders)
- Unlocked: $811,100.01 (468 orders)
- Sum: $23,207,798.59 = True total from orders table

The problem is purely in the UI merge logic.

## Root Cause

The previous fix (removing the `isPrecomputed && order.locked` filter from `filteredOrders`) was incorrect. It was removed to avoid "data gaps" for orders locked between recomputes, but this created a worse problem: double-counting after every recompute.

## Solution

Two changes to ensure locked orders are never double-counted:

### 1. `src/pages/Analytics.tsx` -- Restore locked order exclusion in `filteredOrders`

In the `filteredOrders` memo (around line 1099), re-add the filter to exclude locked orders when in precomputed mode:

```typescript
const filtered = orders?.filter(order => {
  // In precomputed mode, exclude locked orders from live count.
  // They are already included in precomputed aggregates.
  // When an unlocked order gets locked mid-session via realtime,
  // it briefly disappears until the next aggregate rebuild -- this
  // is preferable to the alternative of double-counting.
  if (isPrecomputed && order.locked) {
    return false;
  }
  // ... rest of filter unchanged
```

Also re-add `isPrecomputed` to the `useMemo` dependency array.

### 2. `src/pages/Analytics.tsx` -- Same fix in `driverAnalyticsAllTime`

The driver tier calculation loop also needs to skip locked orders in precomputed mode (same pattern, around line 1785).

### 3. `src/hooks/useOrdersRealtime.ts` -- Remove locked orders from analytics cache on lock

When an order transitions to `locked=true` via realtime, instead of updating it in the analytics cache, **remove it**. This prevents the brief window where both the locked order and its precomputed aggregate coexist.

In `updateAllOrdersCaches`, when updating an analytics cache entry with a locked order, treat it as a delete:

```typescript
const isAnalytics = qk.length > 1 && (qk[1] === 'analytics-full');
if (isAnalytics && transformedOrder.locked) {
  // Remove from analytics cache -- it's covered by precomputed aggregates
  return old.filter((o) => o.id !== orderId);
}
```

This change goes at line ~166, modifying the existing guard to also handle UPDATE-to-locked (not just INSERT).

## Why This Is Correct

- **No double-counting**: Locked orders only appear in precomputed aggregates, never in live `filteredOrders`
- **No data gaps after recompute**: The recompute just ran and matched 12,551 locked orders perfectly
- **Minimal gap between recomputes**: When an order gets locked mid-session, it's removed from live cache immediately. It will appear in aggregates at the next recompute (3 AM UTC or manual trigger). This brief gap (hours at most) is far less noticeable than the current growing double-count
- **Growing gap eliminated**: The $1,200-$1,350 creep stops immediately

## Summary of Changes

| File | Change |
|---|---|
| `src/pages/Analytics.tsx` | Re-add `if (isPrecomputed && order.locked) return false` in `filteredOrders` and `driverAnalyticsAllTime` |
| `src/hooks/useOrdersRealtime.ts` | Remove locked orders from analytics cache instead of updating them |
