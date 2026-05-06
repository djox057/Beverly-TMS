# Fix HOS data — cron is failing with 401

## What's actually wrong

The HOS numbers shown for Arturo Favela (truck 0760) and every other driver are stale — they have not been updated since **2026-05-04 13:06 UTC**. That's why the values look nothing like reality (10h10m vs his real 8h48m). It's not a calculation bug, it's that the sync stopped running.

### Evidence
- All 959 drivers with HOS data have `hos_last_updated` older than 1 hour. Most recent value across the whole table: `2026-05-04 13:06:02 UTC`.
- The pg_cron job `hos-sync-every-5-min` is running every 5 minutes and reports `succeeded` (it successfully fires the HTTP call).
- But the response logged in `net._http_response` for every run since at least 2026-05-04 is:
  ```
  status_code: 401
  content: {"error":"Unauthorized"}
  ```
- Looking at `supabase/functions/hos-sync/index.ts`, the function only authorizes a request if:
  1. `Authorization: Bearer <CRON_SECRET>`, OR
  2. A valid user JWT belonging to a user with role admin/manager/dispatch/safety.

  The cron job is sending the **anon publishable JWT** as the bearer token. That token is not the `CRON_SECRET`, and `auth.getUser()` returns no user for it, so the function rejects with 401 every single run.

So Transit Tracking API is never queried, `bulk_update_hos` is never called, and the drivers table just keeps showing the values from May 4.

## Plan

1. **Update the pg_cron job `hos-sync-every-5-min`** to send `Authorization: Bearer <CRON_SECRET>` instead of the anon JWT, so the edge function authorizes the call. This is the only change needed to restore live HOS updates.
2. **After deploying**, verify by:
   - Re-checking `net._http_response` — newest row for the hos-sync URL should be `200` with `{"success":true,...}`.
   - Re-querying `drivers.hos_last_updated` — `max()` should be within the last few minutes.
   - Spot-checking Arturo Favela / truck 0760 — values should now match the ELD app.
3. **Audit other cron jobs** that hit edge functions the same way (e.g. the Samsara one is also failing with 500, and any other function that requires `CRON_SECRET`). Out of scope for this fix unless you want it included — let me know.

## Technical details

- Migration will use `cron.unschedule('hos-sync-every-5-min')` then `cron.schedule(...)` with the new headers JSON, since `CRON_SECRET` is already set in Vault. The new body:
  ```sql
  select net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')
    ),
    body := '{"time":"now"}'::jsonb
  );
  ```
- No code changes to `hos-sync/index.ts` are needed — its auth logic is correct; the cron just wasn't sending the right token.
- No frontend changes; the UI reads `drivers.hos_*` directly via `useDrivers` and will refresh automatically once data starts updating.

## Out of scope (ask if you want them added)

- Fixing the Samsara location cron (different function, different failure — 500, not 401).
- Adding alerting for stale HOS data so a future silent failure surfaces sooner.
