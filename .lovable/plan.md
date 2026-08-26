# Yard Report Integration — Read-Only Database Investigation

Scope: inspection only of Supabase project `wjkbtagwgjniilmgwutb`. No changes made. Everything below is labeled as **CONFIRMED** (verified by query), **INFERRED**, **RECOMMENDATION**, or **UNKNOWN**.

## 1. Relevant database structure (CONFIRMED)

### public.driver_yard_actions — the actual "Yard Report" table
Purpose: one row per yard arrival/report for a driver.

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | NO | — |
| action_type | text | NO | — |
| comment | text | NO | — |
| created_by | uuid | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| arrival_datetime | timestamptz | YES | — |
| is_checked | boolean | YES | false |
| is_team | boolean | NO | false |
| truck_number | text | YES | — |
| comment_eng | text | YES | — |

- PK: `driver_yard_actions_pkey (id)`
- FK: `driver_id -> drivers(id) ON DELETE CASCADE`; `created_by -> auth.users(id) ON DELETE SET NULL`
- CHECK: `action_type IN ('maintenance','return_truck','safety','recovery')`
- Unique constraints: **none**
- Indexes: PK on id, `driver_yard_actions_arrival_datetime_idx (arrival_datetime)`
- Trigger: `update_driver_yard_actions_updated_at` BEFORE UPDATE -> `update_updated_at_column()`
- No `status`, no `trailer_id`/`trailer_number`, no `truck_id` FK (truck is a text snapshot), no acceptance/withdrawal/archive columns, no soft delete.

### public.driver_yard_action_comments
| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| yard_action_id | uuid | NO | — |
| content | text | NO | — |
| author_id | uuid | YES | — |
| author_name | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

FK `yard_action_id -> driver_yard_actions(id) ON DELETE CASCADE`; index `idx_dyac_yard_action_id`; trigger `update_driver_yard_action_comments_updated_at`.

### Supporting objects (CONFIRMED, columns listed only where integration-relevant)
- **public.drivers** — PK `id`; unique `name`, `email`; FK `company_id -> companies(id)`, `dispatcher_id -> auth.users(id)`. Relevant columns: `name`, `first_name`, `last_name`, `is_active` (default true), `going_yard` boolean NOT NULL default false, `two_week_block_date` date, `company_id`, `company_name`, `dispatcher_id`, `last_dispatcher_id`, `last_dispatcher_name`, `hos_status`. 57 columns total.
- **public.trucks** — PK `id`; unique `truck_number`, `trailer_id`; FK `driver1_id`/`driver2_id`/`left_by_driver_id -> drivers(id)`, `trailer_id -> trailers(id)`, `company_id -> companies(id)`, `dispatcher_id -> profiles(user_id)`. This is where truck↔trailer↔driver linkage lives.
- **public.trailers** — PK `id`; unique `trailer_number`; columns include `trailer_type`, `status` (text, default `'available'`), `vin`, `plate`, `year`, `make`, `model`, `is_active`, `termination_date`, `dot_inspection_date`, `plate_expiration_date`, `insurance_expiration_date`, `vented`.
- **public.yard_loads** — separate concept (freight left at yard), PK `id`, FK `order_id -> orders(id) ON DELETE CASCADE`; columns `trailer_number`, `internal_load_number`, `delivery_date`, `delivery_city`, `delivery_state`, `truck_number`, `driver_name`, `broker_name`, `notes`. Not linked to `driver_yard_actions`.
- **public.orders** (130 cols) — loads; linked to drivers/trucks, not to yard actions.
- **public.user_roles** — PK `id`, unique `(user_id, role)`, FK `user_id -> auth.users(id)`, `role app_role`.
- **public.profiles** — PK `id`, unique `user_id`, FK `user_id -> auth.users(id)`; holds `full_name`, `email`, office etc.
- **public.roadside_inspections** — has `maintenance_check_yard` date, `yard_check_approved` boolean, `yard_check_approved_by` text (safety/maintenance yard check, separate flow).
- **public.assignment_history**, **public.truck_note_history**, **public.driver_company_history** — audit/history tables for equipment and driver changes.

**Objects that do NOT exist (CONFIRMED by column/table search):** no `yard_reports`, no in-house table or `in_house` column anywhere, no yard-report status table, no yard-arrival-reason lookup table, no teams/departments table (team is the boolean `is_team`), no yard-report audit table, no archive/soft-delete columns on yard actions.

## 2. Existing backend logic (CONFIRMED)

- `update_updated_at_column()` — generic timestamp trigger, applies to both yard tables.
- Edge Function `cleanup-yard-arrivals` (`verify_jwt = false`, cron-driven, auth via `CRON_SECRET` or service role): **hard-deletes** rows where `action_type IN ('maintenance','safety')` AND `is_checked = true` AND `arrival_datetime <= today 23:59:59` Chicago, then sets `drivers.going_yard = false` for affected drivers. This is the only lifecycle automation on yard reports, and it destroys history.
- Edge Function `translate-yard-note` — populates `comment_eng` (translation of `comment`).
- Triggers on `trucks`/`drivers` maintain company/dispatcher propagation and assignment history; reusable as the source of truth for truck→driver→trailer resolution.
- Realtime publication `supabase_realtime` includes: `daily_report_entries, driver_company_history, lost_day_notes, order_files, order_transfers, orders, pickup_drops, recruiter_salary_payments, truck_note_history, truck_notes, trucks, user_roles, weekly_plans`. **`driver_yard_actions` is NOT published to Realtime.**
- No webhooks, no status-change functions, no audit logging, and no soft-delete logic exist for yard reports (CONFIRMED — searched functions list and triggers).

## 3. Security and permissions (CONFIRMED)

Table grants (`relacl`): `anon`, `authenticated`, `service_role` all hold full DML on `driver_yard_actions` and `driver_yard_action_comments`; access is therefore gated by RLS only.

RLS on `driver_yard_actions`:
- SELECT `All authenticated users can view driver yard actions` — `true` (authenticated)
- SELECT `Roles can view driver_yard_actions` — `has_any_role(['yard','dispatch','afterhours','manager','admin','accounting','supervisor','maintenance'])`
- INSERT `All authenticated users can create driver yard actions` — `with_check true`
- UPDATE `All authenticated users can update driver yard actions` — `true` (no column restriction)
- DELETE `Roles can delete driver_yard_actions` — `has_any_role(['manager','admin','accounting','maintenance'])`

RLS on `driver_yard_action_comments`: SELECT any authenticated; INSERT only `admin`/`manager` and `author_id = auth.uid()`; UPDATE own; DELETE own or `admin`.

Identity: `auth.uid()` + `public.user_roles` via security-definer `has_role(_user_id, _role)` / `has_any_role(roles[])` / `auth_user_roles()`. Enum `app_role`: `dispatch, admin, manager, driver, safety, supervisor, accounting, afterhours, maintenance, chicago_management, yard, recruiting, claims`.

Note (INFERRED, security-relevant): `anon` has SELECT policies on `drivers` and `trailers` (`Anon can view drivers`, `Anon can view trailers` with `qual: true`), so the publishable key already exposes driver/trailer lists. No anon policy exists on `driver_yard_actions`.

No secrets are disclosed here.

## 4. Existing values and business logic (CONFIRMED)

`action_type` allowed values and live row counts:

| action_type | rows (is_checked=false / true) |
|---|---|
| maintenance | 3 / 5 |
| return_truck | 8 / 8 |
| safety | 3 / 2 |
| recovery | 5 / 2 |

- Category coverage: **Maintenance = `maintenance` (exists), Returning Truck = `return_truck` (exists), Recoveries = `recovery` (exists), Safety = `safety` (exists). Two-Week Notice does NOT exist as an `action_type`** — it is `drivers.two_week_block_date` (date) on the driver record.
- "Team/category": only `is_team` boolean (all current rows `false`). No department/team table.
- Status: the only state is `is_checked` boolean (INFERRED meaning: handled/completed). There is no pending/accepted/withdrawn/canceled/archived status, and no in-house flag.
- Related driver flag: `drivers.going_yard` boolean marks a driver as headed to the yard; reset by `cleanup-yard-arrivals`.

## 5. Integration recommendation (RECOMMENDATION)

Source of truth per field: report identity/reason/arrival/team → `driver_yard_actions`; driver name → `drivers.name` (join on `driver_id`); truck → `driver_yard_actions.truck_number` snapshot, with `trucks.truck_number` for live lookup; trailer → `trucks.trailer_id -> trailers.trailer_number` resolved at read time (no trailer stored on the report today); roles → `user_roles`.

- Retrieval: add `driver_yard_actions` to the Realtime publication and have the Yard App subscribe to INSERT/UPDATE/DELETE, with a reconciliation poll (`updated_at > last_seen`) every 1–5 min as a safety net. Prefer this over webhooks (none exist).
- Access method: Yard App uses the Supabase JS client with the publishable/anon key plus a real authenticated session whose user holds the `yard` role; all writes that must be restricted (acceptance, edits) go through an Edge Function using the service role. Never ship the service key to the Yard App.
- Write-back of acceptance: new columns on the TMS table (see migrations) written by an Edge Function `yard-report-accept` that stamps `accepted_at`, `accepted_by`, `yard_status = 'accepted'`.
- Editable by Yard App: `arrival_datetime`, `is_team`, `comment`/`comment_eng`, trailer/truck correction fields, and Yard-App-local operational fields. Read-only: `id`, `driver_id`, `action_type`, `created_by`, `created_at`.
- Concurrent edits: optimistic concurrency on `updated_at` (send `If-Match`-style predicate `updated_at = <value>`; reject on mismatch).
- Duplicate prevention: partial unique index on `(driver_id, action_type, arrival_datetime)` for non-withdrawn rows, plus idempotent upsert keyed on the TMS `id`.
- Stable IDs: use the TMS `driver_yard_actions.id` UUID as the Yard App's `tms_report_id`; never re-key.
- History: stop hard-deleting. Change `cleanup-yard-arrivals` to set an archive flag, and add an append-only `yard_report_events` audit table.
- Failed sync: outbox table with `attempts`, `last_error`, `next_retry_at`; exponential backoff; nightly full reconcile by `id` + `updated_at`.

Business answers (RECOMMENDATION — needs owner confirmation):
1. Withdrawn/deleted in TMS: if **pending** → remove from Yard App inbox; if **accepted with no activity** → mark `withdrawn_by_tms` and hide from the active board; if **activity attached** → never delete; mark `withdrawn_by_tms`, keep on the board flagged, require a yard supervisor to close it.
2. In-House should be set only on confirmed physical arrival (a separate Yard-App check-in), not on report creation — the TMS has no in-house concept at all today.
3. Integrate all four existing categories (`maintenance`, `return_truck`, `safety`, `recovery`). Two-Week Notice cannot be integrated as a report until it is modeled as a yard report or exported from `drivers.two_week_block_date`.

---

# IMPLEMENTATION HANDOFF FOR YARD APP AI

## Confirmed database facts
- Yard reports live in `public.driver_yard_actions` (12 columns, listed in §1). Comments in `public.driver_yard_action_comments`.
- `action_type` is constrained to exactly `maintenance`, `return_truck`, `safety`, `recovery`.
- The only state column is `is_checked boolean default false`. No status/accept/withdraw/archive/in-house columns exist.
- No trailer reference and no truck FK on the report; `truck_number` is a nullable text snapshot.
- No unique constraint on the report table — duplicates are currently possible.
- `driver_yard_actions` is not in the `supabase_realtime` publication.
- RLS: any authenticated user can read, insert, and update any row; delete limited to `manager, admin, accounting, maintenance`.
- `cleanup-yard-arrivals` Edge Function hard-deletes checked `maintenance`/`safety` reports past today (Chicago) and clears `drivers.going_yard`.
- Two-Week Notice exists only as `drivers.two_week_block_date`.

## Objects and fields the Yard App should use
`public.driver_yard_actions`, `public.driver_yard_action_comments`, `public.drivers` (`id`, `name`, `going_yard`, `two_week_block_date`, `company_name`, `dispatcher_id`), `public.trucks` (`truck_number`, `driver1_id`, `driver2_id`, `trailer_id`), `public.trailers` (`id`, `trailer_number`), `public.user_roles`, `public.profiles` (`user_id`, `full_name`).

## Field mapping
| Yard App field | TMS source | Notes |
|---|---|---|
| tms_report_id | driver_yard_actions.id | stable UUID key |
| truck_number | driver_yard_actions.truck_number | nullable snapshot; fallback via trucks by driver |
| trailer_number | trailers.trailer_number via trucks.trailer_id | derived; not stored on report |
| driver_name | drivers.name (join driver_id) | |
| reason / category | driver_yard_actions.action_type | 4 enum-like values |
| arrival_datetime | driver_yard_actions.arrival_datetime | nullable, tz-aware, Chicago display |
| team flag | driver_yard_actions.is_team | boolean |
| notes | comment / comment_eng | comment NOT NULL |
| reported_by | created_by -> profiles.full_name | |
| created/updated | created_at / updated_at | updated_at maintained by trigger |
| handled flag | is_checked | current TMS completion signal |

## Recommended event/API flow
1. TMS insert → Realtime INSERT (after publication change) → Yard App inserts local row `status='pending_acceptance'` (gray).
2. Yard App user edits permitted fields → Edge Function `yard-report-update` (service role, validates `updated_at`).
3. Accept → Edge Function `yard-report-accept` → sets `yard_status='accepted'`, `accepted_at`, `accepted_by`; Yard App moves row to the board.
4. Reconciliation poll on `updated_at` + nightly full compare by `id`.

## Authentication requirements
Yard App browser client: publishable/anon key + authenticated Supabase session; the user must hold the `yard` role in `user_roles`. Privileged writes: server-side Edge Function using `SUPABASE_SERVICE_ROLE_KEY` from function env only. No keys in client code or repos. Do not add `anon` policies to `driver_yard_actions`.

## Status lifecycle (proposed, does not exist yet)
`pending_acceptance -> accepted -> in_progress -> completed`, with side states `withdrawn_by_tms`, `canceled`, `archived`.

## Editable vs read-only
Editable by Yard App: `arrival_datetime`, `is_team`, `comment`, trailer/truck correction, Yard-App-local status fields. Read-only: `id`, `driver_id`, `action_type`, `created_by`, `created_at`, `updated_at`.

## Withdrawal / cancellation / deletion behavior
Pending → drop from inbox. Accepted, no activity → mark withdrawn, hide. Accepted with activity → keep, flag withdrawn, manual close. Replace the hard delete in `cleanup-yard-arrivals` with archiving so IDs never disappear under the Yard App.

## Duplicate prevention
Idempotent upsert on `tms_report_id`, plus a TMS-side partial unique index on `(driver_id, action_type, arrival_datetime)` where not withdrawn/archived.

## Error and retry handling
Outbox + exponential backoff (`attempts`, `last_error`, `next_retry_at`), dead-letter after N tries, nightly reconcile, structured logging of rejected optimistic-concurrency writes.

## Required database changes (proposed only — NOT executed)
```sql
-- 1) Lifecycle + acceptance state on the TMS report table
ALTER TABLE public.driver_yard_actions
  ADD COLUMN yard_status text NOT NULL DEFAULT 'pending_acceptance',
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN in_house boolean NOT NULL DEFAULT false,
  ADD COLUMN trailer_number text;

ALTER TABLE public.driver_yard_actions
  ADD CONSTRAINT driver_yard_actions_yard_status_check
  CHECK (yard_status IN ('pending_acceptance','accepted','in_progress','completed','withdrawn','canceled','archived'));

-- 2) Duplicate prevention
CREATE UNIQUE INDEX driver_yard_actions_no_dupe
  ON public.driver_yard_actions (driver_id, action_type, arrival_datetime)
  WHERE archived_at IS NULL AND withdrawn_at IS NULL;

-- 3) Append-only audit trail
CREATE TABLE public.yard_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yard_action_id uuid NOT NULL REFERENCES public.driver_yard_actions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_name text,
  source text NOT NULL DEFAULT 'tms',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.yard_report_events TO authenticated;
GRANT ALL ON public.yard_report_events TO service_role;
ALTER TABLE public.yard_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Yard roles can read yard report events"
  ON public.yard_report_events FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['yard','manager','admin','maintenance','safety']::app_role[]));

-- 4) Realtime for the report table
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_yard_actions;

-- 5) Tighten write access (replace blanket authenticated UPDATE)
DROP POLICY "All authenticated users can update driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Yard and management can update yard actions"
  ON public.driver_yard_actions FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['yard','manager','admin','maintenance','safety','dispatch','afterhours','supervisor']::app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['yard','manager','admin','maintenance','safety','dispatch','afterhours','supervisor']::app_role[]));
```
Also required (code, not SQL): change `cleanup-yard-arrivals` from `DELETE` to setting `archived_at`.

## Unknowns / open questions
- What "team/category" means in the Yard App vs the TMS `is_team` boolean — UNKNOWN.
- Whether Two-Week Notice should become a fifth `action_type` or be exported from `drivers.two_week_block_date` — UNKNOWN.
- Which Yard App identities exist and whether they are the same Supabase users as TMS users — UNKNOWN (not inspectable from the database).
- Whether the Yard App is a separate Supabase project or shares this one — UNKNOWN; the recommendations assume shared project.
- Cron schedule definitions could not be inspected (pg_cron catalog not readable through the read-only query tool) — the `cleanup-yard-arrivals` schedule is therefore UNVERIFIED, though the function itself is confirmed.
- Retention policy for archived reports — UNKNOWN.
