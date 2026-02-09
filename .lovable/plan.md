

## Fix: Infinite Retry Loop for "Not Found" Search Terms

### Problem

When you type a value in the Reports search bars that doesn't match anything (truck number, driver name, dispatcher, or load number), the auto-switch engine keeps hitting the database forever in an infinite loop.

**Why it happens:** The three search effects in `useAutoSwitchOffice` have guards to prevent re-searching when a result IS found (via `lastAutoSwitchRef`, `localMatchFoundRef`). But when the result is "not_found" or "error", NO ref is set to block the next run. Since `activeTab` is in the dependency array, any background data update or re-render re-triggers the effect, which hits the DB again, finds nothing, and repeats forever.

### Solution

Add a `lastSearchedTermRef` to track terms that have already been searched (regardless of result), preventing duplicate DB lookups for the same value.

### Changes

**File: `src/hooks/useAutoSwitchOffice.ts`**

1. Add a new ref to track already-searched terms:
```typescript
// Track terms that have already been searched via DB to prevent infinite retries
const lastSearchedTermsRef = useRef<{
  truck?: string;
  dispatch?: string;
  load?: string;
}>({});
```

2. In each of the 3 main effects (truck at ~line 519, dispatch at ~line 652, load at ~line 781), add a guard BEFORE the DB lookup:
```typescript
// Already searched this exact term - don't hit DB again
if (lastSearchedTermsRef.current.truck === debouncedTruckDriver) {
  return;
}
```

3. After the DB search completes (inside the `search()` async function), record the term:
```typescript
// In the finally block of each search():
lastSearchedTermsRef.current.truck = debouncedTruckDriver;
```

4. Clear the tracked term when the filter is cleared (in the empty-filter guard at top of each effect):
```typescript
if (!debouncedTruckDriver) {
  // ... existing cleanup ...
  delete lastSearchedTermsRef.current.truck;
  return;
}
```

This pattern mirrors what `useOrdersSearch` does with `failedTermsRef` - once a term has been searched, it won't be searched again until the user types something different.

### Other Search Bars Audit

| Location | Hook | Has retry protection? | Issue? |
|---|---|---|---|
| Reports search bars | `useAutoSwitchOffice` | No | **YES - fixing now** |
| Orders search bar | `useOrdersSearch` | Yes (`failedTermsRef`) | No |
| Orders filtered search | `useFilteredOrdersSearch` | Manual trigger only | No |
| Trips search bars | `useTripsLazyOrders` | Yes (`lastSearchKeyRef`) | No |
| Brokers search | Client-side filter | N/A | No |
| Broker combobox | Client-side filter | N/A | No |

Only the Reports auto-switch engine has this infinite retry bug. All other search bars are safe.

### Files Modified
1. `src/hooks/useAutoSwitchOffice.ts` - Add `lastSearchedTermsRef` guard to prevent infinite DB lookups for not-found terms

