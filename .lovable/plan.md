

## Change HOS Sync to Every 5 Minutes

**Current state**: The `hos-sync` cron job runs every 3 minutes (at minutes 1,4,7,10,...58).

**Change**: Update the cron schedule to run every 5 minutes at minutes 1,6,11,16,21,26,31,36,41,46,51,56.

### Steps

1. **Unschedule the existing cron job** (jobid 23, name `hos-sync-every-minute`)
2. **Create a new cron job** with the 5-minute schedule: `1,6,11,16,21,26,31,36,41,46,51,56 * * * *`

This is a single SQL operation via `cron.unschedule` + `cron.schedule`. No code or edge function changes needed.

