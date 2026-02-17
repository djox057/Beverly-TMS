## Adjust Invoice PDF Column Widths

### Problem

Long internal load numbers (e.g., "TR-0000284938-01") overflow the Load # column in generated invoices. The Date column is also slightly tight, and the Qty column is unnecessarily wide for a single digit.

### Changes

**File: `src/utils/invoiceGenerator.ts**`

Redistribute column widths while keeping the same total table width (183 units, from x=20 to x=203):


| Column               | Current Width | New Width |
| -------------------- | ------------- | --------- |
| Date                 | 20            | 22        |
| Truck #              | 20            | 20        |
| Load #               | 25            | 35        |
| Origin - Destination | 53            | 53        |
| Qty                  | 20            | 12        |
| Rate                 | 20            | 20        |
| Amount               | 25            | 25        |


Key adjustments:

- Load # gets 10 extra units (25 to 35) to fit long load numbers
- Qty shrinks from 20 to 12 (only displays "1")
- Date gets 2 extra units and text will be left-aligned as-is

### Technical Details

Update the `rect()` calls for headers (lines ~297-303) and data rows (lines ~346-352), plus the corresponding `text()` x-positions for headers (lines ~305-311) and data (lines ~357-363). Also update the text x-positions in the totals section (Freight Income, Detention, etc.) which reference x=138, 140, 158, 160, 178, 180.

The `splitTextToSize` for origin-destination (line 340) will be adjusted from width 50 to 45 to match the narrower column.