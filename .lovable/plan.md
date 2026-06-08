# What you're seeing

This is not a bug in the counts — it's the natural fallout of how `search-orders` sorts:

- Server returns rows in batches of 500, ordered `locked asc, created_at desc`.
- For your Jan 1 – Jun 7 filter, the **first 239 rows of batch 1 are the unlocked ones**, the next 261 are locked, and batches 2..N are all locked.
- The UI paginates 100 rows per page from that cache. So:

```
Page 1: rows   0–99   → 100 unlocked
Page 2: rows 100–199  → 100 unlocked
Page 3: rows 200–299  →  39 unlocked + 61 locked
Page 4+:              →   0 unlocked (all locked)
```

That matches "first two pages all unlocked, third ~20-ish, rest 0". The 239 total is correct — they're just packed into the first 2.39 pages.

# Fix

Add an **"Unlocked only"** toggle to the `/orders` filter bar. When on, it sends `filters.locked = false` to both `search-orders` and `orders-summary`. The server then returns *only* the 239 unlocked rows (still 100/page → 3 clean pages), and `totalCount` becomes 239 so the pager shows 3 pages instead of 253.

No backend changes needed — `search-orders` and `orders-summary` already honor `filters.locked`.

# Changes

1. **`src/hooks/useFilteredOrdersSearch.ts`**
   - Add `locked?: boolean` to the `SearchFilters` interface and include it in `getFilterQueryKey` so the cache key changes when the toggle flips.

2. **`src/pages/Orders.tsx`**
   - Add `unlockedOnly` state (default `false`) next to the existing filter state.
   - Persist it in the same place other filter state is persisted (sessionStorage block around line 308 / the filter state object).
   - When building the filter payload (around line 496, where `deliveryDateFrom/To` are set), include `locked: unlockedOnly ? false : undefined`.
   - Add a small toggle (shadcn `Switch` + label "Unlocked only") in the filter toolbar, right next to the date range picker.
   - Reset `currentPage` to 1 when the toggle flips (same pattern as other filter changes).

3. **Optional polish** — when `unlockedOnly` is on, hide the "Unlocked X / Locked Y" badges from the summary row since every visible row is unlocked (or just keep them; they still read correctly from `orders-summary`).

# Out of scope

- Changing the default server sort (still `locked asc, created_at desc`).
- The larger refactor to collapse the three fetch paths.
- Server-side text search.

# Verification

1. Apply Jan 1 – Jun 7 filter, exclude BG Prime.
2. Unlocked badge reads **239**, total reads **25,273**.
3. Flip "Unlocked only" → pager shows **3 pages**, each page renders only unlocked rows, page 3 has 39 rows.
4. Flip it off → pager returns to ~253 pages with the previous mixed behavior.
