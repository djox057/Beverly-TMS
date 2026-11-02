# Driver status notification emails

Four driver transitions send from `jon@bfprime.net` to `ugo@pointxinc.com`: 2-week notice given, Done,
2-week notice cancelled, and Start/reactivated (continued driving). Changing an
existing notice date also sends an update. The database trigger covers Drivers,
Reports, Yard Arrivals, and other authorized updates. Done takes priority over
clearing the notice, preventing a duplicate cancellation email.

The subject and heading contain the driver's name and event. The body contains
the driver's phone, email, home city/state, carrier company, and tenure from recorded hire date (to termination
date for Done; otherwise event date). Unknown dates remain explicitly unknown. Missing contact details display Not recorded. The weekly table uses aligned numeric columns, alternating backgrounds, a highlighted current week, and a total row with weighted RPM.

The table contains three Tuesday–Monday payroll weeks: the current week to date
plus the two preceding weeks. Freight amount means driver-side pay including
driver additions and deductions. Miles include loaded, deadhead, and additional
miles. RPM is total Freight amount divided by total miles. Recovery/transfer
segments are attributed to their drivers, including driver 2; weekly overrides
are respected. Future-dated trips are omitted; cancelled trips without TONU and
unassigned prebooks are omitted. Team amounts are the trip amount per driver,
matching Trips, rather than an invented split between team members.

## Backend boundary

| Operation | Endpoint | Authorization | Input | Result |
| --- | --- | --- | --- | --- |
| Enqueue | Driver UPDATE trigger | Existing drivers RLS | Persisted transition | One durable outbox event |
| Claim | RPC `claim_driver_status_email` | Service role only | Optional test event UUID | Atomic lease using SKIP LOCKED |
| Send/retry | POST `/functions/v1/send-driver-status-email` | Server CRON_SECRET | `{}` for live; `{ "eventId": "uuid" }` for an explicit test | Sent/failed counts |
| Provider | POST `https://api.resend.com/emails` | RESEND_API_KEY | Immutable email payload, fixed recipient | Message ID |

No new API credentials are needed. Uses existing Supabase service credentials,
RESEND_API_KEY and CRON_SECRET; none are sent to the browser. Both outbox/settings
tables use RLS, with no anon/authenticated grants. Internal trigger and cron
functions live in a private schema and revoke public execution. The service RPC
uses SECURITY INVOKER and grants execution only to service_role.

Events snapshot name/company/hire/termination dates and driver contact details at the transition. The email omits the Changed by field. A worker
persists the exact email payload before delivery; retries reuse that payload and
the provider idempotency key. Workers lease one event at a time, send at most 10
per invocation, and use a 15-second provider timeout. Five bounded attempts use
exponential backoff. Automatic retry stops after 23 hours, within Resend's
24-hour idempotency window. Events beyond that age or attempts require manual
review. The cron wakes each minute only when live sending is enabled and work
is pending; no orders are polled. Data reads are scoped to the affected driver,
including original and intermediate transfer assignments, with pagination.

## Rollout and operation

The deployed settings default to `enabled=false`. Test events are explicit,
marked `[TEST]`, and do not change any driver records. Normal driver updates
do not enqueue emails while disabled. Review the four test emails before enabling.

After test review:

```sql
update public.driver_status_email_settings set enabled=true where id;
```

Kill switch:

```sql
update public.driver_status_email_settings set enabled=false where id;
```

Inspect delivery without exposing email bodies:

```sql
select id,driver_id,action,is_test,occurred_at,attempts,sent_at,
       provider_message_id,last_error
from public.driver_status_emails
order by occurred_at desc limit 50;
```

`sent_at` means provider accepted the message, not proof of inbox delivery.
The focused Vitest suite verifies weeks/DST, driver-side amounts and deductions,
team attribution, transfer and legacy recovery segments, overrides, null hire
dates, escaping, test labelling, immutable retries, and provider failure handling.

Reproducible database setup is in `supabase/sql/driver_status_email.sql` (applied
as migration `driver_status_email_notifications_test_first`). Deployment does
not depend on a frontend build. Existing status updates never call the email
provider synchronously; email provider outages leave queued events for retry.
