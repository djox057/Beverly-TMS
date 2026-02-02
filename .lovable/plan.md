
# Fix Orders Pagination - Direct Page Fetching

## Problem Summary

The Orders page has a broken pagination implementation where:
1. The hook returns ALL loaded pages merged together
2. The UI tries to slice this merged array by page offset
3. When navigating to page 7 with 662 total orders, it shows "601 to 562 of 562" (impossible)
4. The edge function works correctly but returns data for the wrong architecture

## Root Cause

Mismatch between data structure and UI expectations:
- Hook returns: `allLoadedOrders` (all pages concatenated)
- UI expects: to slice by `(currentPage - 1) * 100`
- Result: When on page 7 with only some pages loaded, slice returns wrong/empty data

## Solution

Restructure to true server-side pagination where:
1. Hook knows which page UI is currently viewing
2. Hook returns ONLY current page's orders (not all pages merged)
3. UI displays returned orders directly without slicing
4. Pagination UI uses server `totalCount` for page numbers

---

## Technical Changes

### 1. Update `useOrdersProgressive` Hook

**Current approach**: Returns `allLoadedOrders` (merged pages)
**New approach**: Accept `currentPage` parameter and return only that page's data

```typescript
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  // Accept currentPage from caller
  const currentPage = options?.currentPage ?? 1;
  
  // Return ONLY current page's data, not all pages
  const currentPageOrders = useMemo(() => {
    return loadedPagesRef.current.get(currentPage) || [];
  }, [currentPage, loadedPages]);

  return {
    data: currentPageOrders,        // Just this page
    totalCount,                      // Server total (662)
    totalPages,                      // Calculated (7)
    currentPage,
    isCurrentPageLoaded: loadedPages.has(currentPage),
    // ... rest of properties
  };
}
```

### 2. Update `Orders.tsx` UI Component

**Current approach**: 
```typescript
const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
```

**New approach**:
```typescript
// Pass currentPage to hook
const { data: currentPageOrders, totalCount, totalPages } = useOrdersProgressive({
  ...orderFilterOptions,
  currentPage,
});

// Display directly - no slicing
{currentPageOrders.map(order => <TableRow>...</TableRow>)}

// Pagination text
"Showing {(currentPage-1)*100 + 1} to {(currentPage-1)*100 + currentPageOrders.length} of {totalCount}"
```

### 3. Edge Function Verification

The edge function already supports `limit` and `offset` correctly:
- When called with `{ limit: 100, offset: 600 }`, returns orders 601-662
- Returns `totalCount` from initial count query
- No changes needed here

---

## Data Flow After Fix

```text
User on Page 7 (662 total orders):

1. Orders.tsx passes currentPage=7 to hook
2. Hook checks loadedPagesRef.get(7)
   - If not loaded: fetches from server with offset=600, limit=100
   - Server returns 62 orders + totalCount=662
3. Hook returns { data: [62 orders], totalCount: 662, totalPages: 7 }
4. UI displays 62 orders directly
5. Pagination shows: "Showing 601 to 662 of 662 loads"
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useOrdersProgressive.ts` | Accept `currentPage`, return only that page's data, calculate `totalPages` internally |
| `src/pages/Orders.tsx` | Pass `currentPage` to hook, remove slice logic, use returned data directly |

## Benefits

- Correct pagination display ("601 to 662 of 662")
- All 7 pages visible in UI from the start (based on totalCount)
- Each page fetch is independent (can jump to page 7 without loading 1-6)
- Prefetching still works for next page
- Cache retains loaded pages for back-navigation
