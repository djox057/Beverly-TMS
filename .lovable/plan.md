## Add dedicated "Export UES Jan 1–Jun 23" button

Add a **new, separate button** in the Orders page toolbar (next to the existing "Export to Excel" button) that runs a hardcoded export — independent of the page's current filters.

### Behavior

- **Label:** `Export UES (Jan 1 – Jun 23)`
- **Placement:** Orders page top-right toolbar, next to existing Export/Generate Invoices buttons
- **Visibility:** Same roles as current export (Admin, Accounting, Manager)
- **On click:** Fetches orders matching:
  - Operating company = **United Enterprise Solutions INC**
  - Delivery date between **2025-01-01** and **2025-06-23** (inclusive)
  - Ignores all on-screen filters
- **Output:** Excel file with the standard column set, plus a bold **TOTALS** row at the bottom summing **Miles**, **Driver Pay**, and **Total Freight**
- **Filename:** `UES_orders_2025-01-01_to_2025-06-23.xlsx`

### Technical notes

- In `src/pages/Orders.tsx`, add a new handler `handleExportUES` that queries Supabase directly with the hardcoded company id (looked up by name `United Enterprise Solutions INC`) and delivery date range — does not depend on `filteredOrders`.
- Reuse the existing row-mapping logic and the `totalsRow` + bold styling already added for the standard export.
- The existing "Export to Excel" button stays as-is (still filter-driven).

### Out of scope

- No date picker or company picker — values are hardcoded per request.
- No changes to the existing Export to Excel button.
