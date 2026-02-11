

## Fix UUID Validation with Shared Utility

### Overview
Create a shared `isValidUUID` utility and apply it at all 4 locations where `dispatcher_id` values are used to query the `profiles` table, preventing "invalid input syntax for type uuid" errors.

### New File

**`src/utils/validation.ts`**
- Export an `isValidUUID(value: string): boolean` function using the same regex already proven in the realtime hooks
- Single source of truth -- no more inline regex copies to drift out of sync

### Changes to `src/hooks/useAutoSwitchOffice.ts`

This file has **3 independently constructed** `dispatcherIds` arrays in 3 separate callback functions. They are NOT a single array reused -- each is built inside its own `useCallback`:

1. **Line ~295-298** inside `resolveOfficesFromDispatcherIds` (helper used by `resolveOfficesFromTruckRows`): Builds dispatcherIds from `driverData.map(d => d.dispatcher_id)`. Add `isValidUUID` filter here.

2. **Line ~376** inside `lookupTruckDriverOffice` (driver name search branch): Builds its own `dispatcherIds` from `driverMatches.map(d => d.dispatcher_id)`. Add `isValidUUID` filter here.

3. **Line ~494** inside `lookupLoadOffice`: Builds its own `dispatcherIds` from `driverData.map(d => d.dispatcher_id)`. Add `isValidUUID` filter here.

Since all 3 are independent constructions, each needs the filter applied at construction time. Using the shared utility keeps it clean and consistent.

### Changes to `src/hooks/useDailyDriverStats.ts`

**Line ~273**: Single location where `dispatcherIds` is constructed from `drivers.map(d => d.dispatcher_id)`. Add `isValidUUID` filter at construction.

### Summary

| File | Locations | Change |
|------|-----------|--------|
| `src/utils/validation.ts` | New file | `isValidUUID` utility |
| `src/hooks/useAutoSwitchOffice.ts` | 3 (lines ~298, ~376, ~494) | Filter with `isValidUUID` at each array construction |
| `src/hooks/useDailyDriverStats.ts` | 1 (line ~273) | Filter with `isValidUUID` at array construction |

No database migration needed. Frontend-only defensive fix.

