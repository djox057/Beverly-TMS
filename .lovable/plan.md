

# Restore Late Trucks Detection with ETA-Based Logic (Updated)

## Summary
Replace the current simple "overdue" check with ETA-based late detection using Haversine×1.3 miles_away. Add a "next stop proximity" caveat that suppresses late marking when the distance to the next stop is less than the next order's deadhead miles + 10.

## Late Detection Logic

```text
For each truck with miles_away >= 10:
  1. ETA = now + (miles_away ÷ 60 mph)
  2. If ETA > stop's end_datetime → LATE
  3. BUT check next stop in sequence:
     - P1 → P2 (if exists) → D1 → D2 (if exists) → next load's P1
     - Compute Haversine×1.3 from current stop to next stop
     - Get next order's DH miles (deadhead_miles field)
     - If next_stop_distance < (next_order_dh_miles + 10) → NOT LATE (skip)
  4. If LATE: cell turns orange + email notification sent
```

## Changes

### 1. Update `checkLateStops` in `src/pages/Reports.tsx` (~lines 2672-2947)

- Replace `isOverdue = now > scheduledEnd` with ETA-based check:
  - Skip if `miles_away < 10`
  - `etaDate = now + (milesAway / 60) hours`
  - `isLate = etaDate > scheduledEnd`
- Build full stop sequence per truck: P1 → P2 → D1 → D2 → next_load.P1
- For current stop, find next stop and compute Haversine×1.3 distance
- Get next order's `deadhead_miles` value
- If `nextStopDistance < (nextOrderDH + 10)` → skip late marking
- Re-enable email notification code calling `send-late-notification`

### 2. Add helpers to `src/pages/Reports/helpers.ts`

- `haversineDistanceMiles(lat1, lon1, lat2, lon2)` — Haversine with ×1.3 road factor
- `getNextStopInSequence(currentStopId, allOrdersForTruck)` — returns next stop coords + the next order's DH miles

### 3. No database or edge function changes needed

All required data (stop coordinates, end_datetimes, miles_away, deadhead_miles) already exists in the reports data.

