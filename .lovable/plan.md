# Fix: canceled-load DH miles landing in the wrong field

## What we know

Load 5423841 (12160-BFP) confirms the symptom: freight, driver pay, loaded miles and DH miles are all 0, and its system note reads `Lumper changed from $82.16 to $0` — a number was written to Lumper and later cleaned up by hand. That same order is also currently `canceled = false` even though it was canceled (a backup row exists from 08/10).

Both dedicated Cancel Load dialogs (Reports load popup and Orders page) write only `tonu`, `tonu_driver`, `dh_miles`, notes, and zero out freight / driver pay / loaded miles. Nothing in those two paths can write Lumper. So the misrouted value comes from the Edit Order screen, which is also used to cancel loads (TONU under Additional Charges) and to add DH miles afterwards.

Prime suspect, not yet proven: Edit Order silently commits a half-filled "Additional Charges" row on Save. The add-form keeps its selected type and typed amount in local state, and the save path calls `commitPendingAdditional()`, which writes the typed amount into whatever type happens to be selected — Lumper, Detention, TONU — with no confirmation and no visible row. A stale or mis-clicked type selection therefore turns a number the user meant as DH miles into a Lumper or other charge.

Secondary issue found: on Edit Order the cancel state is derived as `canceled = tonu > 0`, so a cancellation with TONU 0 does not mark the load canceled — exactly what 12160-BFP shows.

Because the exact keystroke path is not proven, step 1 is to confirm it before changing behaviour.

## Plan

1. Confirm the mechanism
   - Add temporary logging in Edit Order's save path for the pending additional (selected type + amounts) whenever it is auto-committed, plus a diff of which money/mile fields changed on save.
   - Reproduce in the preview: open a canceled load, click a type in Additional Charges, type a number, press Save without clicking Add, and verify the number lands on that type.

2. Stop silent auto-commits
   - Remove the "commit pending additional on Save" behaviour. If the add-form has an amount typed but was never added, block the save with a clear prompt: "You have an unadded charge (Type $X). Add it or clear it before saving."
   - Clear the pending type/amount whenever the Additional Charges section is collapsed or the order reloads, so a selection can never go stale.

3. Make DH miles unmistakable on a canceled load
   - On Edit Order, when the load is canceled, show Company TONU / Driver Rate / DH Miles in one clearly labelled Cancellation block at the top of the money section (the same four values as the Cancel Load dialog), so DH miles is never typed into the charges form.
   - Keep the existing DH Miles input as the single writer of `dh_miles`.

4. Fix the canceled flag
   - Stop deriving `canceled` from `tonu > 0` on Edit Order. Preserve the existing canceled state and change it only through the explicit cancel / revert actions, so a TONU-0 cancellation stays canceled.

5. Guardrail
   - When a load is canceled, warn (not block) if a charge type other than TONU is added, since that is where the bad values have been landing.

6. Data cleanup
   - After the fix, list canceled loads with 0 DH miles but an unexplained Lumper / Other charge, and correct them with your confirmation. No bulk writes without review.

## Technical notes

- Files: `src/pages/EditOrder.tsx` (save path, `commitPendingAdditional` call sites, `canceled` derivation, cancellation block) and `src/components/OrderAdditionalsManager.tsx` (pending-state reset, imperative commit API).
- The Reports and Orders cancel dialogs and the `canceled_orders_backup` logic stay as they are.
- No schema changes needed.