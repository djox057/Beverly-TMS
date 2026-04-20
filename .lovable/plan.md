

## Goal

Remove the 4 broken afterhours cron jobs and all supporting infrastructure so you can rebuild the afterhours automation from scratch with a clean slate.

## What gets removed

### 1. Cron jobs (4)
Unschedule by name via `cron.unschedule(...)`:
- `afterhours-start` (jobid 40)
- `afterhours-end` (jobid 41)
- `afterhours-end-dst` (jobid 42)
- `send-afterhours-sms-daily` (jobid 43)

### 2. Edge functions (2)
Delete from the codebase AND from Supabase deployment:
- `supabase/functions/process-afterhours-schedule/`
- `supabase/functions/send-afterhours-sms/`

Also remove their entries from `supabase/config.toml`:
```
[functions.process-afterhours-schedule]
verify_jwt = false

[functions.send-afterhours-sms]
verify_jwt = false
```

### 3. Database tables (2)
Created specifically for these crons — drop them entirely:
- `afterhours_cron_log` — execution tracking for the 2 functions
- `afterhours_sms_send_log` — per-SMS idempotency log (with its unique constraint on `(assignment_id, chicago_date)`)

Drop with `CASCADE` to remove dependent indexes/constraints automatically.

### 4. What we KEEP (intentionally)

These are used by the live afterhours UI (Reports badges, Fleets weekend assignment dialog, role flipping reads), not just by the crons — removing them would break working features:

- **`afterhours_schedule`** table — dispatcher day assignments (read by Reports + Fleets UI)
- **`afterhours_assignments`** table — driver↔dispatcher assignments (read by `useAfterhoursAssignments`, `useAfterhoursDriverMap`, etc.)
- **`CRON_SECRET`** secret — still useful as the standard cron auth pattern when you rebuild
- **`SUPABASE_ANON_KEY`** secret — system-managed, always present
- **RingCentral secrets** (`RINGCENTRAL_*`) — used by `send-sms` and other SMS functions
- **`app_role` enum value `'afterhours'`** — still referenced by RBAC, role-switching UI, and the `afterhours_schedule` table
- **All UI components** (`AfterhoursFleetTab`, `AfterhoursScheduleDialog`, `AssignAfterhoursDriversDialog`, `useAfterhoursAssignments`, etc.) — these are how users set up assignments; the crons just consumed that data

## Execution order (one migration + file deletes)

```text
Migration:
  1. SELECT cron.unschedule('afterhours-start');
  2. SELECT cron.unschedule('afterhours-end');
  3. SELECT cron.unschedule('afterhours-end-dst');
  4. SELECT cron.unschedule('send-afterhours-sms-daily');
  5. DROP TABLE IF EXISTS public.afterhours_sms_send_log CASCADE;
  6. DROP TABLE IF EXISTS public.afterhours_cron_log CASCADE;

File changes:
  7. Delete supabase/functions/process-afterhours-schedule/ (folder)
  8. Delete supabase/functions/send-afterhours-sms/ (folder)
  9. Remove the 2 [functions.*] blocks from supabase/config.toml
 10. Call supabase--delete_edge_functions to undeploy both
```

## Verification after cleanup

```sql
SELECT jobname FROM cron.job WHERE jobname LIKE '%afterhours%';
-- expect: 0 rows

SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name IN ('afterhours_cron_log','afterhours_sms_send_log');
-- expect: 0 rows

SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name IN ('afterhours_schedule','afterhours_assignments');
-- expect: 2 rows (preserved)
```

UI sanity check: `/fleets` afterhours tab still loads; assignments can still be created and read; nothing in Reports breaks.

## Files changed

- **New migration** — unschedule 4 crons + drop 2 log tables.
- **Deleted**: `supabase/functions/process-afterhours-schedule/index.ts`
- **Deleted**: `supabase/functions/send-afterhours-sms/index.ts`
- **Edited**: `supabase/config.toml` (remove 2 function entries)
- **Tool call**: `supabase--delete_edge_functions(["process-afterhours-schedule","send-afterhours-sms"])`

After this completes, the slate is clean: UI for managing assignments stays, but no automation runs and no log tables exist. You can then design the new cron approach from zero.

