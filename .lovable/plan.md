## Goal
Let you export all orders whose **delivery date** is between **Jan 1 – Jun 23** for operating company **United Enterprise Solutions INC** to Excel, with a totals row at the bottom that sums **Miles**, **Driver Pay**, and **Total Freight**.

## How you'll use it
The Orders page already has the filters needed — no new UI required:

1. On `/orders`, set the **Company** filter to `United Enterprise Solutions INC`.
2. Set the **Delivery date range** to `01/01/2026 – 06/23/2026` (or the year you want).
3. Wait for results to load, then click the existing **Export to Excel** button.

The exported file will contain the same columns as today (Truck #, Load #, Pickup/Delivery date + city/state, Miles, Driver Pay, Driver, Broker, Invoiced, Total Freight, Notes, Company, Booked By) plus the new totals row.

## What changes in code
Single edit in `src/pages/Orders.tsx` inside `exportToExcel` (around line 1094):

- After building `exportData`, compute three sums across the filtered rows:
  - `Miles` → sum of `order.mileage`
  - `Driver Pay` → sum of `order.totalDriverPay` (only included for non-`dispatch` roles, matching current column visibility)
  - `Total Freight` → sum of `order.totalFreightAmount`
- Append one extra row to `exportData` with:
  - `"Truck #": "TOTALS"`
  - the three sum fields populated
  - all other fields left empty
- Bold the totals row using ExcelJS-style cell styling via `XLSX.utils` (set `worksheet['!rows']` or apply `s` style to the last row's cells through `worksheet[cellRef].s = { font: { bold: true } }`).
- Keep filename pattern `orders_<today>.xlsx`.

## Out of scope
- No new filter UI, no new dialog, no preset button.
- No changes to which orders are exported beyond what the existing on-screen filters already produce (so the export reflects exactly what's visible).
- No change to column set or column order.
