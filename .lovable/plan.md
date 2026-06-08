# Goal

When a filter is active on `/orders`, the list must show **every unlocked order first**, in stable order, then continue into locked orders — across pages 1..N. No toggle. The summary badges (already correct) stay as-is.

# Root cause

`search-orders` returns `.order("locked", asc).order("created_at", desc)`. That keeps unlocked-first within a single 500-row batch, but as soon as the UI auto-fetches batch 2 (offset 500–999) the boundary lands inside the locked section, so all "remaining" unlocked rows that the client expected on later UI pages don't exist — they were never in batch 2.

For the Jan 1 – Jun 7 filter: 239 unlocked → fits in batch 1 → pages 1–4 (50/page) show unlocked, page 5 shows 39 unlocked + 11 locked. That matches what you're seeing ("page 3 ~20, page 4 = 0 unlocked"). It looks broken because the client page indices don't line up with the unlocked tail.

The reported "~120ish loads total" symptom comes from the UI calling `loadMore` only when the *next* client page is requested, so pages 3+ paint before batch 2 arrives — table looks empty.

# Fix

## 1. `search-orders/index.ts` — keep `locked asc` but make it deterministic and faster

- Keep `.order("locked", { ascending: true })` (this is what guarantees unlocked-first globally).
- Add `.order("id", { ascending: true })` as the tiebreaker so pagination is stable across batches (no row skipped/duplicated when two rows share `created_at`).
- Drop the `created_at desc` secondary sort — it conflicts with stable keyset behavior and isn't what the user asked for.
- Cap `limit` at 1000 (already done). No other behavior change.

## 2. `useFilteredOrdersSearch.ts` — eagerly pre-fetch enough batches to cover all unlocked

After `search` finishes and the `orders-summary` response arrives:

- Read `summary.unlockedCount`.
- If `summary.unlockedCount > orders.length` (i.e. unlocked spill past batch 1), loop `loadMore()` in the background until `orders.length >= summary.unlockedCount`. Cap at 10 batches (5,000 rows) as a safety net so a pathological filter can't runaway.
- Expose an `isPrefetchingUnlocked` flag the page can show as a small spinner next to the summary badges.

This is the key change: it guarantees every unlocked row is in the client cache before the user clicks page 2/3/4.

## 3. `Orders.tsx` — remove the "Unlocked only" toggle and the page-driven autoload

- Delete the toggle UI/state added in the previous step.
- Delete the `useEffect` that calls `loadMoreFiltered()` when `currentPage * ORDERS_PER_PAGE > filteredServerOrders.length` — the hook now front-loads unlocked itself, so this is redundant. Keep ordinary "load next batch" only when the user pages past the loaded set into locked territory.
- Keep summary badges as-is (totals come from `orders-summary` and are already correct).
- Keep `ORDERS_PER_PAGE = 50`.

## 4. Verification

- Manual: apply Jan 1 – Jun 7 / exclude BG Prime filter. Within ~1s after the spinner stops, paging through pages 1–5 should show 50/50/50/50/39 unlocked, then locked starts on page 5 row 40. Total unlocked across pages = 239. Page 6+ are pure locked.
- Extend `search-orders/index_test.ts`: call `search-orders` with that filter, `offset=0 limit=500` → assert the first 239 rows have `locked=false`, the rest `locked=true`. Then call `offset=500 limit=500` → assert all rows `locked=true`.

# Files touched

- `supabase/functions/search-orders/index.ts` — tiebreaker change only.
- `src/hooks/useFilteredOrdersSearch.ts` — add eager unlocked-prefetch loop + `isPrefetchingUnlocked` flag.
- `src/pages/Orders.tsx` — remove "Unlocked only" toggle and the page-driven autoload effect.
- `supabase/functions/search-orders/index_test.ts` — assert global unlocked-first ordering across two batches.

# Out of scope

- Replacing `locked asc` with a keyset/cursor scheme (would let us skip prefetching entirely; bigger refactor).
- Default-path (no-filter) changes.
