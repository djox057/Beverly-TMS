

## Diagnosis

I tested all three functions and found the root causes:

1. **`process-afterhours-schedule` (role switching start + end)** -- returns **404 Not Found**. The function code exists in the repo but was **never deployed** to Supabase. This is why both the "start" and "end" cron jobs silently fail. The cron fires, pg_net sends the HTTP request, gets a 404 back, but pg_cron still reports "1 row" (it only cares that the SQL ran).

2. **`send-afterhours-sms` (weekend SMS)** -- IS deployed (returns 401 when called without auth, not 404). The manual button works because it passes the user's JWT token. The cron job uses CRON_SECRET from vault. This function likely works fine via cron on scheduled days -- it checks `afterhours_schedule` and skips if no schedule exists for today.

## Plan

### Step 1: Deploy `process-afterhours-schedule`
Deploy the existing edge function so the cron jobs can actually reach it. No code changes needed -- just deploy.

### Step 2: Verify cron schedules are correct
Current schedules (all UTC):
- **Job 33** (start): `0 12 * * 0,6` = Saturday & Sunday at 12:00 UTC = **7:00 AM Chicago (CDT)**
- **Job 36** (end): `0 23 * * 0,6` = Saturday & Sunday at 23:00 UTC = **6:00 PM Chicago (CDT)**
- **Job 32** (SMS): `0 13 * * *` = Every day at 13:00 UTC = **8:00 AM Chicago (CDT)**

These look correct for CDT. If you want different times, let me know.

### Step 3: Test the deployed function
Call the function with curl to confirm it responds correctly after deployment.

### Step 4: Verify SMS cron auth
Test `send-afterhours-sms` with the CRON_SECRET to confirm the vault-based auth works.

## Summary
The fix is literally just deploying the function -- no code rewrites needed. The "over complicated" part you might be remembering is fine, the function logic is straightforward. It just wasn't deployed.

