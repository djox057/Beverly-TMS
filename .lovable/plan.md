# Safety & Maintenance Email Reminders

## What reminders get sent, and why

**1. Expiring document reminders (automatic, milestone-based)**
One email per dispatcher, sent only when an item crosses a milestone: **30, 14, 7, and 1 day** before expiry, and **once per day while overdue**. No spam in between.

Covered items:
- **Truck docs** — DOT inspection, plate, insurance, stickers/registration, maintenance check due, oil change past mileage threshold
- **Trailer docs** — DOT inspection, plate, insurance (routed to the dispatcher of the truck the trailer is attached to)
- **Driver docs** — CDL, medical card, MVR, clearinghouse, random drug test
- **Temporary plates** — temp plate expiration

Recipient: the **dispatcher of the truck/driver** (resolved from `driver1.dispatcher_id`, falling back to `trucks.dispatcher_id`). If no dispatcher can be resolved, the item is grouped into a single fallback email to safety instead of being dropped.

Message content: "Truck 4521 — Insurance expires in 7 days (08/25). Please tell the driver to bring the truck to the yard / send the updated document." Each row shows unit, driver, document, expiry date, and days remaining, with overdue items listed first in red.

**2. Paperwork reminders (on create + repeating)**
- On create (already works today): reminder that the driver must bring the truck/trailer to the yard by the last day.
- New: repeating reminders at **7, 3, 1 days** before the last day, and **daily once overdue**, until the paperwork item is deleted.
- Also re-sends when the last day is edited to a new date.

## Rollout / safety
All emails keep a `TEST_MODE` flag. While true, every message is delivered only to tommy@bfprime.net (CC jon@bfprime.net) with a banner naming the intended recipient, so the exact routing can be verified before going live. Flipping one constant switches to real dispatchers.

## Technical implementation

### Database
New table `public.document_reminder_log` (dedupe so a milestone is never emailed twice):
- `id`, `entity_type` (`truck` | `trailer` | `driver` | `temp_plate` | `paperwork`), `entity_id uuid`, `field_key text`, `milestone int` (30/14/7/1/0 for overdue), `due_date date`, `sent_to text`, `sent_at timestamptz default now()`
- Unique index on `(entity_type, entity_id, field_key, milestone, due_date)`; for overdue, uniqueness includes the send date so it repeats daily.
- GRANTs: `service_role ALL`; `SELECT` for `authenticated` (admin/safety can audit); RLS on with an admin/safety read policy. No anon access.

### Edge functions
`supabase/functions/send-document-reminders/index.ts` (new, cron-driven, service role):
1. Load active trucks, trailers, drivers, temporary plates plus the fields listed above.
2. Compute days-until for each date field in Chicago time; keep only items hitting 30/14/7/1 or overdue. Reuse the oil-change thresholds from `src/pages/Reports/helpers.ts` logic (duplicated in the function, since `src/` is not deployable).
3. Resolve dispatcher per item (driver → truck fallback → safety fallback bucket) and fetch dispatcher email from `profiles`.
4. Filter out `(entity, field, milestone, due_date)` combinations already present in `document_reminder_log`.
5. Group remaining items per dispatcher, send one HTML email via Resend from `Dispatch <dispatch@bfprime.net>`, then insert log rows.
6. Return a JSON summary (`{ scanned, milestonesHit, emailsSent, skipped }`) for log inspection.

`supabase/functions/send-paperwork-reminder/index.ts` (extend):
- Accept an optional `mode: "created" | "milestone"` and a `milestone` value so the subject line reads correctly ("Reminder — 3 days left" vs. the initial notice).
- Route to the resolved dispatcher (already resolved in the function) instead of the hardcoded list once `TEST_MODE` is off.
- Write a `document_reminder_log` row with `entity_type = 'paperwork'`.

`supabase/functions/send-paperwork-reminders-cron/index.ts` (new): scans `paperwork_items` with a `last_day`, computes 7/3/1/overdue milestones, dedupes via the log, and reuses the paperwork email body.

### Scheduling
One `pg_cron` job at 12:00 UTC (7:00 AM Chicago) invoking both cron functions via `net.http_post` (created with the insert tool, not a migration, since it embeds project URL + anon key).

### Frontend
- `PaperworkTab.tsx`: keep the create-time invoke; pass `mode: "created"`.
- `src/pages/Alerts.tsx`: add a "Send reminders now" button in the header for admin / manager / safety / maintenance (and the ella@bfprime.net override) that manually invokes `send-document-reminders` and toasts the returned summary — useful for verifying test-mode output without waiting for cron.

### Non-goals
No change to which items appear in the Safety & Maintenance tables, no change to thresholds shown in the UI, no new roles or permissions.
