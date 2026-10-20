# Low driving-time delivery reminders

Checks every five minutes (UTC minutes 4,9,...59, after HOS sync). Sends from `jon@bfprime.net` to the driver's dispatcher and the unique manager of that dispatcher's office. Current afterhours or weekend coverage replaces the dispatcher; manager remains. Conflicting coverage/manager assignments fail closed and are logged.

Eligibility: 0–60 driving minutes, HOS observed AND provider source timestamps within 20 minutes, Samsara cache within 20 minutes and GPS source within 30 minutes. Missing/future timestamps and changed truck assignments do not qualify. Only a uniquely identified picked-up active load and its next unfinished delivery qualify. Excludes canceled/completed/delivered/POD loads, arrived deliveries, ambiguous loads and unfinished multi-pickups. Current truck and load must both contain the driver. Teams are evaluated per driver, matching the existing HOS sync model (which currently copies truck HOS onto both team drivers).

Uses delivery stop coordinates and fresh Samsara GPS, with the existing TMS estimate: Haversine × 1.3. Tests the unrounded estimate against 40 miles. It does not use the generic telemetry distance, which can refer to pickup or a previous destination. The email explicitly identifies estimated distance. No new provider endpoint or credentials are needed.

Sources: `driver_hos_state` (minutes, observed_at, source_at, truck_id), `samsara_locations_cache` (fetched_at, locations[].timestamp/latitude/longitude/truck_id), `orders`, `pickup_drops`, `drivers.dispatcher_id`, `profiles`, `user_roles`, and the existing afterhours assignment tables. Weekend date uses America/Chicago, active shift uses Europe/Belgrade: night 22–06 (previous scheduled date before 06), morning 06–14. Active shift wins over weekend, consistent with Reports.

Backend only: CRON_SECRET authentication, service-role reads, no client/RLS access to audit table or claim RPC. One email per order/driver/delivery stop/recipient. New coverage recipients can receive the reminder at handoff. Atomic claims lease for four minutes; retries are capped at 10 attempts/23 hours. Frozen payload plus Resend idempotency key protects against retries after uncertain delivery. Retries recheck current eligibility; no obsolete alerts after completion or stale data. Email errors are persisted; missing routing is counted/logged without guessing recipients.

Dry run: authenticated POST `{"dryRun":true}` returns candidates without claims or email. Kill switch: `select cron.unschedule('send-low-drive-reminders');`. Audit: `low_drive_reminders` includes attempts, sent_at, provider_message_id, last_error. No realtime publication.

Validation: `node --test scripts/tests/low-drive-reminders.test.mjs`; TypeScript check for rules/worker; live dry run; transaction-rolled-back claim/retry/dedup database checks. Live dry run found two qualifying drivers and resolved dispatcher + manager recipients without email.
