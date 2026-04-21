

# Plan — Independent Miles popup in Trips cell selection

## What changes

When you click cells in the **Miles** column on the Trips page, a dedicated popup will always appear next to the existing **Stop Amt** and **Freight Amt** popups — even when those are also active. The Miles popup will show only **Sum** and **Average**, with no `$` sign and no Total Miles / RPM rows.

The Stop Amt and Freight Amt popups continue to behave exactly as today (Sum, Average, Total Miles, RPM with `$`), and they still pull miles context from selected miles cells for their RPM calculation.

## Visual

```text
[ Stop Amt · 3 cells ]   [ Freight Amt · 3 cells ]   [ Miles · 5 cells ]
  Sum:        $1,200       Sum:         $4,500         Sum:       2,341
  Average:    $400         Average:     $1,500         Average:   468.20
  Total Miles: 2,341       Total Miles: 2,341
  RPM:        $0.51        RPM:         $1.92
```

All three popups appear bottom-right, side by side, in the order: Stop Amt → Freight Amt → Miles.

## Implementation

**File:** `src/components/CellSelectionSummary.tsx`

1. Add a second small card component `MilesSummaryCard` that renders only:
   - `Sum: <number>.toLocaleString()` (no `$`)
   - `Average: <number>.toFixed(2)` (no `$`)
   - Same header (`Miles · N cells`) and close `X` button styling as `SummaryCard` for visual consistency.
2. Update the main `CellSelectionSummary` render so the Miles card shows whenever `milesCells.length > 0`, independently of whether Stop Amt or Freight Amt cards are showing. Remove the early-return branch that only shows Miles when nothing else is selected.
3. Keep `SummaryCard` (Stop Amt / Freight Amt) unchanged — it still receives `milesCells` to compute Total Miles / RPM.

No other files, hooks, or selection logic need to change — `useCellSelection` already tracks miles cells with `type: "miles"`.

