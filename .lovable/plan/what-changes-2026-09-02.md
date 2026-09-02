Update dispatcher performance score formula in `src/pages/DispatcherTier.tsx`.

## What changes
- Use `avgDrivers` instead of `avgTrucks` for the score.
  - Read `driver_count` from `dispatcher_daily_driver_counts`, falling back to `truck_count` when `driver_count` is missing.
  - Rename the sort key from `avgTrucks` to `avgDrivers` and update the sort dropdown label.
- Replace the current score formula with the requested one:
  - `dispatcher_gross_per_driver = dispatcher_gross / dispatcher_avgDrivers`
  - `dispatcher_cut_per_driver = dispatcher_cut / dispatcher_avgDrivers`
  - `avg_gross_per_driver = total_gross / total_avgDrivers`
  - `avg_cut_per_driver = total_cut / total_avgDrivers`
  - `overall_percent = 100 × (1 + 1.08×(dispatcher_rpm/avg_rpm − 1) + 0.35×(dispatcher_gross_per_driver/avg_gross_per_driver − 1) + 0.10×(dispatcher_cut_per_driver/avg_cut_per_driver − 1) + 0.05×(dispatcher_avgDrivers/3 − 1))`
- Keep the existing eligibility guard (`gross > 0` and `avgDrivers > 1`), so dispatchers without enough data still show `NaN`.
- Update the Overall badge to display the new percentage value directly (e.g. `Overall 108%` instead of `Overall 1.08`).
- Update the `currentTrucks` badge label unchanged, but the average badge label changes to `Avg {avgDrivers.toFixed(1)} drivers MTD`.

## What does not change
- `DispatcherTierDetail.tsx` uses weekly/monthly gross, RPM, and cut totals; it does not compute the overall performance score, so it is left unchanged.
- The order aggregation (gross, pay, miles, RPM, cut) stays identical to the current logic.
- The role/office filter and search behavior stay the same.

## Verification
- Run `bun run build` (or the project build command).
- Run `bun run typecheck`.
- Confirm the Overall badge renders as a percentage and sort by `Avg Drivers (MTD)` works.
