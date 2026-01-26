
# Fix: Reports Page Not Showing Order Files (RC/BOL/POD Missing)

## Problem Summary

The `/reports` page fails to display document status indicators (RC, BOL, POD) for many orders, even when files are correctly uploaded. The popup for order S113550459 shows upload buttons instead of green checkmarks despite having RC and BOL files in the database.

This affects **all orders** in the date window, not just one specific order.

---

## Root Cause: Query Cascade Race Condition

The adapter uses a cascade of dependent queries that creates a timing issue:

```text
Query Cascade:
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: dateWindowHook fetches orders                               │
│         └─ Returns 188 orders for KRAGUJEVAC                        │
├─────────────────────────────────────────────────────────────────────┤
│ Step 2: windowOrderIds computed from orders                         │
│         └─ Creates array of 188 order IDs                           │
├─────────────────────────────────────────────────────────────────────┤
│ Step 3: order_files query enabled and starts fetching               │
│         └─ Will return 511 files                                    │
├─────────────────────────────────────────────────────────────────────┤
│ PROBLEM: transformedData runs BETWEEN Step 2 and Step 3 completing! │
│          └─ orderFilesMap is EMPTY at this point                    │
│          └─ All orders get: order_files: []                         │
│          └─ UI renders with no document indicators                  │
└─────────────────────────────────────────────────────────────────────┘
```

The `transformedData` useMemo has `orderFilesMap` in its dependencies, so it SHOULD re-run when files load. However, the initial render shows stale data, and the re-render may not propagate correctly to the UI.

---

## Solution

Add a loading check to prevent `transformedData` from computing until `order_files` have been fetched.

### Technical Changes

**File: `src/hooks/useReportsDateWindowAdapter.ts`**

#### 1. Track order_files loading state

Update the useQuery to destructure `isLoading`:

```typescript
// Line 305 - Add isLoading to destructuring
const { data: orderFiles, isLoading: isOrderFilesLoading } = useQuery({
  queryKey: ["adapter-order-files", priorityOffice, orderIdsKey],
  // ... rest unchanged
});
```

#### 2. Add loading check in transformedData

Update the useMemo to wait for order_files:

```typescript
// Line 349 - Add check for order_files loading
const transformedData = useMemo(() => {
  if (!USE_DATE_WINDOW_LOADING) return null;
  if (dateWindowHook.isLoading) return null;
  if (!dateWindowHook.driverIds || dateWindowHook.driverIds.length === 0) return [];
  if (!dateWindowHook.orders) return [];
  if (!trucks || !drivers || !dispatchers || !companies) return null;
  
  // NEW: Wait for order_files to load before transforming
  // This prevents rendering with empty files during the query cascade
  if (windowOrderIds.length > 0 && isOrderFilesLoading) return null;
  
  // ... rest of transformation unchanged
```

#### 3. Update dependencies and isLoading return value

Add `isOrderFilesLoading` and `windowOrderIds` to the useMemo dependencies (line 670-683):

```typescript
], [
  dateWindowHook.orders,
  dateWindowHook.driverIds,
  dateWindowHook.isLoading,
  trucks,
  drivers,
  dispatchers,
  companies,
  truckNotes,
  lostDayNotes,
  orderFilesMap,
  priorityOffice,
  dispatcherId,
  isOrderFilesLoading,  // NEW
  windowOrderIds,        // NEW (already computed, stable reference)
]);
```

Update the returned `isLoading` to include order_files loading state (line 692):

```typescript
return {
  data: transformedData,
  isLoading: dateWindowHook.isLoading || (windowOrderIds.length > 0 && isOrderFilesLoading),
  // ... rest unchanged
};
```

---

## Why This Fixes the Issue

| Before Fix | After Fix |
|------------|-----------|
| transformedData runs immediately when orders load | Waits for order_files query to complete |
| orderFilesMap is empty during first computation | orderFilesMap is populated before computation |
| UI shows upload buttons (no files) | UI shows correct document status |
| Requires page refresh to see files | Real-time update on initial load |

---

## Files to Modify

1. **src/hooks/useReportsDateWindowAdapter.ts**
   - Destructure `isLoading` from order_files query (line 305)
   - Add loading check in transformedData useMemo (line 349)
   - Add new dependencies to useMemo (line 680-683)
   - Update returned isLoading to include order_files state (line 692)

---

## Testing Checklist

After the fix:
1. Navigate to `/reports` page for KRAGUJEVAC office
2. Find order S113550459 (Load #2207)
3. Click on the order row to open the popup
4. Verify RC and BOL show as green checkmarks (not upload buttons)
5. Verify clicking RC or BOL opens the actual file
6. Test with other offices to ensure no regression
7. Verify loading spinner shows while data is being fetched
