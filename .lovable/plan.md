
# Fix Auto-Switch Office Logic on /reports Page

## Problem Summary
When a user searches for a load number (like "420294") while on a tab that doesn't have that load, the page should automatically switch to the correct office tab. This functionality stopped working after the backend was changed to use the date-window adapter.

## Root Causes Identified

### 1. Background Fetch Blocking (Primary Issue)
The auto-switch `useEffect` has an early return when `isFetchingBackground` is true:
```typescript
if (isFetchingBackground) return;
```
When switching between tabs, the adapter fetches data for the new office, keeping `isFetchingBackground` true. This blocks the database lookup from ever executing.

### 2. Supabase Join Syntax Error
The nested relationship syntax is incorrect:
```typescript
drivers!orders_driver1_id_fkey(
  dispatcher_id,
  profiles:dispatcher_id(office)  // ← Incorrect syntax
)
```
The `profiles:dispatcher_id` syntax attempts to follow a FK relationship, but the actual foreign key from `drivers.dispatcher_id` references `profiles.user_id`, not `profiles.id`. This likely returns `null` for the office.

### 3. Condition Logic Flaw
The check `if (currentTabReports.length > 0) return` is checking if ANY reports exist on the current tab, but since the search filter is already applied in `filterReportsByOffice`, this actually checks if any matching loads exist on the current tab - which is correct, but the timing with `isFetchingBackground` causes issues.

## Solution

### Step 1: Fix the Background Fetch Blocking
Remove or modify the `isFetchingBackground` guard to allow searches to proceed even during background fetches. The search is a separate database query that doesn't depend on the adapter's data.

```typescript
// Before
useEffect(() => {
  if (!debouncedLoadNumberFilter) return;
  if (isFetchingBackground) return;  // ← Remove this blocker
  ...
});

// After
useEffect(() => {
  if (!debouncedLoadNumberFilter) return;
  // Remove isFetchingBackground check - search is independent
  ...
});
```

### Step 2: Fix the Supabase Query Syntax
Replace the broken nested join with a simpler, working query that manually joins to get the office:

```typescript
// Before (broken)
.select(`
  id,
  driver1_id,
  drivers!orders_driver1_id_fkey(
    dispatcher_id,
    profiles:dispatcher_id(office)
  )
`)

// After (fixed)
.select(`
  id,
  driver1_id,
  drivers!orders_driver1_id_fkey(dispatcher_id)
`)
// Then fetch office in a separate query
```

Or use a direct SQL approach via RPC if needed:
```sql
SELECT p.office 
FROM orders o
JOIN drivers d ON o.driver1_id = d.id
JOIN profiles p ON d.dispatcher_id = p.user_id
WHERE o.broker_load_number ILIKE '%searchTerm%'
  AND o.status != 'locked'
  AND o.canceled = false
LIMIT 1
```

### Step 3: Add Debounce Protection
Add a flag to prevent multiple simultaneous searches:

```typescript
const isSearchingRef = useRef(false);

useEffect(() => {
  if (!debouncedLoadNumberFilter) return;
  if (isSearchingRef.current) return;
  
  const searchLoadNumber = async () => {
    isSearchingRef.current = true;
    try {
      // ... search logic
    } finally {
      isSearchingRef.current = false;
    }
  };
  
  searchLoadNumber();
}, [debouncedLoadNumberFilter, activeTab]);
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Reports.tsx` | Fix the auto-switch useEffect (lines 2605-2681): remove isFetchingBackground guard, fix Supabase query syntax, add search debounce protection |

## Testing Plan
1. Navigate to /reports
2. Select "Recovery" tab (or any tab without load 420294)
3. Enter "420294" in the Load # search field
4. Verify the page automatically switches to "ČAČAK" tab
5. Verify the matching load is displayed

## Technical Notes
- The fix maintains the existing search behavior for internal load numbers with suffixes
- The database lookup remains independent of the date-window adapter's cache
- Real-time subscriptions continue to work normally after the switch
