## Goal

On `/orders`, unlocked rows must always render first, sorted by pickup date ascending (earliest pickup at top). Locked rows render below in their existing order. Switching filters must not briefly show the previous filter's rows or a "locked-first" snapshot.

## Root cause

In `src/pages/Orders.tsx` `dataSource` (lines 552–584), the only sort applied is "locked vs. unlocked" — within unlocked, order is whatever the server returned (`created_at desc`). Pickup date is never used. Additionally, when filters change, `useFilteredOrdersSearch` flips `activeFilterKey` and the React Query cache for the new key starts empty/partial, so the table briefly renders an incomplete or out-of-order batch before the full result + unlocked-prefetch finishes.

## Changes

### 1. `src/pages/Orders.tsx` — explicit unlocked sort

Replace the three `[...results].sort((a,b) => a.locked === b.locked ? 0 : a.locked ? 1 : -1)` blocks with a single helper used by all branches (search results, filtered server results, default hook results):

```ts
const pickupTs = (o: any): number => {
  // order.pickupDate is the formatted string used in the grid;
  // fall back to raw pickup_datetime when present for correct sorting.
  const raw = o.pickup_datetime ?? o.pickupDatetime ?? o.pickupDate;
  if (!raw) return Number.POSITIVE_INFINITY; // nulls sort last among unlocked
  const t = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

const sortUnlockedFirst = (rows: any[]) => {
  const unlocked = rows.filter(o => !o.locked).sort((a, b) => pickupTs(a) - pickupTs(b));
  const locked = rows.filter(o => o.locked); // preserve server order
  return [...unlocked, ...locked];
};
```

Apply `sortUnlockedFirst(...)` in all three `dataSource` branches (active search, active filter, default).

### 2. `src/pages/Orders.tsx` — prevent stale flash on filter change

In the `hasActiveFilter` branch of `dataSource`, suppress the table data while a new filter is loading and the cache for the new key is empty/incomplete:

- Track the last filter key that finished its initial load (a `useRef<string | null>`); update it after `searchFiltered` resolves (signal via `isFilteredLoading` flipping false and `filteredServerOrders.length > 0` for the current key).
- While `isFilteredLoading || isPrefetchingUnlocked` and `filteredServerOrders.length === 0`, return `[]` from `dataSource` so the grid shows the existing empty / skeleton state instead of stale or partial rows.
- Expose `isPrefetchingUnlocked` from `useFilteredOrdersSearch` (already returned) and consume it here.

Also bump the `useMemo` dep list to include `isFilteredLoading` and `isPrefetchingUnlocked` so re-renders happen at the right time.

### 3. No backend changes

Server already returns `locked asc, created_at desc` and the unlocked-prefetch loop in `useFilteredOrdersSearch` already guarantees every unlocked row is in the cache before locked rows can dominate. The new client sort just reorders unlocked rows by pickup date once present.

## Out of scope

- Adding clickable column headers / multi-column sort.
- Sort changes for the locked section.
- Changes to Reports, Yard, or other pages.

## Verification

1. Apply a delivery date filter for last month → first visible rows are unlocked, ordered by pickup date ascending.
2. Switch the date filter to a different month → no flash of the previous filter's rows or of locked-first ordering; grid shows loading/empty briefly, then the new unlocked-first / pickup-asc result.
3. Clear filters → default page shows unlocked first sorted by pickup asc, locked underneath unchanged.
4. Lock/unlock a row → optimistic patch keeps the row in the correct section and pickup-date position (cacheVersion already triggers re-sort).
