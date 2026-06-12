In `src/pages/Trips.tsx`, change the `endDateFormatted` date format used for the Deductions column in the AP Silver Trans exports from `"M/d/yy"` to `"MM/dd/yyyy"`.

Two lines to update (both inside the AP Silver Trans export functions):
- Line 3962 in `exportAPSilverTransTemplate` (weekly preview export)
- Line 5160 in `exportFinalAPSilverTransTemplate` (final export)

```ts
const endDateFormatted = format(weekEndDate, "MM/dd/yyyy");
// and
const endDateFormatted = format(endDate, "MM/dd/yyyy");
```

No other files or templates affected.