

# Fix: Search Flicker During Progressive Loading

## Problem Summary

When a user searches for an archived order while Phase 2 (locked orders) is still loading:
1. User types search term → `debouncedSearchTerm` updates  
2. Server search starts → `searchResults` is still `null`
3. **Line 348** condition fails: `&& searchResults` is falsy
4. Falls back to `orders` (incomplete local data)
5. Table shows empty/wrong results
6. Server completes → briefly shows correct result
7. Phase 2 updates → triggers re-render → cycle repeats

**Root cause**: The condition `searchResults` being truthy is required, but during an active search `searchResults` is `null`, causing fallback to incomplete local data.

## Solution

Two minimal, targeted changes:

### Change 1: Add Stale Response Protection to `useOrdersSearch.ts`

Add a `latestSearchKeyRef` to track the most recent search (term + filters). When an async response arrives, discard it if it doesn't match the current key.

**File**: `src/hooks/useOrdersSearch.ts`

Changes:
- Line 1: Add `useRef` to imports
- Line 17: Add `latestSearchKeyRef` 
- Line 26-29: Clear the ref when clearing search
- Line 35: Generate search key and set ref BEFORE async call
- Lines 107-122: Check ref before updating state in try/catch/finally

### Change 2: Fix `dataSource` to Lock Into Server Mode

**File**: `src/pages/Orders.tsx`

Change the `dataSource` condition to lock into server mode when search is active, regardless of whether results have arrived yet.

**Current (buggy) - Lines 346-352:**
```typescript
const dataSource = useMemo(() => {
  // If searching and we have server results, prioritize those
  if (debouncedSearchTerm && debouncedSearchTerm.trim().length >= 2 && searchResults) {
    return searchResults;
  }
  return orders || [];
}, [debouncedSearchTerm, searchResults, orders]);
```

**Fixed:**
```typescript
const dataSource = useMemo(() => {
  const isActiveSearch = debouncedSearchTerm && debouncedSearchTerm.trim().length >= 2;
  
  if (isActiveSearch) {
    // LOCKED into server mode - never fall back to local orders during active search
    // While searching: show previous results or empty array (no flicker)
    // After search: show server results
    return searchResults || [];
  }
  
  return orders || [];
}, [debouncedSearchTerm, searchResults, orders]);
```

**Key insight**: When `isActiveSearch` is true, we **always** return `searchResults` (or empty array), never falling back to `orders`. This prevents the flicker caused by incomplete Phase 2 data.

## Technical Details

### File 1: `src/hooks/useOrdersSearch.ts`

| Line | Change |
|------|--------|
| 1 | Add `useRef` to imports |
| 17 | Add `const latestSearchKeyRef = useRef<string>("")` |
| 26-29 | Set `latestSearchKeyRef.current = ""` when clearing |
| 35 | Create search key and set `latestSearchKeyRef.current = searchKey` before async |
| 107-115 | Check `if (latestSearchKeyRef.current !== searchKey)` before updating state |
| 116-120 | Apply same stale check in error handling |
| 121-123 | Apply same stale check in finally block |

### File 2: `src/pages/Orders.tsx`

| Lines | Change |
|-------|--------|
| 346-352 | Replace `dataSource` logic to remove `&& searchResults` requirement |

## Expected Behavior After Fix

1. User navigates to `/orders` → Phase 1 loads immediately
2. Phase 2 starts loading archived orders in background
3. User types "6898-BFU" (archived order)
4. After 300ms debounce, server search starts
5. **During search**: Table shows empty array (not local incomplete data) - no flicker
6. **Within ~500ms**: Server returns match → Table shows result stably
7. Phase 2 continues loading but does NOT affect search display
8. User clears search → Returns to normal progressive loading

