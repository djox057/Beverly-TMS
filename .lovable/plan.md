# RingCentral Activity Analytics (Dispatcher Performance)

Read-only call + SMS analytics per dispatcher, shown on the Dispatcher Performance cards and the dispatcher detail page. Nothing is ever sent, deleted or marked read in RingCentral.

## What was found in the project (verified)

- RingCentral is already integrated, but **outbound SMS only**: `supabase/functions/send-sms/index.ts` and `send-afterhours-sms/index.ts` authenticate with JWT client credentials using `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_JWT_TOKEN`, `RINGCENTRAL_SERVER_URL`, `RINGCENTRAL_PHONE_NUMBER`. There is no call-log, message-store or analytics code, and no RingCentral tables.
- `profiles` has `phone_number` (78 of 196 rows filled) and `ext` (100 filled) — these are the mapping keys.
- No per-user company membership model exists (the `companies` table holds legal entities, not user tenancy), so isolation is by **role**, not by company.

Not yet verified: whether the existing RingCentral app has `ReadCallLog` and `ReadMessages` scopes and an admin-authorized JWT. This is the first step of implementation; if a scope is missing, work stops and the exact RingCentral console change is reported — no workaround.

## Decisions

- Mapping: match RingCentral extension to a Beverly user by **E.164 phone number first**, `ext` as fallback; unmatched extensions are stored as unassigned.
- Backfill: last 30 days.
- Access: **admin + manager only** (UI gating + RLS).
- Timezone: America/Chicago for daily grouping, configurable.

## Vertical slice first

1. Verify auth + scopes against RingCentral.
2. Pull one extension, one day (calls + messages).
3. Normalize, dedupe by `sessionId`, compute metrics.
4. Upsert idempotently.
5. Render on one dispatcher card + detail page.
6. Compare numbers with the RingCentral admin call log before going wider.

Only after that: scheduling, backfill, account-wide sync.

## Database (migration)

- `ringcentral_extensions` — extension id, extension number, RC name, assigned phone numbers, matched `user_id`, match method (`phone` | `ext` | `unmatched`), timezone, active flag.
- `ringcentral_phone_metrics` — daily aggregate: `ringcentral_extension_id`, `ringcentral_phone_number`, `user_id`, `metric_date`, `timezone`, inbound/outbound/answered/missed calls, `total_call_seconds`, `live_talk_seconds`, `average_answered_call_seconds`, inbound/outbound/failed SMS, `last_synced_at`. Unique on (extension, phone number, metric_date).
- `ringcentral_call_records` — minimal per-call rows for dedupe and traceability: RC record id, `session_id`, direction, result, duration, ring/hold time, from/to E.164, started at. Unique on RC record id.
- `ringcentral_message_records` — RC message id, `conversation_id`, type, direction, status, from/to E.164, creation time. **No message bodies or attachments.**
- `ringcentral_sync_state` — sync scope, last successful sync, last attempt, cursor/page, error category, error count.

All tables: explicit GRANTs (`authenticated` select, `service_role` all), RLS enabled, SELECT policies restricted to admin + manager via `has_any_role`. Writes only by the service role from edge functions.

## Edge functions

New `supabase/functions/_shared/ringcentral/` module: `auth.ts` (token cache), `client.ts` (fetch with timeout, bounded retry + exponential backoff on 429/5xx), `normalize.ts` (E.164, direction/result mapping), `dedupe.ts` (sessionId call-leg collapsing), `metrics.ts`.

- `ringcentral-sync` — `POST { scope, dateFrom, dateTo, extensionIds? }`. Manual/scheduled sync. Reads `GET /restapi/v1.0/account/~/call-log?view=Detailed` with pagination, `POST /analytics/calls/v1/accounts/~/aggregation/fetch` (grouped by Users and CompanyNumbers) for cross-checked totals, and `GET /restapi/v1.0/account/~/extension/{id}/message-store?messageType=SMS` per extension. Hard page cap. Upserts aggregates; on failure keeps existing values (never zeroes them) and records the error category.
- `ringcentral-extensions-sync` — refreshes the extension/phone-number roster and re-runs matching.
- `ringcentral-activity` — read API for the UI: validates the caller JWT, enforces admin/manager, returns the normalized `{ period, phoneNumber, extensionId, calls, messages, sync }` shape, supports date range, extension/user filter, RC number filter and external-number search (matches `from` or any `to`).

`verify_jwt = false` in `config.toml` for the sync functions (in-code validation / cron), JWT validated in code for `ringcentral-activity`.

Cron (via `pg_cron` + `pg_net`): incremental sync every 20 minutes; nightly reconciliation of the previous Chicago day.

Logging redacts tokens, phone numbers beyond last 4, and never logs message content.

## Frontend

- `src/hooks/useRingCentralActivity.ts` — react-query hook over `ringcentral-activity`.
- `src/pages/DispatcherTier.tsx` — compact badges on each card for admin/manager: calls, answered/missed, talk time, SMS. Hidden for other roles.
- `src/pages/DispatcherTierDetail.tsx` — new "Phone Activity" section: date-range selector, extension / RC number selectors, optional external number search, summary cards (total calls, answered, missed, talk time, avg call duration, total SMS, inbound, outbound), per-extension table, daily trend chart, inbound/outbound and answered/missed breakdowns, last successful sync status.
- Durations rendered as `12h 24m`; seconds preserved in DB and API.

## Tests

Deno tests under `supabase/functions/ringcentral-sync/`: successful admin auth; missing `ReadCallLog`; missing `ReadMessages`; expired credentials; call and message pagination; multiple legs sharing a `sessionId`; transfers/forwards; missing phone numbers; E.164 normalization; inbound/outbound/failed SMS; duplicate provider records; replayed sync idempotency; 429 rate limit backoff; 4xx and 5xx handling; partial failure preserving prior metrics; midnight timezone boundaries; external-number filtering. Plus SQL checks that a dispatch-role user cannot read the metrics tables.

## Deliverables at the end

Summary, files changed, migrations, required env vars, required RingCentral permissions, test results, one example API response, known limitations (RC analytics history window, extensions without a mapped user, SMS counted per mailbox), and deployment + rollback steps. No credentials touched; nothing deployed to production without explicit instruction.
