

## Problem

The Reports page delivery/pickup cells ignore force-complete flags because:

1. **Local functions shadow helpers**: `Reports.tsx` defines its own `getPickupCellColor` and `getDeliveryCellColor` (lines 1667, 1706) that directly check `order.order_files` instead of using the `orderHasBOL`/`orderHasPOD` helpers from `helpers.ts`.

2. **No synthetic file injection in adapter**: `useReportsDateWindowAdapter.ts` never injects synthetic BOL/POD files for force-completed orders, so even if the helpers were used, the file counts wouldn't reflect force-complete status.

## Plan

### Step 1: Inject synthetic files in the date-window adapter

In `src/hooks/useReportsDateWindowAdapter.ts`, after enriching orders with `order_files`, add logic to inject synthetic BOL/POD files when `bol_force_complete` or `pod_force_complete` is true — matching the same pattern used in `ordersTransform.ts`.

### Step 2: Remove duplicate local functions from Reports.tsx

Delete the local `getPickupCellColor` (lines 1667–1703) and `getDeliveryCellColor` (lines 1706–1755) from `Reports.tsx`. Update all call sites to use the imported versions from `helpers.ts`, passing the required `lateDeliveries`/`latePickups` arguments.

This ensures all cell coloring goes through the single source of truth that already handles force-complete via `orderHasBOL`/`orderHasPOD`.

