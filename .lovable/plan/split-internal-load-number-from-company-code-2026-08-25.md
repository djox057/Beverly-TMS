# Split internal load number from company code

Today a new order gets an internal load number like `25653-AP`, where `AP` is derived from the driver/truck company. Going forward, the number and the company will be stored separately: the load number becomes plain `25653`, and the company for that load is stored in its own field.

## Scope

- New orders only. Existing loads keep their current `25653-AP` value untouched, and nothing about their display changes.
- Numbering stays per company, exactly as today (each company keeps its own counter, so the same number can exist under two companies).
- Display shows the number only. No suffix, no extra chip.
- The new field records the company the driver/truck belonged to for that load (the order's company), frozen at creation.

## What changes

1. New order creation stops appending the suffix. `25653-AP` becomes internal load number `25653` plus company code `AP` in the new field.
2. The company code is stored once at creation and never recalculated, so it survives later driver/company changes — same "frozen" behavior the suffix had.
3. Invoices keep resolving the correct legal entity: they read the suffix when present (old loads) and fall back to the new field for new loads, so nothing regresses on paperwork.
4. Search keeps working: typing `25653` finds both old and new loads; typing `25653-AP` still finds the old ones.

## Technical details

**Database**

- Migration adds `orders.load_company_code text` (nullable, no backfill) plus an index for lookups.
- `create_order_with_unique_load_number` is updated: keep the existing advisory lock, idempotency and per-company max-number logic (which already strips `-suffix`, so mixed old/new rows compute the next number correctly), but insert `internal_load_number = next_load_number::text` and `load_company_code = <computed suffix>`. The returned JSON gains `load_company_code`.

**Frontend**

- `src/utils/formatInternalLoadNumber.ts`: `getCompanyNameFromSuffix` unchanged; add a resolver that takes `(internalLoadNumber, loadCompanyCode)` and returns the legal company name from the suffix first, then the code.
- `src/utils/ordersTransform.ts`: map `load_company_code` → `loadCompanyCode` both directions.
- `src/utils/invoiceGenerator.ts` (3 call sites): use the new resolver instead of suffix-only, falling back to `order.companyName` as today.
- `src/hooks/useNextInternalLoadNumber.ts`: return the plain next number (drop `getCompanySuffix` from the preview value); still parse existing values by their numeric prefix.
- `src/pages/NewOrder.tsx`: no suffix in the created/displayed number; carry `load_company_code` through from the RPC result.
- Order fetch selects (`useReports`, `useTripsLazyOrders`, `useDispatcherLazyOrders`, `useYardLoads*`, and the `get-all-locked-orders` / `get-all-unlocked-orders` / `orders-summary` / `search-orders` edge functions) add `load_company_code` where the order row is projected, so invoice generation has it available.

No display component needs changes, since `formatInternalLoadNumber` already passes the stored text through.
