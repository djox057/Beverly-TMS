
# Fix: Reports Page Order Files Not Displaying (RC/BOL/POD)

## Problem Summary

The Reports page fails to display document indicators (RC, BOL, POD) for many orders, even when files exist in the database. This affects potentially all orders in the date window, not just specific ones.

## Root Causes Identified

### 1. Supabase 1000-Row Default Limit
**File:** `src/hooks/useReportsDateWindow.ts`

The main orders query has no pagination and silently hits Supabase's default 1000-row limit:
```
[useReportsDateWindow] Fetched 1000 orders from database  ← EXACTLY 1000 = limit hit
```

Orders beyond the first 1000 are simply not returned.

### 2. Weak Query Key Hashing (Cache Collisions)
**File:** `src/hooks/useReportsDateWindowAdapter.ts`

The order_files query uses a hash that only considers:
- Order count
- First 5 IDs
- Last 5 IDs

When switching office tabs, if these values coincidentally match, React Query returns cached files for the **wrong office's orders**.

### 3. Stale Closure in queryFn
**File:** `src/hooks/useReportsDateWindowAdapter.ts`

The queryFn captures `windowOrderIds` by closure. When the query re-runs, it may use outdated order IDs, causing a mismatch between fetched files and the orders being displayed.

---

## Solution

### Fix 1: Add Pagination to Orders Query
**File:** `src/hooks/useReportsDateWindow.ts`

Replace single query with paginated fetching:

```text
Changes:
1. Add batch fetching with 1000-row batches
2. Continue fetching until fewer than 1000 rows returned
3. Combine all batches into final result
```

### Fix 2: Use Full Hash for Query Key
**File:** `src/hooks/useReportsDateWindowAdapter.ts`

Replace weak hash with robust unique key:

```text
Current (weak):
"1000-id1,id2,id3,id4,id5-id996,id997,id998,id999,id1000"

Fixed (strong):
Hash of all order IDs using a proper hash function, or
Include ALL order IDs in a JSON string (if count is reasonable)
```

### Fix 3: Avoid Stale Closures in queryFn
**File:** `src/hooks/useReportsDateWindowAdapter.ts`

Pass order IDs through the queryKey and extract them in queryFn:

```text
Option A: Pass IDs in queryKey
- Store windowOrderIds in queryKey
- Extract from context.queryKey in queryFn

Option B: Use queryKey as sole dependency
- Stringify order IDs into the key
- Parse back in queryFn
```

---

## Implementation Details

### Step 1: Fix Pagination in useReportsDateWindow.ts

Update `fetchOrdersForDateWindow` function to paginate:

- Add batch loop with 1000-row limit per batch
- Add `.range(offset, offset + 999)` to each batch query
- Accumulate results until batch returns fewer than 1000 rows
- Log total orders fetched across all batches

### Step 2: Fix Query Key in useReportsDateWindowAdapter.ts

Replace the weak `orderIdsKey` hash with a cryptographic hash:

- Use a simple hash function that processes all order IDs
- Alternatively, use `JSON.stringify(windowOrderIds.sort())` if order count is <2000

### Step 3: Fix Closure Issue in useReportsDateWindowAdapter.ts

Store `windowOrderIds` array directly in query key (as JSON string):

- The queryKey becomes the single source of truth
- queryFn parses the IDs from the queryKey
- No external closure dependency

---

## Files to Modify

1. **src/hooks/useReportsDateWindow.ts**
   - Add pagination to `fetchOrdersForDateWindow` (lines 79-179)
   - Remove 500-row limit from gap-fill query or increase it (line 317)

2. **src/hooks/useReportsDateWindowAdapter.ts**
   - Replace weak `orderIdsKey` hash (lines 297-302)
   - Fix closure issue in order_files queryFn (lines 305-333)

---

## Testing Checklist

After the fix:
1. Navigate to `/reports` page for KRAGUJEVAC office
2. Find order S113550459 (Load #2207)
3. Verify RC and BOL indicators show as green checkmarks
4. Switch to Čačak tab and back to KRAGUJEVAC
5. Verify document indicators still display correctly (no cache collision)
6. Verify console shows more than 1000 orders fetched for large offices
7. Test with Recovery tab to ensure no regression
