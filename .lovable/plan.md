Observed from the database:

- Truck 03199 should show: 21572-AP, broker #938960
  - Pickup: 1793 US Hwy 42 S, Suite 300, Mcdonough, GA 30252
  - Delivery: 2107 CHANUTE DRIVE, Alexandria, LA 71303
  - 21685-AP is a future pre-plan for Jul 2, so it should not replace the current Jul 1 load yet.

- Truck 7461 should show: 21529-AP, broker #2026833
  - Pickup: 16750 THREE MILE LANE, Lewiston, ID 83501
  - Delivery: 21727 SIDNEY STAGE ROAD, Piedmont, SD 57769

Plan:
1. Update the Live Fleet Map load picker in `src/pages/TrucksMap.tsx` so it no longer chooses old delivered loads just because they have a BOL.
2. Selection order will be:
   - active/open load with BOL and no POD
   - active/open load with no POD whose pickup time has already started
   - earliest upcoming open load if nothing has started yet
   - fallback to latest historical BOL load only if there are no open loads
3. Keep pickup/delivery marker behavior based on BOL status: no BOL points to pickup, BOL points to delivery.
4. Verify 03199 resolves to 21572-AP and 7461 resolves to 21529-AP after the change.