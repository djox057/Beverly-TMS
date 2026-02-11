

## Salaries Tab Changes for Dispatchers

### What Changes

**1. Hide "Days Off" and "Food" columns for dispatchers**
Dispatchers will no longer see these two columns. Admin/Manager/Accounting users see everything as before.

**2. Paid column shows the full total as a frozen snapshot**
When a dispatcher is marked as paid, the system will store the **complete total** (base salary + extra days + food - days off + bonuses + adjustments) as the `paid_amount`. This value is frozen at the time of payment and will NOT change even if the underlying salary increases later.

### How It Works (Examples)

**Scenario: Dispatcher "John" - January 2026**
- Total Freight: $100,000 --> 1% = $1,000
- Total Commission: $20,000 --> 5% = $1,000
- Base rate = $2,000
- 22 work days, per-day rate = $90.91
- 1 Extra Day = +$90.91
- 1 Day Off = -$90.91
- Food Allowance: $70
- Dispatcher Bonus: $50
- Adjustments: +$100 (extra pay), -$20 (charge)

**At time of payment:**
Paid = $2,000 + $90.91 - $90.91 + $70 + $50 + $100 - $20 = **$2,200**
This $2,200 is stored in the database as `paid_amount`.

**After payment, a new load is added (Total Freight becomes $110,000):**
- Salary column updates to show new base: $2,100
- Paid column stays at **$2,200** (the stored snapshot -- does NOT recalculate)

**Dispatcher view (Days Off and Food hidden):**

| Dispatcher | Total Freight | Total Comm. | Extra | Additionals | Salary | Paid |
|---|---|---|---|---|---|---|
| John | $110,000 | $20,000 | +1 | +$80 | $2,100 | $2,200 |

**Admin view (unchanged, all columns visible):**

| Dispatcher | Total Freight | Total Comm. | Extra | Days Off | Food | Additionals | Salary | Paid |
|---|---|---|---|---|---|---|---|---|
| John | $110,000 | $20,000 | +1 | -1 | $70 | +$80 | $2,100 | $2,200 |

### Technical Details

**File: `src/pages/Analytics.tsx`**

1. **Update "Mark as Paid" logic (~line 915-918)**: Change `paid_amount` calculation from just `baseRate` to include all components:
   - `baseRate + extraDaysAmount - daysOffDeduction + foodAllowance + bonusAmount + adjustmentsTotal`
   - This makes the stored snapshot contain the full total

2. **Hide columns for dispatchers**: Wrap "Days Off" `TableHead`/`TableCell` and "Food" `TableHead`/`TableCell` with `{!isDispatchOnly && ...}` conditions

3. **Paid column display**: No change needed here -- it already displays the stored `paid_amount`, which will now contain the full total since we changed what gets stored

4. **Totals row**: Hide Days Off and Food total cells for dispatchers with `{!isDispatchOnly && ...}`

