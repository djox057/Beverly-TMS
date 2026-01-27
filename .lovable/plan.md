

# Fix Reports Page Maintenance and DOT Alert Icons

## Problem Summary
The Reports page is no longer displaying maintenance and DOT inspection alert icons (oil change, tires swap, maintenance check, truck DOT, trailer DOT) that used to appear in the legacy system.

## Root Causes Identified

### Issue 1: Property Name Mismatch (snake_case vs camelCase)
The adapter in `useReportsDateWindowAdapter.ts` maps truck maintenance dates to **camelCase** properties:
```typescript
oilChangeDate: truck?.oil_change_date,
maintenanceCheckDate: truck?.maintenance_check_date,
dotInspectionDate: truck?.dot_inspection_date,
```

But the helper functions in `helpers.ts` expect **snake_case** properties:
```typescript
// getMaintenanceIconStatus looks for:
truck.oil_change_date
truck.tires_swap_date
truck.maintenance_check_date

// getDotInspectionIconStatus looks for:
truck.dot_inspection_date
truck.trailer_dot_inspection_date
```

### Issue 2: Missing Fields
The adapter is completely missing:
- `tires_swap_date` - not mapped at all
- `trailer_dot_inspection_date` - not mapped at all

### Issue 3: Trailers Query Missing DOT Date
The trailers query only selects `id` and `trailer_number`:
```typescript
.select("id, trailer_number")
```
It should also fetch `dot_inspection_date` so the trailer DOT alert can be displayed.

## Solution

### Step 1: Update Trailers Query
Modify the trailers query to include `dot_inspection_date`:
```typescript
.select("id, trailer_number, dot_inspection_date")
```

### Step 2: Update trailerMap
Change the trailerMap from `Map<string, string>` to `Map<string, object>` to store the full trailer info needed (number + DOT date).

### Step 3: Fix Truck Object Property Names
Update the truck object construction to use **snake_case** property names matching what the helpers expect:
```typescript
// Maintenance dates (snake_case to match helpers)
oil_change_date: truck?.oil_change_date || null,
tires_swap_date: truck?.tires_swap_date || null,
maintenance_check_date: truck?.maintenance_check_date || null,
// DOT inspection dates (snake_case to match helpers)
dot_inspection_date: truck?.dot_inspection_date || null,
trailer_dot_inspection_date: trailerInfo?.dot_inspection_date || null,
```

## Files to Modify

### `src/hooks/useReportsDateWindowAdapter.ts`

1. **Trailers query** (line 206): Add `dot_inspection_date` to the select
2. **trailerMap** (line 462): Change to store full trailer object instead of just the number
3. **Truck object construction** (lines 735-738): 
   - Change to snake_case property names
   - Add missing `tires_swap_date`
   - Add `trailer_dot_inspection_date` from trailerInfo
4. **Update trailerNumber assignment** (line 682): Adjust to use trailerInfo object

## Technical Details

### Current vs Fixed Data Flow:

```text
Current (BROKEN):
┌──────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│ trucks table │ ──> │ oilChangeDate (CC)   │ ──> │ Helpers expect     │
│              │     │ dotInspectionDate    │     │ oil_change_date ❌ │
│              │     │ (missing tires_swap) │     │ (no match!)        │
└──────────────┘     └──────────────────────┘     └────────────────────┘

┌────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ trailers table │ ──> │ only trailer_number │ ──> │ Helpers expect      │
│                │     │ (no DOT date!)      │     │ trailer_dot_date ❌ │
└────────────────┘     └─────────────────────┘     └─────────────────────┘

Fixed:
┌──────────────┐     ┌────────────────────────┐     ┌────────────────────┐
│ trucks table │ ──> │ oil_change_date (SC)   │ ──> │ Helpers expect     │
│              │     │ tires_swap_date        │     │ oil_change_date ✅ │
│              │     │ maintenance_check_date │     │ (matches!)         │
│              │     │ dot_inspection_date    │     │                    │
└──────────────┘     └────────────────────────┘     └────────────────────┘

┌────────────────┐     ┌─────────────────────────┐     ┌─────────────────────┐
│ trailers table │ ──> │ trailer_number +        │ ──> │ Helpers expect      │
│                │     │ dot_inspection_date ──> │     │ trailer_dot_date ✅ │
└────────────────┘     │ trailer_dot_inspection  │     └─────────────────────┘
                       └─────────────────────────┘
```

## Testing Checklist
1. Verify oil change icon (wrench) appears in yellow when due within 30 days
2. Verify oil change icon appears in red when due within 7 days
3. Verify tires swap date triggers wrench icon
4. Verify maintenance check date triggers wrench icon
5. Verify truck DOT inspection icon appears in yellow (60 days) / red (30 days)
6. Verify trailer DOT inspection icon appears correctly
7. Verify tooltips show correct information for each alert
8. Verify drivers without trucks still display correctly (no alerts expected)

