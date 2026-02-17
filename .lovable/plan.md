

## Salary Calculation Simplification

### What Changes

The "Salary" column in the Analytics Salaries tab will be simplified to show only the core compensation:

**New formula:** `(Total Freight x 0.01) + (Total Commission x 0.05) + Food Allowance`

Everything else -- bonuses, extra days pay, lost days deductions, manual additionals/charges -- will be excluded from the Salary column.

### Previous Month Adjustment Logic

When a dispatcher is marked as "Paid," the system stores both the `paid_amount` (what was actually paid) and the `calculated_salary` (the base salary at that time). Currently, the next month does not account for differences.

The new logic will:
1. Compare the previous month's `paid_amount` to the previous month's `calculated_salary` (which will now be `base + food`)
2. If they differ (e.g., paid more or less than the formula), carry the difference as an automatic adjustment in the current month's Salary column
3. The "Paid" column remains unchanged -- it continues to show the frozen snapshot of what was actually paid

Example: If last month's salary formula = $1,500 but paid = $1,600, this month shows a -$100 adjustment. If paid = $1,400, shows +$100.

### Technical Details

**File:** `src/pages/Analytics.tsx`

1. **Salary display formula** (around line 3125-3128):
   - Change `displaySalary = baseRate` to `displaySalary = baseRate + foodAllowance`
   - Move the `foodAllowance` calculation above `displaySalary`

2. **Previous month adjustment** (around line 3125-3145):
   - After calculating `displaySalary`, check `prevMonthPayments` for this dispatcher
   - If previous month has a record: compute `adjustment = prevPaidAmount - prevCalculatedSalary`
   - Add the adjustment to `displaySalary` (negative if overpaid last month, positive if underpaid)

3. **Update `calculatedSalaries` stored value** (line 3143):
   - Change from `calculatedSalaries[stat.userId] = baseRate` to `calculatedSalaries[stat.userId] = baseRate + foodAllowance`
   - This ensures the stored `calculated_salary` reflects the new formula for future month comparisons

4. **Bulk "Mark as Paid" logic** (lines 3785-3803):
   - Update `calculatedSalaries` to use `baseRate + foodAllowance`
   - Update `adjustedSalaries` (the actual paid amount) to include: `baseRate + foodAllowance + prevMonthAdjustment + extraDaysAmount - daysOffDeduction + bonusAmt + adjustmentsTotal`
   - The paid amount still captures everything; only the "Salary" display is simplified

5. **Sorting logic** (lines 3859-3862):
   - Update sort comparison to use `baseRate + foodAllowance` instead of just `baseRate`

6. **Totals row** (lines 3702-3741):
   - Update the Salary total to sum `baseRate + foodAllowance` per dispatcher

7. **PayrollPreviewDialog and document generation calls** remain unchanged -- they already receive individual components (salary1Percent, bonus5Percent, foodAllowance, etc.) as separate props

