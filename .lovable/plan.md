

## Problem

When you mark an order as "paid" on the /orders page and that order was found via **search** (which is how locked/archived orders are typically accessed), the UI does not update. You have to navigate away and come back.

**Root cause (two issues):**

1. The search hook (`useOrdersSearch`) has its own `ORDER_COLUMNS` list that is **missing `paid` and `invoiced`** -- so even when the order is fetched via search, the `paid` field is never included in the response.

2. After the database update, `handleConfirmPaidChange` only patches the progressive pagination cache (`updateOrderLocally`), but the displayed data actually comes from the **search results cache** -- a completely separate data source that never gets patched.

3. Both `useOrdersSearch` and `useFilteredOrdersSearch` read their cached data via non-reactive `queryClient.getQueryData()` calls, so even patching those caches alone would not trigger a re-render.

## Fix (3 changes)

### 1. Add `paid, invoiced` to ORDER_COLUMNS in `src/hooks/useOrdersSearch.ts`

Add `paid, invoiced` after `booked_by` in the column list (line 20), matching what was already done for the edge functions and realtime hook.

### 2. Patch the search/filter caches in `handleConfirmPaidChange` (`src/pages/Orders.tsx`)

After the database update succeeds, in addition to calling `updateOrderLocally` (for paginated views), also patch **all** order-related query caches using `queryClient.getQueryCache().findAll()` with `{ queryKey: ["orders"], exact: false }`. This covers the search cache, filter cache, and progressive page caches in one sweep. Map through each cached array and flip the `paid` field on the matching order.

### 3. Force re-render for non-reactive caches

Since both `useOrdersSearch` and `useFilteredOrdersSearch` use non-reactive `getQueryData()` reads, the component needs a state bump to pick up the patched values. Add a `cacheVersion` counter state in `Orders.tsx` that gets incremented after patching, and include it in the `dataSource` memo's dependency array. This forces the memo to re-evaluate and pick up the updated cache values.

---

### Technical details

**File: `src/hooks/useOrdersSearch.ts` (line 20-21)**
- Change: `additional_miles, booked_by,` followed by `original_truck_id, original_trailer_id`
- To: `additional_miles, booked_by, paid, invoiced,` followed by `original_truck_id, original_trailer_id`

**File: `src/pages/Orders.tsx` -- `handleConfirmPaidChange` function**
- After the successful `supabase.update()`, sweep all `["orders"]` caches using `queryClient.getQueryCache().findAll({ queryKey: ["orders"], exact: false })` and patch the matching order's `paid` field
- Increment a `cacheVersion` state variable to force a re-render
- Keep the existing `updateOrderLocally` call as a secondary safety net

**File: `src/pages/Orders.tsx` -- `dataSource` memo**
- Add `cacheVersion` to the dependency array so it re-evaluates after optimistic patches

