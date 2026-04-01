

# Add Alert Icons to Reports Page

## Summary
Add expiring document/date icons next to each truck and driver row in Reports, matching the yellow/red color system from the Alerts page. Each alert type gets a distinct icon with a tooltip showing days remaining.

## Complete Alert List & Suggested Icons

### Truck Alerts (shown in truck number cell)
| Alert | Icon | Color Logic |
|---|---|---|
| DOT Inspection | `dotInspectionIcon` (existing) | ≤30d = red, ≤60d = yellow |
| Plate Expiration | `CreditCard` (lucide) | ≤30d = red, ≤60d = yellow |
| Insurance Expiration | `ShieldCheck` (lucide) | ≤30d = red, ≤60d = yellow |
| Oil Change | `wrenchIcon` (existing) | ≤7d = red, ≤30d = yellow |
| Tires Swap | `CircleDot` (lucide) | ≤7d = red, ≤30d = yellow |
| Maintenance Check | `Settings` (lucide) | ≤7d = red, ≤30d = yellow |

### Driver Alerts (shown in driver name cell)
| Alert | Icon | Color Logic |
|---|---|---|
| CDL Expiration | `IdCard` (lucide) | ≤30d = red, ≤60d = yellow |
| MVR Date | `FileText` (lucide) | ≤30d = red, ≤60d = yellow |
| Clearing House | `Building2` (lucide) | ≤30d = red, ≤60d = yellow |
| Medical Card | `HeartPulse` (lucide) | ≤30d = red, ≤60d = yellow |
| Random Drug Test | `Pill` (existing) | Already implemented |

## Implementation Steps

### 1. Pass missing alert fields through adapter (~2 files)
**`src/hooks/useReportsDateWindowAdapter.ts`** and **`src/hooks/useReports.ts`**:
- Add to the truck object mapping: `plate_expiration_date`, `insurance_expiration_date`
- Add driver alert fields: `cdl_expiration_date`, `mvr_date`, `clearing_house`, `medical_card_expiration_date`
- These fields already exist in the raw data (both queries use `select("*")`)

### 2. Add helper functions for new alert types
**`src/pages/Reports/helpers.ts`**:
- Add `getPlateInsuranceIconStatus(truck)` — checks plate & insurance dates (≤30d red, ≤60d yellow)
- Add `getDriverAlertIconStatus(truck)` — checks CDL, MVR, clearing house, medical card dates

### 3. Render icons in Reports truck rows
**`src/pages/Reports.tsx`**:
- Import new lucide icons (`CreditCard`, `ShieldCheck`, `IdCard`, `FileText`, `Building2`, `HeartPulse`, `CircleDot`, `Settings`)
- In the truck number cell (next to existing DOT icon): add plate and insurance alert icons
- In the driver name cell (next to existing wrench/pill icons): add CDL, MVR, clearing house, medical card icons
- Each icon uses a tooltip showing "CDL: 15 days left" etc.
- Yellow/red coloring matches the Alerts page thresholds

### 4. Extend maintenance icon to include tires & maintenance check individually
Currently `getMaintenanceIconStatus` bundles oil/tires/maintenance into one wrench icon. Add separate icons for tires swap (`CircleDot`) and maintenance check (`Settings`) alongside the existing wrench.

## Technical Details
- All date fields already exist in the Supabase `trucks` and `drivers` tables
- Both hooks already fetch `select("*")` so no additional queries needed
- Icons use lucide-react components with `className` for coloring (e.g., `text-red-500`, `text-yellow-500`)
- Tooltips use existing `<Tooltip>` pattern already in Reports
- Files modified: `useReportsDateWindowAdapter.ts`, `useReports.ts`, `Reports/helpers.ts`, `Reports.tsx`

