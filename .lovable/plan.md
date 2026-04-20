

## Goal

Execute the write-mode verification steps (9, 10, 11, 12) that plan mode cannot perform. All checks 1–8 already passed against live DB and code.

## What will run

### Step A — Identify a safe test user
```sql
select ur.user_id, p.email, p.full_name, array_agg(ur2.role) as all_roles
from public.user_roles ur
join public.profiles p on p.user_id = ur.user_id
left join public.user_roles ur2 on ur2.user_id = ur.user_id
where ur.role = 'dispatch'
group by ur.user_id, p.email, p.full_name
limit 5;
```
You pick the UUID. I won't proceed without it — flipping a real dispatcher's role mid-shift is disruptive.

### Step B — Dry-run flip (check 9)

1. Insert today's schedule row for the chosen test user.
2. Create `public.flip_afterhours_roles_test(direction text)` — copy of the real function with the hour guard removed (forces `chicago_hour := 6` for promote, `17` for revert in the log entries).
3. Run `select public.flip_afterhours_roles_test('promote');`
4. Read `role_flip_log` (last 5 entries) and `user_roles` for the test user — expect one `flipped` entry and role now = `afterhours`.
5. Run `select public.flip_afterhours_roles_test('revert');` — expect role back to `dispatch` and a second `flipped` entry.
6. Drop `flip_afterhours_roles_test`.
7. Delete today's test schedule row.

### Step C — Invariant test (check 10)

1. Insert a second `user_roles` row giving the test user both `dispatch` and `afterhours`.
2. Re-create `flip_afterhours_roles_test` momentarily.
3. Run `select public.flip_afterhours_roles_test('promote');`
4. Verify `role_flip_log` has `action='error'`, message mentions "Invariant violated", and **both** roles still present on the user.
5. Clean up: drop the extra `afterhours` row, drop the test function, delete the test schedule row.

### Step D — Realtime end-to-end smoke test (check 11)

This is interactive — requires a signed-in browser session. Two options:

- **You drive it**: keep your own session open, tell me your `auth.uid()`, I'll run `update user_roles set role='afterhours' where user_id='<you>' and role='dispatch'` then revert ~5s later. You watch the sidebar and tell me what you saw.
- **Skip until 4/26**: trust that checks 1–8 prove the wiring is correct and let the first real cron firing on 2026-04-26 serve as the live smoke test.

### Step E — First real firing (check 12, 2026-04-26)

No action now. Calendar reminder for 2026-04-26 evening:
```sql
select * from public.role_flip_log where chicago_date = '2026-04-26' order by executed_at;
select * from cron.job_run_details
  where jobid in (44,45,46,47) and start_time >= '2026-04-26'
  order by start_time;
```
Expect 3 `flipped` rows in the morning (promote) + 3 in the evening (revert), one cron run per direction did work and the off-DST sibling exited at the hour guard.

## What I need from you before executing

1. The test user UUID for steps B and C (or "use the first dispatcher returned by Step A").
2. Whether you want to do the realtime smoke test (D) now or defer.
3. Approval to execute the writes — there will be 4 small migrations (insert schedule, create test fn, drop test fn, cleanup), each idempotent and reversible.

## Files / DB objects touched

- **Temporary**: `public.flip_afterhours_roles_test(text)` — created and dropped within the same session
- **Temporary rows**: `afterhours_schedule` (1 row, deleted after) and `user_roles` (1 extra row for invariant test, deleted after)
- **Permanent rows**: `role_flip_log` entries from the test runs — these stay as audit history (they're labeled with `chicago_hour` matching the test direction, easy to identify)

No production code, function, cron job, or RLS policy is modified.

