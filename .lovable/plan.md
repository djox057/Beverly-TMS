

## Reduce Realtime Messages: Phases 1-4 Implementation

### Phase 1: Remove `reports-consolidated` channel

**File: `src/hooks/useReports.ts`**
- Delete the entire `useEffect` block at lines 220-297
- Eliminates 6 duplicate table subscriptions

### Phase 2: Remove `companies` from global hooks

**File: `src/hooks/useTrucksRealtime.ts`**
- Remove line 164: the `companies` listener from the channel chain

**File: `src/hooks/useDriversRealtime.ts`**
- Remove line 199: the `companies` listener
- Remove dead `handleCompanyChange` function (lines 178-191)

### Phase 3: Remove `order_files` listener only

**File: `src/hooks/useOrdersRealtime.ts`**
- Remove line 250: the `order_files` listener
- Keep `order_transfers` (line 249) -- no DB trigger links transfers to orders

### Phase 4: Replace adapter trucks/drivers channel with cache watching

**File: `src/hooks/useReportsDateWindowAdapter.ts`**
- Remove `trucksDriversChannelRef` (line 983)
- Replace the `useEffect` at lines 985-1044 with a cache subscription

Replacement code:

```typescript
useEffect(() => {
  if (!scopeEnabled) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleInvalidation = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: ["adapter-trucks", priorityOfficeRef.current, modeKeySuffixRef.current],
        refetchType: "active",
      });
      queryClient.invalidateQueries({
        queryKey: ["adapter-drivers", priorityOfficeRef.current, modeKeySuffixRef.current],
        refetchType: "active",
      });
    }, 1000);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" &&
        (event.query.queryKey[0] === "trucks" || event.query.queryKey[0] === "drivers")) {
      scheduleInvalidation();
    }
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
  };
}, [scopeEnabled, queryClient]);
```

The condition now uses explicit parentheses around the `||` to make the intent unambiguous: fire only when the event type is "updated" AND the query key is either "trucks" or "drivers".

### Preservation Note
EditOrder's `edit-order-realtime` channel is intentional and must NOT be removed in future optimization passes.

### Files Modified
1. `src/hooks/useReports.ts` -- Remove lines 220-297
2. `src/hooks/useTrucksRealtime.ts` -- Remove line 164
3. `src/hooks/useDriversRealtime.ts` -- Remove line 199 and lines 178-191
4. `src/hooks/useOrdersRealtime.ts` -- Remove line 250
5. `src/hooks/useReportsDateWindowAdapter.ts` -- Replace lines 982-1044 with cache subscription

### Expected Impact
~30-50% reduction in realtime messages across all high-volume tables.

