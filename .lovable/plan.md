## Goal
Stop the Google Sheets backup from running every 30 minutes — it's the likely cause of the recurring CPU spikes (correlated with the 91% spike at 07:15 CDT, which lined up exactly with the :15 cron tick).

## Change
Unschedule pg_cron job **`sync-google-sheets-every-30min`** (jobid 24, schedule `15,45 * * * *`).

Run via the Supabase insert tool (matches Lovable's rule that cron changes with project-specific URLs/keys don't go through migrations):

```sql
select cron.unschedule('sync-google-sheets-every-30min');
```

## What is NOT changed
- The `sync-google-sheets` edge function itself is left in place, so it can be triggered manually or re-scheduled later if needed.
- All other cron jobs (`hos-sync`, `update-truck-distances`, afterhours flips, POD reminders, etc.) are untouched.
- No code, RLS, or table changes.

## Verification
After running:

```sql
select jobid, jobname, schedule from cron.job where jobname = 'sync-google-sheets-every-30min';
```

Should return zero rows. The 07:15 and 07:45-style CPU spikes should stop within the next hour.

## Follow-up (optional, not part of this plan)
If the Google Sheets backup is still needed at all, we can later re-schedule it to a low-traffic hour (e.g. `0 4 * * *` = once daily at 04:00 UTC / 23:00 CDT) instead of every 30 min.
