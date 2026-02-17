

## Add UUID Validation to All Profile Lookup Queries

### Problem
Database fields like `created_by`, `requested_by`, and `dispatcher_id` sometimes contain plain text names instead of UUIDs (legacy data). When passed to `.in("user_id", ids)` queries on `profiles`, PostgreSQL throws `invalid input syntax for type uuid`, causing failures and CPU spikes from retry loops.

### Approach
Use the existing `isValidUUID()` utility with simplified `.filter(isValidUUID)` syntax. Add `console.warn` logging when invalid UUIDs are filtered out. Also consolidate inline `uuidRegex` patterns to use the shared utility.

### Changes

**1. `src/pages/Drivers.tsx` (line 227)**
- Add import for `isValidUUID`
- Change: `const creatorIds = [...new Set((data || []).map(n => n.created_by).filter(Boolean))] as string[];`
- To: filter through `isValidUUID` with warning log

**2. `src/components/EditDriverDialog.tsx` (line 186)**
- Add import for `isValidUUID`
- Same pattern as Drivers.tsx for `creatorIds`

**3. `src/pages/YardArrivals.tsx` (line 137)**
- Add import for `isValidUUID`
- Same pattern for `creatorIds`

**4. `src/pages/EfsRequests.tsx` (lines 84, 119)**
- Add import for `isValidUUID`, remove local `isUUID` helper (line 84)
- Filter `requesterIds` through `isValidUUID` with warning log

**5. `src/hooks/useDriversRealtime.ts` (lines 48-50)**
- Add import for `isValidUUID`, remove inline `uuidRegex`
- Change dispatcher filter to use `.filter(isValidUUID)`

**6. `src/hooks/useTrucksRealtime.ts` (lines 64-65)**
- Add import for `isValidUUID`, remove inline `uuidRegex`
- Change dispatcher filter to use `.filter(isValidUUID)`

**7. `src/hooks/useReportsDateWindowAdapter.ts` (lines 415-421)**
- Add import for `isValidUUID`
- Filter `dispatcher_id` values through `isValidUUID` in the `useMemo`

### Pattern Applied

```typescript
import { isValidUUID } from "@/utils/validation";

const allIds = [...new Set(data.map(d => d.created_by).filter(Boolean))] as string[];
const ids = allIds.filter(isValidUUID);
if (ids.length < allIds.length) {
  console.warn(`[Context] Filtered ${allIds.length - ids.length} invalid UUIDs`);
}
```

### Files Already Safe (no changes needed)
- `useAutoSwitchOffice.ts` -- already uses `isValidUUID` at all 3 locations
- `useDailyDriverStats.ts` -- already uses `isValidUUID`

### Summary
7 files modified, inline regex consolidated, one local helper removed, defensive logging added. No behavioral changes for valid data.

