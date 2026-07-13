## Problem

`/orders` blocks for ~7–8s on `[OrdersProgressive] ⏱ locked count query`. The unlocked count returns in ~250–500ms, but the exact locked count on `orders` (39k+ rows) is what makes the page hang and sometimes fail to fetch. Nothing else on the page is slow.

## Root cause

In `src/hooks/useOrdersProgressive.ts` the counts query uses `count: "exact"` for both unlocked and locked orders. Exact counts on a big filtered table force Postgres to scan every matching row. Locked = true is the vast majority of rows, so it's by far the worst case. There is no supporting partial index for `locked = true`.

## Fix (only touches counts, no UI/behavior change)

1. In `useOrdersProgressive.ts` counts query:
   - Keep `count: "exact"` for the unlocked query (small, fast, needed to know exact unlocked size for the boundary logic).
   - Switch the locked count to `count: "estimated"` (falls back to planner statistics). This returns in ~10–50ms and is only used to compute `serverTotalPages` for locked pagination, which does not need to be exact.
   - If `estimated` returns `null` or `0` while there clearly are locked rows (rare, e.g. fresh table with no ANALYZE), fall back to `count: "planned"`, then to `exact` as a last resort.

2. Add a partial index to help both the count and the paginated fetches on locked orders:

```sql
CREATE INDEX IF NOT EXISTS orders_locked_true_created_at_idx
  ON public.orders (created_at DESC)
  WHERE locked = true;

CREATE INDEX IF NOT EXISTS orders_locked_false_created_at_idx
  ON public.orders (created_at DESC)
  WHERE locked = false;
```

These are pure performance additions — no schema/data change, no policy change.

## Not changing

- No UI changes.
- No pagination/page-size changes.
- No edge function changes.
- Search, filters, realtime, and progressive fetch flow all stay identical.

## Expected result

Counts phase drops from ~7–8s to well under 1s, so page 1 renders in ~1s total instead of ~9s, and the "fails to fetch" timeout after the long count goes away.
