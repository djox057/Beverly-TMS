# Two-query parallel fetch for filtered orders

## Goal

When filters are applied on `/orders`, guarantee every unlocked order appears at the top, regardless of how many locked orders exist — without the current hack of relying on `ORDER BY locked ASC` inside a single 500-row page (which can still mis-rank when offsets/orderings shift, and forces over-fetching).

## Approach

Run **two queries in parallel** on the first search:

1. **Unlocked query** — fetch ALL unlocked orders matching the filters (one shot, no pagination from the user's POV).
2. **Locked query** — fetch the first page of locked orders only; paginated via "Load more" as today.

Merge in the client: `[...unlocked, ...lockedPage1, ...lockedPage2, ...]`.

## Changes

### `supabase/functions/search-orders/index.ts`
- Accept a new body field `lockedOnly?: boolean` (server-side filter on `locked = true/false`). The existing `filters.locked` field already exists — reuse it.
- Remove the `.order("locked", ascending: true)` hack; order purely by `created_at DESC`.
- When the caller asks for unlocked-only, support fetching beyond the 1000 cap by internally looping in chunks of 1000 until exhausted, and return them all in one response (cap at a safety ceiling, e.g. 5000, with a warning if exceeded). Unlocked counts are small in practice (~hundreds).
- Locked-only requests stay paginated as today (500/page).

### `src/hooks/useFilteredOrdersSearch.ts`
- On `search(filters)`:
  - Fire two `supabase.functions.invoke("search-orders", ...)` calls in parallel via `Promise.all`:
    - Call A: `{ filters: {...filters, locked: false}, offset: 0, limit: 5000, fetchAllUnlocked: true }`
    - Call B: `{ filters: {...filters, locked: true}, offset: 0, limit: 500 }`
  - Skip Call A if the user explicitly filtered `lockedNotInvoiced` or `invoiced` (those imply locked-only).
  - Skip Call B if filters explicitly request unlocked-only.
  - Combine: `orders = [...unlocked, ...lockedPage1]`. Store in React Query cache.
  - `totalCount = unlocked.length + lockedCount`.
  - Track locked offset separately for `loadMore`.
- `loadMore()`:
  - Only paginates the locked query (unlocked is already complete).
  - Appends new locked rows after the existing list.

### State refs
- Add `lockedOffsetRef`, `lockedHasMoreRef`, `unlockedCountRef` alongside existing refs.
- `hasMore` returned to UI = `lockedHasMoreRef.current`.

## Edge cases

- Filter combination `lockedNotInvoiced=true` → only Call B (locked + invoiced=false).
- Filter `invoiced=true` → only Call B.
- No filters at all: hook isn't used (Orders.tsx uses a different code path); no change needed.
- Real-time patching: existing React Query cache update logic continues to work because we still write to the same `queryKey`.

## Out of scope

- No changes to `Orders.tsx`, `BgLoads.tsx`, or `BeverlyHeatmapDeepSearch.tsx` UI — the hook's contract (`orders`, `totalCount`, `hasMore`, `loadMore`) stays identical.
- No DB migrations.

## Verification

- Apply Jan 1 – Jun 7 2026 delivery-date filter on /orders → unlocked count at top should equal 239 (matches DB), total = 25,273, "Load more" pulls additional locked pages.
- Apply a narrow filter (e.g. one company) → both queries return small results, merged correctly.
- Apply `lockedNotInvoiced` filter → only locked query runs.
