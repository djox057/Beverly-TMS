## Problem

In the Reports Load Info dialog, the "Booked by: {company}" line is missing for some loads (e.g. load `10335-BFP` shows only the Broker line). The render block in `src/pages/Reports.tsx` already places "Booked by" above "Broker", but it's gated on `zoomedLoad.bookedByCompanyName`, which resolves to `null` when the underlying order has no `booked_by_company_id` (and no joined `booked_by_company` object) — even though the frozen internal load number suffix (`-BFP`, `-BF`, etc.) already encodes the booking entity.

## Fix

In `src/pages/Reports.tsx`, extend the `bookedByCompanyName` fallback chain in `getLoadDetailsForZoom` (around line 1192) to also resolve the legal entity from the internal load number suffix using the existing `getCompanyNameFromSuffix` helper from `src/utils/formatInternalLoadNumber.ts`.

New resolution order:
1. `order.bookedByCompanyName`
2. `order.booked_by_company?.name`
3. `companiesList.find(c => c.id === order.booked_by_company_id)?.name`
4. `getCompanyNameFromSuffix(order.internal_load_number)` (new)

The existing render block at lines 6628–6637 already shows Booked by above Broker, so no JSX changes are needed — only the data resolver. Import `getCompanyNameFromSuffix` at the top of `Reports.tsx`.

## Scope

- Edit only `src/pages/Reports.tsx`.
- No DB / edge function changes.
- No change to Broker rendering.
