# Recovery Loads: how it should work vs. what actually happens

## The intended workflow

1. A dispatcher has a load a driver can no longer cover. From the load popup in Reports they either:
   - tick **Recovery** on the load, or
   - open **Cancel** and choose **send to Recovery instead**, entering TONU, driver rate, DH miles, notes and a countdown (default 2 hours).
2. The load appears on the **Recovery Loads** page and in the sidebar badge.
3. Nearby help is alerted: dispatchers whose truck delivers that same day within 150 miles of the pickup get an email from the booking company's dispatch address.
4. Someone takes the load: **Assign** picks truck, driver, trailer, driver rate and DH miles. Booked By becomes the new driver's dispatcher. The load leaves the recovery list and becomes a normal load.
5. If nobody takes it before the countdown ends, a job every 30 minutes cancels it using the entered TONU / rate / DH miles / notes, backing up the original values first.
6. The badge and the list stop showing it, whichever way it ended.

## What is actually happening (checked against live data)

Working correctly:
- Both entry paths write the recovery flag, and the page and sidebar badge both count only open, non-canceled recovery loads (14 today, matching).
- The 30-minute auto-cancel job is scheduled and active, backs up original values, and skips loads that were assigned or canceled in the meantime.
- Assigning clears the countdown, re-points Booked By to the new driver's dispatcher, and auto-fills DH miles from the driver's last delivery.

Gaps found:
1. **No alert emails on the cancel-instead path.** Ticking the Recovery box sends the nearby-dispatcher emails; sending it to recovery from the Cancel dialog does not send anything. That is the path with a deadline attached, so the loads most at risk of auto-cancelling are the ones nobody is told about.
2. **Almost no recovery load has a countdown.** 13 of the 14 open recovery loads have no deadline at all (they came from the checkbox path), so the auto-cancel job can never act on them and they sit on the list indefinitely with "—" under Cancels At.
3. **Cancelled loads keep the recovery flag.** 10 canceled orders are still flagged as recovery loads. They are hidden from the list and badge, but they still show up in the Statistics tab and any future query on the flag.
4. **Nobody is told when a load gets picked up.** Assigning notifies neither the dispatcher who sent it to recovery nor the assigning side; the original dispatcher has to keep re-checking the page.
5. **"Only the booking dispatcher can assign" is cosmetic.** The Assign button is disabled in the interface for other dispatchers, but the database allows any dispatch user to update any unlocked load, so the rule is not actually enforced.
6. **Assign dialog is unscoped.** It lists every active truck, driver and trailer in the fleet with no office or company narrowing, which makes picking the right unit harder on a large list.

## Proposed fixes (in order)

1. Send the nearby-dispatcher alert from the cancel-instead path too, reusing the same alert call and the same result toast.
2. When a load is marked recovery via the checkbox, give it a countdown as well (default 2 hours, editable on the page as today) so the auto-cancel job can finish the loop; keep the existing "Clear" control for loads that should stay open.
3. Clear the recovery flag whenever a load is canceled or reverted, and clean up the 10 existing rows.
4. On assign, notify the dispatcher who sent the load to recovery (email, same sender rules as the alert) that it was taken, by whom and on which truck.
5. Enforce the assign rule in the database, not just the button: only the booking dispatcher, managers and admins may flip a recovery load to assigned.
6. Scope the Assign dialog lists to the assigning user's office, with a toggle to see the whole fleet.

## Technical notes

- Entry points: `src/pages/Reports.tsx` `applyRecoveryToggle` (checkbox, invokes `send-recovery-load-alert`) and `handleSendToRecovery` (sets `recovery_auto_cancel_at`, `recovery_cancel_payload`, `recovery_requested_by/at`, no alert).
- Page and assign: `src/pages/RecoveryLoads.tsx`, `src/components/recovery/AssignRecoveryLoadDialog.tsx` (sets `retrieval=false`, `recovery_assigned=true`, clears deadline/payload).
- Badge: `get_recovery_loads_badge` RPC (`retrieval = true AND canceled = false`) via `src/hooks/useRecoveryLoadsCount.ts`.
- Auto-cancel: `supabase/functions/recovery-auto-cancel` on cron `*/30 * * * *`, backs up to `canceled_orders_backup`, sets `retrieval=false`.
- Enforcement gap: `orders` UPDATE policies allow any `dispatch`/`afterhours` role on any unlocked order; a recovery-specific check (or a security-definer assign function) is needed for item 5.
