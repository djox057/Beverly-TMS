
I checked the live cron metadata, the live edge-function status, and the current afterhours data.

What I found:
1. The 3 cron jobs did run yesterday:
   - Job 33 `afterhours-start` at `2026-04-11 12:00 UTC`
   - Job 32 `send-afterhours-sms-daily` at `2026-04-11 13:00 UTC`
   - Job 36 `afterhours-end` at `2026-04-11 23:00 UTC`
   `cron.job_run_details` marks all 3 as `succeeded`, but that only means the SQL ran and `net.http_post(...)` returned a request id.

2. The cron definitions themselves look correct and are not the main problem:
   - `afterhours-start`: `0 12 * * 0,6` = 7:00 AM Chicago during CDT
   - `send-afterhours-sms`: `0 13 * * *` = 8:00 AM Chicago during CDT
   - `afterhours-end`: `0 23 * * 0,6` = 6:00 PM Chicago during CDT
   So this does not look like a simple DST schedule bug.

3. All 3 scheduled jobs use the same auth path:
   - They call the edge functions with `Authorization: Bearer <CRON_SECRET from vault>`
   - `process-afterhours-schedule` only accepts `CRON_SECRET`
   - `send-afterhours-sms` accepts either `CRON_SECRET` or a logged-in admin/manager JWT

4. Manual SMS working from Fleets strongly suggests the function logic is mostly fine, because the button uses the logged-in user JWT path, not the cron-secret path.

5. The role-switching clearly did not actually happen yesterday:
   - Saturday scheduled users still include several users left on `afterhours`
   - one scheduled Saturday user is still `dispatch`
   That means the function body did not successfully perform the start/end switch.

6. I could not find matching edge-function logs for those scheduled executions, which points away from “bad role update logic” and toward the scheduled request never being accepted/executed the way we expect.

Most likely root cause:
The shared failure point is the cron authentication/delivery path, not the business logic and not the time math. In plain terms: the cron SQL runs, but the HTTP call is likely not being accepted by the functions through the `CRON_SECRET` path. That would explain all 3 failures at once, while the manual button still works.

Implementation plan:
1. Harden the auth path for these 2 functions
   - Update `process-afterhours-schedule` and `send-afterhours-sms` to accept:
     - `CRON_SECRET`
     - and also `SUPABASE_SERVICE_ROLE_KEY` as a safe fallback for internal cron calls
   - Follow the same pattern already used in `cleanup-yard-arrivals`
   This gives the scheduled jobs a second valid internal auth route and removes the fragile single-point dependency on the current cron-secret path.

2. Add explicit structured logs
   - Log whether auth succeeded via `cron_secret`, `service_role`, or `user_jwt`
   - Log parsed Chicago date
   - Log action (`start` / `end`)
   - Log counts:
     - scheduled users found
     - assignments found
     - rows updated / skipped / failed
   Right now the lack of useful logs is slowing diagnosis.

3. Verify the data flow with a forced test
   - Trigger `process-afterhours-schedule` for both `start` and `end`
   - Trigger `send-afterhours-sms`
   - Confirm the functions now create visible edge logs and return success/expected skips
   - Confirm Saturday/Sunday scheduled users actually flip roles correctly

4. If needed, update the 3 cron SQL jobs
   - Keep the same schedules
   - Only change headers if necessary so they use the more reliable internal auth path
   - Do not change the times unless you explicitly want different Chicago hours

5. Final validation
   - Check yesterday/today schedule rows and current roles
   - Confirm a dispatcher scheduled for the shift moves:
     - `dispatch -> afterhours` at start
     - `afterhours -> dispatch` at end
   - Confirm the SMS cron enters the function and either sends messages or logs a clean “not scheduled day / no assignments” result

Technical notes:
- I do not think the current problem is “clock moved / DST broke everything.”
- I do think the current problem is “all 3 crons share the same scheduled-call auth path, and that path is the thing failing.”
- The fact that `process-afterhours-schedule` is live but yesterday produced no observable successful effect makes auth/delivery the highest-probability fix.
- I would keep the role-switching logic itself mostly unchanged unless the new logs prove a second bug.
