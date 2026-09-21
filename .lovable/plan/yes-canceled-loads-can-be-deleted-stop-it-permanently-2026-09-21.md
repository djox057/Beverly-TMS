# Yes — canceled loads can be deleted. Stop it permanently.

## What I found (verified)

Canceling a load itself does not delete it. But there is an automatic daily cleanup that does.

- A scheduled job (`cleanup-empty-orders-daily`, active, runs every day at 09:00 UTC) calls a backend routine that **permanently deletes loads** from the database when all of the following are true:
  - the load is marked canceled,
  - it was created more than 7 days ago,
  - freight amount, driver pay, loaded miles and DH miles are all empty or 0.
- That exactly matches a normal cancellation where TONU and DH miles are 0 — so a legitimately canceled load quietly disappears about a week later, with no record kept.
- Right now **25 loads in the database match that rule** and would be deleted by the next run.
- Separately, the database still permits deletion of loads by the admin and accounting roles, and the New Order screen deletes the just-created load if saving its stops fails (a rollback of a half-created load).

## Plan

1. Turn off the daily cleanup
   - Deactivate and remove the scheduled `cleanup-empty-orders-daily` job so nothing deletes loads on a timer again.

2. Make the cleanup routine harmless
   - Replace the delete inside `cleanup-empty-orders` with a no-op that only reports how many loads would have matched, so any leftover trigger or manual call can never remove data.

3. Block deletion at the database level
   - Remove the `Roles can delete orders` policy so no signed-in role — admin or accounting included — can delete a load through the app.
   - Add a database rule that rejects any delete on the loads table outright, with a clear message ("Loads cannot be deleted; cancel the load instead"), so even a direct SQL delete fails.

4. Keep the one legitimate rollback working
   - The New Order rollback (removing a load whose stops failed to save) must still work, otherwise failed load creation leaves broken half-loads. It will be changed to mark that load canceled and empty instead of deleting it, so nothing is ever removed.

5. Verify
   - Confirm the schedule no longer exists, attempt a delete of a test load and confirm it is refused, and confirm the 25 currently-matching canceled loads are still present.

## Technical notes

- Job: `cron.job` id 57, `cleanup-empty-orders-daily`, `0 9 * * *` → `unschedule`.
- `supabase/functions/cleanup-empty-orders/index.ts`: drop the `.delete()` chain, keep auth + a count-only report.
- Migration: `DROP POLICY "Roles can delete orders" ON public.orders;` plus a `BEFORE DELETE` trigger on `public.orders` raising an exception (service role and cron included — no bypass).
- `src/pages/NewOrder.tsx` (~line 2493): swap the rollback delete for an update setting `canceled = true` and a note marking it a failed creation.
- Backups in `canceled_orders_backup` are untouched; the revert-cancel flow that deletes its own backup row stays as is.
