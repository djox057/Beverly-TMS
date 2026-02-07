

# Fix: Orders Search Infinite Loop and CPU Storm

## Problem

The search bar on the /orders page creates a self-sustaining infinite loop firing thousands of database queries, causing statement timeouts and `ERR_INSUFFICIENT_RESOURCES`. The root cause is a circular dependency where `searchOrders` depends on `queryKey`, but also updates the state that `queryKey` derives from.

## Changes

### 1. Stabilize callbacks in `src/hooks/useOrdersSearch.ts`

- Remove reactive `queryKey` useMemo -- replace with `activeQueryKeyRef` (useRef)
- Add `failedTermsRef` (useRef Set) to block re-searching terms that just timed out
- Remove `queryKey` from `searchOrders` and `clearSearch` dependency arrays: `[queryClient, queryKey]` becomes `[queryClient]`
- Use `activeQueryKeyRef.current` inside `clearSearch` and for `searchResults` lookup
- Clear `failedTermsRef` when user types a different term
- On timeout error (code `57014`), add term to `failedTermsRef`

Key before/after:

```text
BEFORE (circular):
  queryKey = useMemo(() => [...], [activeSearchTerm, activeOptions])
  searchOrders = useCallback(() => { setActiveSearchTerm(term); ... }, [queryClient, queryKey])
  searchResults = queryClient.getQueryData(queryKey)

AFTER (stable):
  activeQueryKeyRef = useRef(null)
  failedTermsRef = useRef(new Set())
  searchOrders = useCallback((term, options) => {
    if (term !== activeSearchTerm) failedTermsRef.current.clear()
    if (failedTermsRef.current.has(term)) return  // block retry
    activeQueryKeyRef.current = newQueryKey
    setActiveSearchTerm(term)
    ...
  }, [queryClient])
  clearSearch = useCallback(() => {
    if (activeQueryKeyRef.current) queryClient.removeQueries(...)
    activeQueryKeyRef.current = null
    ...
  }, [queryClient])
  searchResults = activeQueryKeyRef.current
    ? queryClient.getQueryData(activeQueryKeyRef.current)
    : undefined
```

### 2. Memoize filter options in `src/pages/Orders.tsx`

- Wrap `orderFilterOptions` in `useMemo` with deps `[shouldFilterByUser, profile?.full_name, profile?.user_id]`
- Simplify the search `useEffect` deps to `[searchTerm, searchOrders, clearSearch, orderFilterOptions]`

### 3. Add trigram index (database migration)

```text
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_broker_load_number_trgm
  ON orders USING gin (broker_load_number gin_trgm_ops);
```

This makes `ilike %term%` use an index scan instead of a full table scan through RLS on 12k+ rows.

## Execution Order

1. Apply the database migration first (index creation)
2. Update `useOrdersSearch.ts` (core fix)
3. Update `Orders.tsx` (stabilize consumer)

