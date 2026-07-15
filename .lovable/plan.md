## Problem

`/orders` takes 10+ seconds to render its first page. From the logs:

- `unlocked count query: 3926ms`
- `locked count query: 8121ms` → returns **HTTP 500** (Postgres statement timeout)
- The count query is repeated because it 500'd (React Query retry).
- Only after both counts resolve does the page fetch start.

The offending request is:

```
HEAD /orders?select=id&locked=eq.true
&or=(booked_by_company_id.neq.238a7acf-…,booked_by_company_id.is.null)
```

This is `count: "exact"` over the **entire** `orders` table (BG Prime is excluded, so it's basically "count all orders except one company"). Two problems compound it:

1. There is **no index on `booked_by_company_id`**, so the planner falls back to a seq scan of a very large table for every count.
2. `count: "exact"` forces a full scan even with an index; on a table this size it will always be slow and often trip the statement timeout, which is exactly the 500 we see.

The multiple "Component rendering" logs are just React re-renders while `isLoading` is true — not duplicate fetches. The real problem is the two count queries blocking the page.

## Fix

Two changes, small and targeted to the count path only.

### 1. Migration: add index for the excluded-company filter

```sql
CREATE INDEX IF NOT EXISTS idx_orders_booked_by_company_id
  ON public.orders (booked_by_company_id);

-- Speeds up the two most common count/list patterns on /orders:
-- locked + excluded-company, and unlocked + excluded-company.
CREATE INDEX IF NOT EXISTS idx_orders_locked_booked_by_company
  ON public.orders (locked, booked_by_company_id);
```

### 2. `src/hooks/useOrdersProgressive.ts`: stop using `count: "exact"` for pagination

Exact counts are not needed for pagination UX — the page only needs "roughly how many pages" and "is there a next page". Change the counts query to use the planner's estimated count (`count: "planned"` with `head: true`), which is O(1) and never times out:

- `.select("id", { count: "exact", head: true })` → `.select("id", { count: "planned", head: true })` for both unlocked and locked count queries.
- Keep the same return shape (`{ unlockedCount, lockedCount }`) so nothing else changes.
- Add `retry: 0` on `countsQuery` so a transient timeout doesn't double the wait.

If the planner estimate is off by a page at the tail, the "hasMore" logic already tolerates it (last page just returns fewer rows). Exact totals are only cosmetic in the paginator.

### Out of scope

- The per-page fetch itself (edge functions `get-all-unlocked-orders` / `get-all-locked-orders`) is not changed — logs show those return quickly once triggered. This plan only removes the ~12s count barrier that blocks them from starting.
- No UI changes.

### Expected result

Counts return in <100ms (planner estimate + index-backed fallback later if we ever switch back). First page render should start within ~200ms instead of ~12s, and the 500 disappears.

## Files touched

- New migration: index on `orders.booked_by_company_id` (+ composite with `locked`).
- `src/hooks/useOrdersProgressive.ts` — swap `count: "exact"` → `"planned"`, add `retry: 0`.
