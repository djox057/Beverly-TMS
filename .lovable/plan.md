

## Root cause (confirmed against live DB + logs)

The cron jobs ARE firing — but the edge functions **never run**. Here's the proof:

| Check | Result |
|---|---|
| `cron.job` (jobs 40–43) | ✅ All 4 active with the new schedules |
| `cron.job_run_details` for last 24h | ✅ All 5 fires today: `succeeded` (12 UTC, 13 UTC, 14 UTC, 23 UTC, 00 UTC) |
| `afterhours_cron_log` table | ❌ **0 rows** — function never inserted its "started" row |
| Edge function logs (`send-afterhours-sms`, `process-afterhours-schedule`) | ❌ **"No logs found"** — handler never executed |

**Why:** the cron SQL uses
```sql
'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
```

Reading `vault.decrypted_secrets` from `pg_cron`'s background worker context is **blocked** (we hit the exact same block ourselves: `blocked_query: query attempted to access vault.decrypted_secrets`). The subquery returns `NULL`, and `'Bearer ' || NULL = NULL`, so the `Authorization` header is missing. The Supabase Edge Functions **gateway rejects the request with 401 before our code runs** — that's why there are zero function logs, zero cron-log rows, and the response gets cleared from `net._http_response` quickly (failed-to-route requests aren't retained the same way).

Every other cron in this project that actually works (`record-lost-days-daily`, `hos-sync-every-5-min`, `update-truck-distances-cron`, etc.) embeds the **literal anon key as a hardcoded string** in the SQL — not a vault subquery. That's the proven pattern we need to copy.

The `pg_net` 5s timeout (the previous theory) is a real ceiling on other crons, but it isn't what's breaking these — these never even reach the function.

## Fix (one migration, no code changes needed)

Replace the 4 cron jobs with the working pattern: literal anon key in the `Authorization` header, literal `CRON_SECRET` in `x-cron-secret`. The anon key is already a public token (it's even in `.env`), and `CRON_SECRET` lives in cron internal config — both are safe to inline in the cron definition.

```text
For each of jobs: afterhours-start, afterhours-end, afterhours-end-dst, send-afterhours-sms-daily

  cron.unschedule(<name>)
  cron.schedule(<name>, <existing schedule>, $$
    SELECT net.http_post(
      url    := '<existing URL incl ?action=… for start/end>',
      headers := '{"Content-Type":"application/json",
                  "Authorization":"Bearer <ANON_KEY_LITERAL>",
                  "x-cron-secret":"<CRON_SECRET_LITERAL>"}'::jsonb,
      body   := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$)
```

Schedules and URLs stay exactly as they are now — already DST-safe (dual-hour fires + in-function Chicago-hour self-check).

The edge function code (already deployed) is untouched: it accepts `x-cron-secret` as the primary auth method, runs work in `EdgeRuntime.waitUntil`, returns 200 immediately, chunks SMS at 30/call with self-invocation, and logs to `afterhours_cron_log` + `afterhours_sms_send_log`.

## Verification after the migration runs

I'll run these to confirm:
1. `SELECT * FROM afterhours_cron_log ORDER BY started_at DESC LIMIT 10` — should populate on the next 13 UTC / 14 UTC / 23 UTC / 00 UTC fire (a "skipped: wrong-hour" row counts as success).
2. Edge function logs for `send-afterhours-sms` and `process-afterhours-schedule` — should now show invocations.
3. After the next 8 AM Chicago fire: `SELECT chicago_date, COUNT(*), SUM(success::int) FROM afterhours_sms_send_log GROUP BY 1` — should equal that day's `afterhours_assignments` count.

## Files changed

- **New migration**: re-creates the 4 cron jobs with literal-string headers. No edge function or app code changes.

