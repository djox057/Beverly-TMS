
# Fix: Real-time Updates Ignoring Active Filters

## Problem

When any filter is active on the /orders page (e.g., delivery date = 2/5/2026), a real-time order change or new order appears at the top of the list even if it doesn't match the filter. This happens because:

1. `useOrdersRealtime.ts` line 149 finds ALL cached queries matching `["orders"]` with `exact: false`
2. The filtered search results from `useFilteredOrdersSearch` are stored under keys like `["orders", "filtered", ...]`
3. The real-time handler blindly prepends/updates orders in ALL matching caches without checking if the order actually matches the filter criteria

## Solution

Modify `updateAllOrdersCaches` in `useOrdersRealtime.ts` to **skip filtered and search caches** when inserting new orders. For existing orders already in the cache, updates and deletes should still work (the order was already validated by the server). Only **new insertions** (order not found in cache) should be skipped for filtered/search query keys.

## Technical Changes

### File: `src/hooks/useOrdersRealtime.ts` (lines 143-161)

Update `updateAllOrdersCaches` to check query keys before inserting new orders:

```text
BEFORE (line 157):
  if (idx >= 0) { const u = [...old]; u[idx] = transformedOrder; return u; }
  return [transformedOrder, ...old];  // ← blindly prepends to ALL caches

AFTER:
  if (idx >= 0) { const u = [...old]; u[idx] = transformedOrder; return u; }
  // Only insert NEW orders into unfiltered caches
  // Filtered/search caches should not receive unvalidated orders
  const qk = query.queryKey as string[];
  const isFilteredOrSearch = qk.length > 1 && (qk[1] === 'filtered' || qk[1] === 'search' || qk[1] === 'page');
  if (isFilteredOrSearch) return old;  // skip insertion into filtered results
  return [transformedOrder, ...old];
```

This means:
- **Update existing order in filtered results**: YES (it was already validated by the server filter)
- **Delete order from filtered results**: YES (removal is always safe)
- **Insert new order into filtered results**: NO (we can't verify it matches the filter client-side)
- **Insert new order into unfiltered page cache**: YES (no filter to violate)

## Why Not Re-run the Filter Query?

Re-querying the server on every real-time event would defeat the purpose of real-time updates (adds latency and database load). The correct trade-off is:

- New orders that match the filter will appear when the user navigates away and back, or refreshes
- Existing filtered orders update instantly (e.g., status changes, price edits)
- This matches user expectations: "I set a filter, I see filtered data"

## Testing

1. Go to /orders page
2. Set a delivery date filter (e.g., 2/5/2026)
3. Have another user create a new order with a different delivery date (e.g., 2/10/2026)
4. Verify the new order does NOT appear in the filtered view
5. Edit an order that IS in the filtered view -- verify the edit appears instantly
6. Clear filters -- verify the new order appears in the unfiltered view
7. Set a broker or driver filter and repeat steps 3-6
