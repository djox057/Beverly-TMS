
# Fix: Analytics/Orders Page Cache Synchronization

## Problem Summary

Both `/orders` (useOrders) and `/analytics` (useOrdersWithProgress) share the same React Query cache key `["orders"]` with `staleTime: Infinity` and `refetchOnMount: false`. This creates a one-way sync issue:

- **Analytics first → Orders works**: useOrdersWithProgress loads all data with progress tracking, then useOrders reuses it
- **Orders first → Analytics broken**: useOrders loads 100 orders, React Query caches it, useOrdersWithProgress never runs its queryFn because cache is fresh, so progress state never initializes

## Root Cause

When React Query finds fresh cached data, it returns it immediately without calling queryFn. The `useOrdersWithProgress` hook depends on its queryFn running to:
1. Call `fetchUnlockedCount()` to set `progress.unlockedTotal`
2. Call `setProgress()` to initialize the loading state

Without the queryFn running, `progress.unlockedTotal` stays `null`, and the background loading effect never triggers.

## Solution

Make useOrdersWithProgress detect when it receives pre-cached data and initialize its progress state accordingly, then trigger background loading to fetch remaining orders.

### Implementation Steps

1. **Add initialization effect in useOrdersWithProgress**
   - When `query.data` exists but `progress.unlockedTotal === null`, this indicates we got cached data without running queryFn
   - Fetch the unlocked count manually and initialize progress
   - Determine if background loading is needed (cached unlocked count < total)

2. **Check if background loading should start**
   - Count unlocked orders in cached data
   - If less than total, start background loading loop
   - Use cursor-based pagination from the last unlocked order

### Code Changes

**File: `src/hooks/useOrdersWithProgress.ts`**

Add a new `useEffect` after the query definition to handle cache-hit initialization:

```typescript
// Handle case where we got cached data from another page (e.g., /orders)
// In this case, queryFn never ran, so progress state was never initialized
useEffect(() => {
  const initializeFromCache = async () => {
    // Only run if we have data but never initialized progress
    if (query.data && progress.unlockedTotal === null && !query.isLoading) {
      console.log('[OrdersWithProgress] Detected cached data without progress init, initializing...');
      
      // Fetch the total count
      const totalCount = await fetchUnlockedCount();
      
      // Count what we have in cache
      const unlockedInCache = query.data.filter(o => !o.locked).length;
      const lockedInCache = query.data.filter(o => o.locked).length;
      
      console.log(`[OrdersWithProgress] Cache has ${unlockedInCache} unlocked, ${lockedInCache} locked. Total unlocked in DB: ${totalCount}`);
      
      // Initialize progress state
      setProgress({
        unlockedLoaded: unlockedInCache,
        unlockedTotal: totalCount,
        lockedLoaded: lockedInCache,
        isLoadingMore: unlockedInCache < (totalCount || 0),
        isComplete: unlockedInCache >= (totalCount || 0),
      });
      
      // If we need more orders, trigger background loading
      if (unlockedInCache < (totalCount || 0)) {
        hasStartedBackgroundLoad.current = true;
        setTimeout(() => loadMoreUnlocked(), 300);
      }
    }
  };
  
  initializeFromCache();
}, [query.data, query.isLoading, progress.unlockedTotal, fetchUnlockedCount, loadMoreUnlocked]);
```

### Why This Works

1. **Detection**: The condition `query.data && progress.unlockedTotal === null && !query.isLoading` precisely identifies the "cache hit without queryFn execution" scenario

2. **State Sync**: By calling `fetchUnlockedCount()` and counting cached data, we reconstruct the progress state that would have been set during normal queryFn execution

3. **Background Loading**: If the cache only has 100 unlocked orders but there are 500+ total, we trigger the same background loading mechanism, seamlessly loading the rest

4. **No Double Work**: 
   - If Analytics runs first → queryFn initializes progress → this effect never triggers (progress.unlockedTotal !== null)
   - If Orders runs first → cache hit → this effect initializes and loads remaining

### Acceptance Criteria

1. Open fresh app, go to `/orders` first → loads 100 unlocked + locked orders
2. Navigate to `/analytics` → should show progress indicator, automatically start loading remaining unlocked orders
3. Progress should increment from 100 → 200 → ... → total unlocked count
4. Once complete, analytics should show all orders
5. Navigation back to `/orders` should still work with full dataset

### Testing Notes

- Clear browser cache/IndexedDB before testing
- Verify console logs show the cache detection message when going Orders→Analytics
- Confirm background loading completes within reasonable time
- Check that both pages show same final order count

## Technical Details

**Affected Files:**
- `src/hooks/useOrdersWithProgress.ts` (primary change)

**Dependencies:**
- No new dependencies
- Uses existing `fetchUnlockedCount` and `loadMoreUnlocked` callbacks

**Risk Assessment:**
- Low risk - only adds initialization logic, doesn't modify existing query or cache behavior
- The new effect has clear guards to prevent unnecessary execution
