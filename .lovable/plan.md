## Fix: Create the Missing `cleanup-yard-arrivals` Edge Function

### Problem

A `pg_cron` job runs at midnight UTC calling `https://.../functions/v1/cleanup-yard-arrivals`, but **this edge function was never created**. The function directory doesn't exist in `supabase/functions/`. Every night the cron fires and gets a 404.

### Solution

Create the `cleanup-yard-arrivals` edge function that mirrors the existing manual cleanup logic from `YardArrivals.tsx` (lines 431-476).

### Implementation

**1. Create `supabase/functions/cleanup-yard-arrivals/index.ts**`

Logic (using service role client):

- Get current date in Chicago timezone (consistent with the rest of the app)
- Query `driver_yard_actions` where `action_type` IN ('maintenance', 'safety'), `is_checked = true`, and `arrival_datetime <= today 23:59:59 Chicago time`
- Delete matching rows
- Collect unique `driver_id`s from deleted rows and set `going_yard = false` on those drivers
- Log counts and return summary JSON

Standard CORS headers + auth validation (cron secret or service role key, same pattern as `clear-weekly-plans`).

**2. Add to `supabase/config.toml**`

```toml
[functions.cleanup-yard-arrivals]
verify_jwt = false
```

### Cron Schedule Note

The existing cron job runs at `0 0 * * *` (midnight UTC = ~7PM Chicago / ~6PM Chicago DST). If you want it to run at midnight Chicago time instead, the cron schedule would need updating to `0 5 * * *` (5 AM UTC ≈ midnight CDT) or `0 6 * * *` (6 AM UTC ≈ midnight CST). The function itself will use Chicago time for date comparison regardless, so the current schedule will still work — it just runs in the evening Chicago time rather than midnight.

### Files

- **Create**: `supabase/functions/cleanup-yard-arrivals/index.ts`
- **Edit**: `supabase/config.toml` — add verify_jwt = false entry

Activate it once you create it