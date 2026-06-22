## Goal

Stop splitting recovered loads into a separate "Recovery" bucket. Treat every load the dispatcher booked the same way for salary purposes — it counts in **Total Freight** and **Total Comm.** even when the load was later finished by a recovery driver.

## Today's behavior (the bug)

In `src/pages/Analytics.tsx` (`dispatcherAnalytics`, lines 1694-1739):

```
isRecoveryLoad = driver1Id ∈ recoveryDriverIds
if isRecoveryLoad:
   recoveryFreight += freight
   recoveryDriverRate += driverPay
else:
   totalFreight += freight
   totalDriverRate += driverPay
```

`cut = totalFreight - totalDriverRate`. So with your example:

- Freight $1,400, original driver pay $1,000 → comm would be $400.
- Load is recovered (driver1 swapped to a recovery driver, recovery driver gets $200) → the whole load is now classified `isRecoveryLoad`, so it leaves the normal totals entirely.
- Result: dispatcher's **Total Freight** loses the $1,400 and **Total Comm.** loses the $400. They only get them back as a tiny "Recovery bonus" sub-row computed as `1,400×1% + 200×5% = $24`.

That's why "1400 gross doesn't show" and "400 comm doesn't show".

## Fix

Merge recovery loads into the regular dispatcher totals and delete the recovery bucket.

### 1. Aggregation (`src/pages/Analytics.tsx`, lines 1676-1767)

- Remove the `recoveryDriverIds` Set and the `isRecoveryLoad` branch.
- Always add `orderFreight`, `orderDriverPay`, `orderMiles`, `orderDhMiles` to the normal `totalFreight` / `totalDriverRate` / `totalMiles` / `totalDhMiles`.
- Drop the `recoveryFreight`, `recoveryDriverRate`, `recoveryMiles`, `recoveryOrderCount` fields from the accumulator and from the returned shape (lines 1687-1690, 1709-1712, 1752-1755, 1779-1783, 1830-1833).

Driver-pay question for the comm:

```
cut = totalFreight − totalDriverRate
```

`orderDriverPay` comes from `getEffectiveDriverPay(order)`. Today that returns the **booked** driver's pay (`driver_price`/`driver1`), not whatever the recovery driver was paid. So in your example the comm contribution will be `1,400 − 1,000 = $400` — exactly what you want. The $200 paid to the recovery driver does not reduce the dispatcher's commission. (If you'd rather subtract the recovery driver's pay too, say the word and I'll change `getEffectiveDriverPay` to sum both legs — but per your message it sounds like you want $400, so I'll leave it as-is.)

### 2. Salary calculation (`src/pages/Analytics.tsx`, lines 4298-4372 and 5350-5390)

- `baseRate = totalFreight × grossPct + cut × cutPct` stays the same and now naturally includes recovered loads.
- Delete the `recoveryBonus` computation and every place it's added to `fullTotal`, `calculatedSalaries`, and the "all-time" branch at line 5384.
- Remove `recoveryBonus` from the row's border condition at line 4396 (`recoveryBonus === 0` clause goes away).

### 3. Remove the sub-row

Delete the entire `{recoveryBonus > 0 && (<TableRow>↳ Recovery bonus…</TableRow>)}` block at lines 5192-5228.

### 4. Payroll statements

The recovery amount is now part of `salary1Percent`/`bonus5Percent` passed into the generators (because `stat.totalFreight` and `stat.cut` already include the recovered loads). So we just stop sending a separate recovery line:

- `src/pages/Analytics.tsx`: drop the `recoveryBonus` field from the `downloadPayrollDoc` payload (line 4459) and from the `PayrollPreviewDialog` props at lines 4595 and 5460.
- `src/utils/payrollPdfGenerator.ts`: remove the `recoveryBonus` field, the `hasRecoveryBonus` row at lines 290-293, and drop it from the check-amount sum at line 98.
- `src/utils/payrollDocGenerator.ts`: same removals at lines 82-83, 91, 215-241.
- `src/components/PayrollPreviewDialog.tsx`: remove the `recoveryBonus` prop, drop it from `percentBase` (line 105), `baseRate` in `saveAdjustmentsToDb` (line 201), and the two other usages at lines 338 and 547.

### 5. Cleanup

- Remove the `is_recovery` driver query dependency from the `useMemo` deps (`drivers` can stay if used elsewhere; just drop the recovery-id Set).
- Remove the `stat.recoveryFreight > 0` clause from the visibility filter at line 1843 (now redundant — `totalFreight` already includes those loads).

## Out of scope

- DB schema, the `drivers.is_recovery` flag, recovery-load workflows, and driver-side pay calculations are untouched.
- Reports/Trips views are not affected.

## Net effect on your example

Freight $1,400, driver pay $1,000, recovery driver paid $200:
- **Total Freight**: +$1,400 (was $0 in the dispatcher row, $1,400 in the sub-row)
- **Total Comm.**: +$400 (was $0 in the dispatcher row, $200 in the sub-row)
- **Salary @ 1%/5%**: +$14 + $20 = **+$34** added directly into the dispatcher's Salary, no sub-row.

## Files touched

- `src/pages/Analytics.tsx`
- `src/components/PayrollPreviewDialog.tsx`
- `src/utils/payrollPdfGenerator.ts`
- `src/utils/payrollDocGenerator.ts`
