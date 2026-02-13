

## Late Delivery Display Change in Reports

**What changes:** When a delivery stop has a scheduled time after 16:00 (4:00 PM), instead of showing the normal delivery cell with late/red styling, it will display ">>LATE DELL<<" using the same visual style as the ">>>" in-transit indicator (plain text, bold, no colored background box).

### How it works

1. **Detection:** For each delivery stop cell rendered in the Reports calendar, extract the time from `stop.datetime`. If the hour is >= 16 (i.e., after 4:00 PM), flag it as a "late delivery".

2. **Display change:** When a delivery stop is flagged as late delivery AND has NOT been completed (no POD for that stop), instead of rendering the normal colored cell with city/state/time, render ">>LATE DELL<<" with the same styling as ">>>" -- centered, `text-foreground font-semibold`, no special background color.

3. **Completed deliveries unaffected:** If the delivery already has a POD (dark green), it stays as-is regardless of time.

### Technical details

**File: `src/pages/Reports.tsx`**

In both delivery stop rendering blocks (around lines 1986-2034 for `allDeliveryOrders` and lines 2044-2090 for `sameDayOrders`):

- After getting the `stop`, parse the time from `stop.datetime` using the existing `formatDateTime` helper to extract the hour
- If hour >= 16 AND the stop is not yet completed (cellColor is not the "complete" green), replace the cell content and styling:
  - Instead of the colored `cellColor` box with city/state/time, render a plain cell with class `text-xs h-full flex items-center justify-center text-foreground font-semibold` (matching ">>>" style)
  - Content: `>>LATE DELL<<`
- The cell remains clickable (same onClick to open zoomed load)

**File: `src/pages/Reports/helpers.ts`**

- Add a new helper `isLateDeliveryTime(datetimeStr: string): boolean` that parses the time and returns true if hour >= 16
- This keeps the logic clean and reusable

