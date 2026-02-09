

# Fix: "cannot extract elements from a scalar" in HOS Sync

## Root Cause

The `hos-sync` edge function double-serializes the `updates` array when calling the `bulk_update_hos` RPC:

```typescript
// Current (broken) - line 240-242
updates: JSON.stringify(updates)  // sends a JSON STRING like '"[{...}]"'
```

The Supabase JS client already serializes parameters to JSON. Wrapping in `JSON.stringify()` creates a **scalar string** instead of a JSON array. PostgreSQL's `jsonb_array_elements()` cannot iterate a scalar, throwing the error every time HOS sync runs.

Since HOS sync runs on a cron schedule, each failure retries and compounds, explaining the CPU spike to ~35%.

## Fix

One-line change in `supabase/functions/hos-sync/index.ts` (line 241):

```typescript
// Before (broken):
updates: JSON.stringify(updates)

// After (fixed):
updates: updates
```

Pass the raw JavaScript array directly -- the Supabase client handles serialization.

## Impact

- Eliminates all "cannot extract elements from a scalar" errors
- Removes the CPU spike caused by repeated failing HOS sync queries
- HOS data (drive/shift/break/cycle timers) will start updating on drivers again

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/hos-sync/index.ts` | Remove `JSON.stringify()` wrapper on line 241 |

Redeploy the `hos-sync` function after the change.

