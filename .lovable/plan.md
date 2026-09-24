# Recovery driver takes the original driver's company

When a recovery driver is assigned to a truck in Yard Arrivals, first switch his company, then put him on the truck.

## Company used (in order)
1. The original driver's company (the driver who left the truck).
2. If that driver has no company, the truck's company.
3. If neither has one, the recovery driver's company stays the same.

## Where it applies
Both places in Yard Arrivals that assign a recovery driver:
- Setting Game Over / Recovery status with a recovery driver picked.
- The "Assign Recovery Driver" step on its own.

## Order of steps
1. Look up the original driver's company, or the truck's company as fallback.
2. Update the recovery driver's company (only if it's different).
3. Assign the recovery driver to the truck.
If step 2 fails, show an error and do not assign the truck.

The existing driver company history keeps recording the change automatically, so it will appear in the driver's company history.

## Technical details
- `src/pages/YardArrivals.tsx`: add a helper `syncRecoveryDriverCompany(truckId, originalDriverId, recoveryDriverId)` that reads `drivers.company_id` for the original driver (fallback `trucks.company_id`), updates `drivers.company_id` on the recovery driver, and is awaited before the `trucks` update in `handleStatusConfirm` and `handleAssignRecoveryDriver`. For the standalone assign, the original driver is `trucks.left_by_driver_id`, falling back to `statusDialogData.driverId`.
- Also refresh the drivers/fleet caches afterwards.
