# HOS friendly load planning

`hos-load-check` computes the same server assessment for the booking light and the saved-order alert. Preview requests authenticate the user and respect existing driver/order RLS before privileged reads. No client color, recipient, email content, or HOS reading is trusted for notifications.

Green means the standard solo 70/8 forecast fits with a one-hour buffer. Yellow means tight, stale, incomplete, estimated recap, unsupported team clocks, or uncertain remaining work. Red means the schedule still misses an appointment in a best-case pass allowing missing recaps. Red does not prevent booking.

Defaults: 55 mph, 60 minutes per stop, Chicago home-terminal log days. Appointment wall times follow the current TMS convention and resolve in each geocoded stop's local timezone (`tz-lookup` 6.1.25); absent coordinates produce a Chicago fallback and yellow. Split-sleeper and adverse-driving exceptions are not assumed. These are planning estimates, not ELD compliance determinations.

The established five-minute `hos-sync` continues to update Reports. It additionally records timestamped clock/status observations in backend-only `driver_hos_state` and aggregates observed DRV/ON intervals into `driver_hos_daily`, splitting at log midnight. Replays are ignored; gaps over 15 minutes, stale source readings and truck changes are unknown. Daily records retain 32 days. No historical duty is invented; useful recap coverage grows over the first eight log days. No extra cron or realtime stream is added.

Newly created assigned orders and assignments enqueue a unique (order,driver) check. The form requests immediate processing after stops save; the existing HOS sync retries pending work. The server freezes each assessment for retries and emails only red results to the unique manager-role profile in the driver's dispatcher's office, using that manager's Auth account email. Missing/ambiguous routing is retained as an error instead of choosing another recipient. Resend uses the event UUID as a stable idempotency key; retries stop before its 24-hour idempotency window. Historical orders are not backfilled into the email queue.

Apply the migration before deploying `hos-load-check`, then deploy `hos-sync`. Keep `hos-load-check` gateway JWT checking off because the handler validates user tokens and the existing cron secret itself. To stop notifications, revert the new planner call in `hos-sync` and the form calls; to stop all new checks, disable `enqueue_hos_new_order`. Existing load creation is unaffected if the planner endpoint is unavailable.

Validation: planner and UI Vitest cases; Deno mocked notification/routing tests (no real emails); transactional database checks for midnight, gaps, replay, rest continuity and privilege isolation. Inspect `hos_order_checks.status/last_error/notified_at` and `driver_hos_state.observed_at/source_at` for production health.
