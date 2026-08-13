# Alerts: Registration replaces Tires Swap (trucks)

## Goal
On the Alerts page, the truck alerts should track a truck's **Registration expiration** instead of **Tires Swap**.

## What changes

1. **New truck field: Registration Expiration Date**
   - Add `registration_expiration_date` (date, optional) to the trucks table.
   - Existing trucks start empty; it can be filled in from the Alerts edit dialog.

2. **Alerts page — trucks tab**
   - Remove the "Tires Swap" column, its clickable filter, its sort option, and its field in the truck edit dialog.
   - Add a "Registration" column in its place, with the same click-to-filter and sort behavior as DOT / Plate / Insurance.
   - Registration uses the same expiring-soon logic as the other date columns (flagged when expired or within 2 months), not the maintenance-style logic Tires Swap used.
   - Add a "Registration Expiration Date" input to the truck edit dialog on this page.

3. **Alert counts / badges**
   - The truck alert query that feeds the Alerts tab count and sidebar badge will include trucks with an expiring/expired registration and stop counting tires-swap dates.

## Notes
- The `tires_swap_date` data stays in the database and remains visible wherever else it is used (e.g. maintenance views); it is only removed from Alerts.
- Maintenance Check column stays as is.

## Technical detail
- Migration: `ALTER TABLE public.trucks ADD COLUMN registration_expiration_date date;`
- `src/pages/Alerts.tsx`: update `TruckColumnFilter` / `TruckSortKey` unions, `truckColumnOptions`, the filter predicate, sort key map, header + cell rendering, and the edit-dialog form/submit payload.
- `src/hooks/useExpiringAlerts.ts`: in `useExpiringTrucks`, drop `tires_swap_date` from `hasMaintenanceDate` and add a `registration_expiration_date <= twoMonthsFromNow` check.
