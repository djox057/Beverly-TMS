

## Auto-Assign Drivers to Weekend Dispatchers

### Overview
Add an "Auto Assign" button to the Weekend Assignment tab that automatically distributes all active drivers to scheduled weekend dispatchers, grouped by office. The algorithm keeps drivers from the same weekday dispatcher together as much as possible, with a max ±3 driver tolerance between weekend dispatchers in the same office.

### Algorithm

For each office (KG, CA, BG):
1. Get all active drivers belonging to that office (via their weekday dispatcher's office)
2. Get all weekend dispatchers scheduled for that office
3. Calculate fair share: `base = floor(totalDrivers / numDispatchers)`, `extra = totalDrivers % numDispatchers`
4. Sort weekend dispatchers by their own weekday driver count (descending) — dispatchers with more weekday drivers get slightly more weekend drivers
5. Group drivers by weekday dispatcher. Sort groups largest-first
6. Assign each dispatcher group to the weekend dispatcher with the most remaining capacity (greedy bin-packing), keeping groups intact
7. If a group is too large to fit in any single weekend dispatcher's remaining capacity, split it — but only the minimum needed

### Changes

**`src/components/AfterhoursFleetTab.tsx`**
- Add "Auto Assign" button (visible to admin/manager) at the top of the tab, next to the fleet cards
- Button triggers the auto-assign logic, clears existing assignments first (with confirmation dialog)
- After auto-assign, calls `assignDriversBulk` for each weekend dispatcher

**`src/hooks/useAfterhoursAssignments.ts`**
- Add `autoAssignDrivers()` function that:
  1. Fetches all active drivers with their dispatcher info (already available via `allDriversWithTrucks`)
  2. Groups drivers by office (using dispatcher's office)
  3. For each office, gets the weekend dispatchers from `afterhoursFleets`
  4. Runs the distribution algorithm
  5. Clears all existing `afterhours_assignments` rows
  6. Bulk inserts new assignments
- Expose `autoAssignDrivers` from the hook

### Distribution Example
- Office Čačak: 63 drivers, 3 weekend dispatchers
  - Dispatcher A has 6 weekday drivers, Dispatcher B has 6, Dispatcher C has 3
  - Fair share: 63/3 = 21 each
  - A & B (with 6 weekday drivers each) get 25 drivers each
  - C (with 3 weekday drivers) gets 13 drivers
  - Each weekend dispatcher gets their own weekday drivers first, then fills up with others grouped by weekday dispatcher

### UI Flow
1. Admin clicks "Auto Assign" button
2. Confirmation dialog: "This will replace all current weekend assignments. Continue?"
3. Algorithm runs, assignments are saved
4. Fleet cards refresh showing new assignments

