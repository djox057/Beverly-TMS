# Recovery option when canceling a load from Reports

## Goal
When a dispatcher cancels a load from the Reports load-info popup, first offer to recover the load instead. If they choose recovery, the load is NOT canceled — it is flagged as a recovery (retrieval) load so it shows up on the Recovery Loads page, with a deadline after which it auto-cancels if nobody picks it up.

## Flow
1. In the Cancel Load dialog (Reports load info), the user fills the usual fields: Company TONU, Driver Rate, DH Miles, Notes.
2. A new section is added on top: "Try to recover this load instead?" with Yes / No.
3. If **No** — unchanged behavior: the load is canceled immediately exactly as today.
4. If **Yes** — a deadline selector appears with preset options: 30 min, 1h, 2h, 4h, 8h, 24h. The button changes to "Send to Recovery".
   - The order is marked `retrieval = true`, stays fully active (freight, miles, pay untouched), and appears on the Recovery Loads page.
   - The cancellation values entered (TONU, driver rate, DH miles, notes) are stored and reused later if the load auto-cancels.
   - The load-info popup shows a recovery badge with the deadline countdown.
5. If someone assigns the load to another driver from Recovery Loads before the deadline, the pending auto-cancel is cleared and nothing else happens.
6. If the deadline passes and the load was never assigned, a scheduled job cancels it automatically using the stored values — same result as a manual cancel (backup row written, freight/miles/pay zeroed, TONU/DH/notes applied, `canceled = true`, `retrieval` cleared).

## Recovery Loads page
- Add a "Cancels at" column showing the deadline (Chicago time), with overdue/soon rows highlighted.
- Managers/admins can extend or clear the deadline from that row.

## Technical details
Database migration on `public.orders`:
- `recovery_auto_cancel_at timestamptz` — the deadline.
- `recovery_cancel_payload jsonb` — stored `{ tonu, driver_rate, dh_miles, notes }`.
- `recovery_requested_by uuid`, `recovery_requested_at timestamptz` — audit.
- Partial index on `recovery_auto_cancel_at` where `retrieval = true and canceled = false`.

Frontend:
- `src/pages/Reports.tsx`: extend the cancel dialog with the recover choice and deadline presets; new `handleSendToRecovery` writes the retrieval flag + payload + deadline; existing `handleCancelOrder` untouched for the No path.
- `src/pages/Reports/useReportsDialogs.ts`: add `recoverInstead` and `recoveryDeadlineMinutes` to the cancel form state, cleared by `closeCancelDialog`.
- `src/components/recovery/AssignRecoveryLoadDialog.tsx`: on assignment, also null out `recovery_auto_cancel_at` and `recovery_cancel_payload`.
- `src/pages/RecoveryLoads.tsx`: fetch and render the "Cancels at" column plus extend/clear actions for manager/admin.

Backend job:
- New edge function `recovery-auto-cancel`, scheduled via pg_cron every 30 minutes.
- Per run: bounded batch (max 100 orders), single-flight advisory lock, selects orders where `retrieval = true`, `canceled = false`, `recovery_assigned = false`, `recovery_auto_cancel_at <= now()`.
- For each: insert the `canceled_orders_backup` row from current values, apply the stored cancel payload, set `canceled = true`, clear `retrieval` and the recovery deadline fields — idempotent, so a re-run skips already-canceled orders.

## Not included
- No change to how canceled loads are reported in analytics — auto-canceled loads behave identically to manually canceled ones.
