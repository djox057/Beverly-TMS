# Fix: Filtered orders only show unlocked from first 500-row batch

## Problem
On `/orders`, applying a delivery-date filter (e.g. Jan 1 – Jun 7, 2026) shows only 15 unlocked orders, even though searching narrower date ranges adds up to a much larger number.

## Root cause
- `useFilteredOrdersSearch` calls the `search-orders` edge function with `limit: 500` per batch.
- The edge function orders results by `created_at DESC` only.
- The "unlocked at top" sort happens **client-side** on whatever 500 rows are currently loaded.
- For a 6-month range there are far more than 500 matching orders, so most unlocked orders live in later batches that are never auto-loaded. The "15 unlocked" is just the unlocked subset of the most-recently-created 500 rows.

## Fix
Change the server-side ordering in `supabase/functions/search-orders/index.ts` so unlocked rows always come first within the filtered set:

```ts
query = query
  .order("locked", { ascending: true })          // false (unlocked) before true (locked)
  .order("created_at", { ascending: false })
  .range(offset, offset + limit - 1);
```

Result: the first batch returned to the client contains all unlocked orders for the filter (up to 500) before any locked orders, so the unlocked count displayed at the top of the list is accurate without needing to page through all results.

## Notes
- `totalCount` (from Postgres `count: exact`) is already correct — only the visible/loaded subset was wrong.
- No client changes required; the existing client-side `locked ? 1 : -1` sort stays as a safety net.
- Same edge function is used by `/bg-loads`, so that page benefits from the same fix.
- If a single filter ever has more than 500 unlocked orders, the existing "Load more" pagination continues to work normally.

## Files
- `supabase/functions/search-orders/index.ts` — add `.order("locked", { ascending: true })` before the existing `created_at` order.
