

# Fix: Stabilize `useFilteredOrdersSearch.ts` Callbacks

## Problem

The `loadMore` and `reset` callbacks depend on reactive `queryKey` (derived from `activeFilters` state), creating the same circular dependency pattern that caused the search infinite loop. While `isLoadingRef` guards reduce the risk, the architecture is fragile under rapid filter toggling.

## Changes to `src/hooks/useFilteredOrdersSearch.ts`

### Remove reactive `queryKey` useMemo (lines 72-76)

Replace with three stable refs:
- `activeQueryKeyRef` -- tracks current query key
- `activeFiltersRef` -- tracks current filters for `loadMore`
- `hasMoreRef` -- tracks pagination state for `loadMore`

### Update `search` callback (line 89)

Add ref assignments before state updates:
```text
activeQueryKeyRef.current = newQueryKey;
activeFiltersRef.current = filters;
```
Also sync `hasMoreRef.current` in success/error paths.

### Stabilize `loadMore` callback (lines 140-184)

- Guard: check `activeQueryKeyRef.current`, `activeFiltersRef.current`, and `hasMoreRef.current` instead of reactive state
- Read filters from `activeFiltersRef.current` instead of `activeFilters`
- Write to cache using `activeQueryKeyRef.current` instead of `queryKey`
- Deps: `[queryClient]` (was `[hasMore, activeFilters, queryKey, queryClient]`)

### Stabilize `reset` callback (lines 186-195)

- Use `activeQueryKeyRef.current` for `removeQueries`
- Clear all refs: `activeQueryKeyRef.current = null`, `activeFiltersRef.current = null`, `hasMoreRef.current = false`
- Deps: `[queryClient]` (was `[queryKey, queryClient]`)

### Update `cachedOrders` lookup (lines 198-200)

```text
BEFORE: queryKey ? queryClient.getQueryData(queryKey) : []
AFTER:  activeQueryKeyRef.current ? queryClient.getQueryData(activeQueryKeyRef.current) : []
```

## How to Test

1. Open `/orders` page, open DevTools Network tab
2. Apply a filter (e.g., select a Company) -- should see exactly 1 `search-orders` call
3. Click "Load More" if available -- exactly 1 additional call
4. Clear filters (reset) -- no new network requests, view reverts to paginated data
5. Rapidly toggle filters 5+ times -- at most 1 request per change, no `57014` errors
6. Apply filter then immediately reset before results load -- no orphaned queries, no errors
7. CPU stays under 30% throughout all interactions

