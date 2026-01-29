

# Fix Real-Time Updates and Scrolling Lag in Orders Page

## Problem Summary

After implementing progressive loading, two issues emerged:
1. **Real-time updates not reflecting**: Locking/unlocking a load doesn't update the UI until page refresh
2. **Scrolling lag**: The page becomes laggy when scrolling horizontally

## Root Cause Analysis

### Issue 1: Real-Time Updates Not Working

The current architecture has **two competing data sources**:

```text
Current Data Flow (Broken):
┌─────────────────────────────────────────────────────────────────┐
│  useOrdersProgressive                                           │
│  ├── phase1Data (useState) ← Populated during Phase 1           │
│  ├── phase2Data (useState) ← Populated during Phase 2           │
│  └── mergedData (useMemo) ← Combines phase1Data + phase2Data    │
│                                                                 │
│  useOrdersRealtime                                              │
│  └── queryClient.setQueryData(["orders"], ...) ← Updates cache  │
└─────────────────────────────────────────────────────────────────┘
```

**The problem**: When `useOrdersRealtime` updates the React Query cache, the `mergedData` useMemo reads from the cache BUT the local state (`phase1Data`, `phase2Data`) remains unchanged. The `cacheVersion` subscription should trigger a re-render, but there's a timing issue:

1. The subscription fires on ANY cache event (not just this query key)
2. The `mergedData` useMemo only uses cache data when `progress.phase === "complete"`
3. When loading is complete, updates to local state variables don't propagate to the cache correctly

**Code evidence** (`useOrdersProgressive.ts` lines 271-279):
```typescript
useEffect(() => {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.query?.queryKey?.[0] === "orders") {
      setCacheVersion(v => v + 1);  // Fires on EVERY orders cache change
    }
  });
  return () => unsubscribe();
}, [queryClient]);
```

This subscription fires on every "orders" cache event, but the component might not be properly re-reading from the cache because:
- `mergedData` still prioritizes checking `freshCachedOrders` but there's a race condition
- The cache is updated by `useOrdersRealtime`, but the component continues to use stale local state

### Issue 2: Scrolling Lag (Performance)

The `cacheVersion` subscription (lines 271-279) increments on **every cache change** for any query starting with "orders". This causes:

1. Every cache update triggers `setCacheVersion(v => v + 1)`
2. This triggers a re-render of the entire component
3. The `mergedData` useMemo recalculates (deduplicates 11,000+ orders)
4. The Orders page re-renders with new data reference

When scrolling, if there are any background cache updates happening (even unrelated to visible data), the entire table re-renders.

## Solution: Use `useQuery` as Single Source of Truth

The fix is to make React Query the single source of truth, eliminating the dual-state architecture.

### Target Architecture

```text
Fixed Data Flow:
┌─────────────────────────────────────────────────────────────────┐
│  useOrdersProgressive                                           │
│  ├── useQuery(queryKey) ← Single source of truth                │
│  │   └── data: orders[] ← Auto-updates when cache changes       │
│  ├── Phase 1: queryClient.setQueryData(queryKey, unlockedOrders)│
│  ├── Phase 2: queryClient.setQueryData(queryKey, merged)        │
│  └── progress (useState) ← Only tracks loading progress         │
│                                                                 │
│  useOrdersRealtime                                              │
│  └── queryClient.setQueryData(["orders"], ...) ← Updates cache  │
│      └── useQuery automatically subscribes → UI updates         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Replace Local State with `useQuery`

**File**: `src/hooks/useOrdersProgressive.ts`

Remove:
- `phase1Data` state
- `phase2Data` state  
- `cacheVersion` state
- The cache subscription useEffect
- The complex `mergedData` useMemo

Add:
- `useQuery` hook that subscribes to the cache

```typescript
// New approach - useQuery subscribes to cache automatically
const { data: orders = [] } = useQuery({
  queryKey,
  queryFn: () => queryClient.getQueryData<any[]>(queryKey) || [],
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
```

### Step 2: Populate Cache Progressively During Loading

Instead of setting local state, update the cache directly:

**Phase 1 completion**:
```typescript
const transformedUnlocked = transformOrders(allUnlocked);
queryClient.setQueryData(queryKey, transformedUnlocked);
setProgress(prev => ({ ...prev, phase: 2, ... }));
```

**Phase 2 completion**:
```typescript
const transformedLocked = transformOrders(enrichedLockedOrders);
// Merge with existing unlocked orders in cache
queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
  const existingOrders = old || [];
  return [...existingOrders, ...transformedLocked];
});
setProgress({ phase: "complete", ... });
```

### Step 3: Remove Cache Subscription

Delete this entire block (lines 268-279):
```typescript
// DELETE THIS
const [cacheVersion, setCacheVersion] = useState(0);

useEffect(() => {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.query?.queryKey?.[0] === "orders") {
      setCacheVersion(v => v + 1);
    }
  });
  return () => unsubscribe();
}, [queryClient]);
```

When using `useQuery`, it automatically subscribes to cache changes for its specific query key. No manual subscription needed.

### Step 4: Keep Progress State (For UI Indicators Only)

Progress state remains for the loading indicator but is completely decoupled from data:

```typescript
const [progress, setProgress] = useState<ProgressiveLoadingProgress>({
  phase: 1,
  unlockedLoaded: 0,
  unlockedTotal: null,
  lockedLoaded: 0,
  lockedTotal: null,
  isLoadingLocked: false,
  percentComplete: 0,
});
```

### Step 5: Simplify Return Value

```typescript
return {
  data: orders,  // Directly from useQuery
  isLoading: progress.phase === 1 && orders.length === 0,
  isLoadingLocked: progress.isLoadingLocked,
  progress,
  unlockedCount: progress.unlockedLoaded,
  lockedCount: progress.lockedLoaded,
  totalCount: orders.length,
  isPartialData: progress.phase !== "complete",
};
```

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Data source | Local state (`phase1Data`, `phase2Data`) | React Query cache via `useQuery` |
| Real-time updates | Manual cache subscription with `cacheVersion` | Automatic via `useQuery` subscription |
| Cache population | Set local state, then sync to cache on complete | Update cache directly during each phase |
| Re-renders | Every cache event triggers re-render | Only changes to THIS query trigger re-render |

## Why This Works

1. **Real-time updates work**: When `useOrdersRealtime` calls `setQueryData(["orders"], ...)`, the `useQuery` hook in `useOrdersProgressive` automatically sees the change and triggers a re-render with the new data.

2. **No scrolling lag**: `useQuery` only re-renders when its specific query key's data changes, not on every cache event. The manual cache subscription that was causing excessive re-renders is removed.

3. **Navigation caching preserved**: The React Query cache still persists between navigation, so returning to `/orders` shows cached data instantly.

4. **Deduplication preserved**: The existing deduplication logic (which works well per your feedback) will be kept as-is.

