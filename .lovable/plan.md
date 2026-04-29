## Goal

Make `%`-based adjustments (Extra Pay, Charge, Penalty) **dynamic**: the actual dollar deduction/addition recalculates whenever the dispatcher's salary base changes (Gross×1% + Comm×5%), instead of being frozen at a static dollar amount captured at creation time.

## Current behavior (problem)

When the user picks `%` mode and enters e.g. `5`, the code immediately computes `(percentBase * 5) / 100` and stores only the resulting dollar amount in the `additionals` JSONB. There is no record that the value was a percentage, so if the salary later changes the deduction does NOT track it.

## New behavior

If the user enters the value in `%` mode, we persist the percentage itself alongside the adjustment. The effective dollar amount used in the PDF, salary totals, and DB calculations is then derived live from the current `percentBase` (= `salary1Percent + bonus5Percent`).

If the user enters in `$` mode, behavior is unchanged: a fixed dollar amount is stored.

## Data model change

Extend `PayrollAdjustment` in `src/utils/payrollPdfGenerator.ts`:

```ts
export interface PayrollAdjustment {
  type: "addition" | "charge" | "penalty";
  reason: string;
  amount: number;          // resolved $ at the time of writing — kept for back-compat / display fallback
  applied?: boolean;       // penalty only
  percent?: number;        // NEW — when set, amount must be recomputed as base * percent / 100
}
```

No DB migration needed (`additionals` is already JSONB). Old records without `percent` keep working as fixed-dollar entries.

## Files to change

### 1. `src/utils/payrollPdfGenerator.ts`
- Add optional `percent?: number` field to `PayrollAdjustment`.
- (PDF rendering itself doesn't need to change — it already uses `adjustment.amount`. The caller resolves `amount` from `percent` before passing in.)

### 2. `src/components/PayrollPreviewDialog.tsx`

**Persisting**
- In `handleAddAdjustment` and `handleAddPenalty`, when the input mode is `percent`, store both `percent: parseFloat(raw)` and the currently-resolved `amount`. When mode is `dollar`, store only `amount` as today (no `percent` field).

**Resolving live**
- Add a helper `resolveAdjustments(list, base)` that maps each adjustment to a copy where, if `percent` is set, `amount = base * percent / 100`. Use this:
  - When computing `adjTotal` inside `saveAdjustmentsToDb`, `handleSendEmail`, and the live preview total.
  - When passing `adjustments` into the PDF generator (so the PDF shows the up-to-date dollar figure).
  - When displaying the existing-adjustments list in the right panel (so the user sees the live $ next to e.g. `5%`).

**Display**
- In the existing-adjustments list, if an adjustment has `percent`, show it as `5% ($123.45)` so it's clear the value is dynamic. If not, show only `$amount` as today.

**Saving back to DB**
- `saveAdjustmentsToDb` writes the array as-is (with `percent` preserved). Do NOT overwrite `percent` entries with their resolved dollar value — that would freeze them.

### 3. `src/pages/Analytics.tsx`
- Where `additionals` is fetched and reduced into `adjustmentsTotal` (both the dispatcher RPC path and the regular path), apply the same resolve step:
  ```ts
  const resolved = (additionals ?? []).map(a =>
    a.percent != null ? { ...a, amount: (baseRate * a.percent) / 100 } : a
  );
  ```
  Then run the existing reduce. `baseRate` here is `salary1Percent + bonus5Percent` for that dispatcher/month — already computed in this file.

### 4. `src/components/PayrollPreviewDialog.tsx` — toggle UX (minor)
- Keep current toggle behavior. When the user toggles `$` ↔ `%` while typing a NEW adjustment, do not auto-convert the typed value (treat it as a fresh entry in the new unit) — matches today's UX.
- Existing adjustments cannot be edited in-place (only deleted/re-added), so no migration UI is needed.

## Edge cases

- `percentBase` is 0 (no gross/comm yet): resolved amount becomes `0`. This is correct — a percentage of nothing is nothing, and the deduction will start applying once orders are added.
- Mixed list (some `$`, some `%`): each entry is resolved independently.
- Penalties with `applied: false`: percent still resolves to a dollar figure, but the PDF still shows it as a `Warning: …` line with `$0.00` and no deduction (existing rule).
- Old saved records without `percent`: behave exactly as before (frozen dollar).

## Out of scope

- No DB schema migration.
- No retroactive conversion of existing fixed-dollar adjustments to percentages.
- No change to charges/extra-pay visibility rules per role.
