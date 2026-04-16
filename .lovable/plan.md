

## Problem

The POD Complete button never appears because of a **property name mismatch**:

- Stops are built with `datetime` (lowercase) in `useReports.ts` (line 1412)
- Reports.tsx reads `dateTime` (camelCase) on line 6466-6467

This means `deliveryStart` and `pickupStart` are always `null`, and the buttons are permanently hidden.

## Fix

In `src/pages/Reports.tsx` around line 6466-6467, change:
- `pickupStops[0]?.dateTime` → `pickupStops[0]?.datetime`
- `deliveryStops[0]?.dateTime` → `deliveryStops[0]?.datetime`

That's it — a two-character fix on two lines.

