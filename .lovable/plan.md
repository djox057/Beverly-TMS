# Add Penalties Section to Payroll Statement

Split the current "Extra Pay / Charges" UI into two distinct sections — **Extra Pay / Charges** (existing behavior) and a new **Penalties** section. Penalties have a confirmation checkbox that controls whether they actually deduct from the paycheck or just appear as a warning note.

## Behavior summary

**Extra Pay / Charges** (unchanged)
- Hidden from `dispatch` role (current behavior preserved).
- Always reflected in the paycheck total.

**Penalties** (new)
- Visible to dispatchers in the PDF preview (unlike charges).
- Each penalty has: **Reason**, **Amount**, **"Apply deduction" checkbox**.
- If checkbox is **checked**: behaves like a charge — line shows `Penalty: <reason>` with `-$amount` and reduces the check amount.
- If checkbox is **unchecked**: line shows a warning instead — `Warning: <reason>. If this happens again, penalty will be $<amount>.` with `$0.00` and no deduction.
- Penalties only appear in the payroll PDF preview — they never appear under Order Additionals.

## Data model

Extend the existing `additionals` jsonb array in `dispatcher_salary_payments` (no schema change needed — it's already jsonb storing `PayrollAdjustment[]`). Add a new variant:

```ts
type PayrollAdjustment =
  | { type: "addition"; reason: string; amount: number }
  | { type: "charge"; reason: string; amount: number }
  | { type: "penalty"; reason: string; amount: number; applied: boolean };
```

Old records remain valid (no `applied` field on additions/charges).

## Files to change

### `src/utils/payrollPdfGenerator.ts`
- Extend `PayrollAdjustment` union to include `penalty` with `applied: boolean`.
- In the adjustments loop, render a `penalty` row:
  - `applied === true`: `Penalty: <reason>` with `-$amount` (subtract from `checkAmount`, like a charge).
  - `applied === false`: `Warning: <reason>. If repeated, penalty will be $<amount>.` with `$0.00` (no deduction).
- Update `totalCharges` calculation so applied penalties are also subtracted.

### `src/components/PayrollPreviewDialog.tsx`
- Replace the single Extra Pay / Charge form area with two stacked sections inside the right panel:
  1. **Extra Pay / Charges** — existing form (Extra Pay / Charge buttons + Reason + Amount).
  2. **Penalties** — new form: Reason, Amount, "Apply deduction" checkbox, Add button. Below it, a list of existing penalties each with the same checkbox toggle (live edit) and a delete button.
- The `Plus` button trigger label changes to "Add Extra Pay / Charge / Penalty".
- Update `handleAddAdjustment` to also handle penalty creation; add `handleTogglePenaltyApplied(index)` that updates the `applied` flag and persists via `saveAdjustmentsToDb`.
- Update the `adjTotal` calculation in `saveAdjustmentsToDb` and `handleSendEmail` to subtract applied penalties.
- Pass a new prop `hideChargesAndExtraPay: boolean` (true when `isDispatchOnly`). When true:
  - Hide the Extra Pay / Charges sub-form in the right panel.
  - When generating the PDF for preview, filter `adjustments` to only include `penalty` entries (instead of the current `previewOnly ? [] : adjustments`).
- Penalties section is always rendered (visible to all roles including dispatch).

### `src/pages/Analytics.tsx`
- Pass `hideChargesAndExtraPay={isDispatchOnly}` to `PayrollPreviewDialog`.
- Keep `previewOnly={isDispatchOnly}` so dispatchers still can't send/edit.
- Important: dispatchers must still be able to **view** penalties but not create/edit them — `previewOnly` already disables forms; that's correct.

## PDF rendering details

For penalty rows (using existing `drawRow` helper):

```text
applied === true:
  drawRow(`Penalty: ${reason}`, `-$${amount.toFixed(2)}`, "#FFFFFF", LIGHT_BLUE_BG, false, BLACK_COLOR);

applied === false:
  drawRow(
    `Warning: ${reason}. If repeated, penalty will be $${amount.toFixed(2)}.`,
    `$0.00`,
    "#FFFFFF",
    LIGHT_BLUE_BG
  );
```

The existing `drawRow` already auto-wraps long text, so the warning sentence will wrap cleanly.

## Out of scope / confirmations

- No database migration — `additionals` column is already jsonb and tolerates the new shape.
- No changes to `OrderAdditionalsManager` — penalties live entirely inside payroll, never in order additionals.
- Memory rule "Hides bonuses from 'dispatch' role" remains intact for charges/extra pay; only penalties are exposed to dispatch.
