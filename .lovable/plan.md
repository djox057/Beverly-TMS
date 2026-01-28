
# Fix Reports Page Tab Switching Flicker

## Problem Summary
When switching between office tabs on the Reports page, users briefly see "No drivers assigned" message even when data exists. This happens because of a state synchronization issue between the active tab and the deferred data.

## Technical Root Cause
1. `activeTab` changes immediately on tab click
2. `groupedReports` is wrapped in `useDeferredValue` and lags behind
3. The `loadedOffices` tracking approach tracks "ever loaded" not "currently in data"
4. When filtering old data with new tab name, result is empty
5. Since office was "ever loaded", system shows empty state instead of skeleton

## Solution
Replace the `loadedOffices` tracking state with a direct check: does the current `groupedReports` actually contain data for the `activeTab`?

## Changes Required

### File: `src/pages/Reports.tsx`

**1. Remove the `loadedOffices` state and its effect (lines ~351-396):**
- Delete `const [loadedOffices, setLoadedOffices] = useState<Set<string>>(new Set());`
- Delete the `useEffect` that populates `loadedOffices`

**2. Add a direct data check:**
```typescript
// Check if current groupedReports contains data for the active tab
const hasDataForActiveTab = useMemo(() => {
  if (!groupedReports || groupedReports.length === 0) return false;
  return groupedReports.some(group => group.office === activeTab);
}, [groupedReports, activeTab]);
```

**3. Update the render conditional (lines ~3120-3125):**

Before:
```typescript
{isLoading || groupedReports == null ? (
  <LoadingSkeleton />
) : activeOfficeReports.length === 0 && !loadedOffices.has(activeTab) ? (
  <LoadingSkeleton />
) : activeOfficeReports.length === 0 ? (
```

After:
```typescript
{isLoading || groupedReports == null || !hasDataForActiveTab ? (
  <LoadingSkeleton />
) : activeOfficeReports.length === 0 ? (
```

## Why This Works
- `hasDataForActiveTab` is `false` when `groupedReports` doesn't contain `activeTab` data
- During the lag period (useDeferredValue), old data won't have new office → shows skeleton
- Once data arrives with correct office, `hasDataForActiveTab` becomes `true`
- If office truly has no dispatchers/trucks, it will be in the data with empty trucks array, so `hasDataForActiveTab` is `true` but `activeOfficeReports.length === 0` → shows empty state

## Benefits
- Simpler code (removes state + effect)
- More reliable (checks actual data, not tracking state)
- No race conditions between tab changes and data updates
