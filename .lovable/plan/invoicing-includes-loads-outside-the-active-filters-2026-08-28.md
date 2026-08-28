# Invoicing includes loads outside the active filters

Yes — the behavior is real, and there are two separate confirmed causes. Both only show up on large filtered batches, which is why it looks random.

## What happens today

Invoicing takes exactly the rows currently listed in All Loads (or the selected ones). So any row that slips into the filtered list gets invoiced. Two things let rows slip in:

### Cause 1 — the date filter is applied to a different date than the one shown (main cause)

The server filters on the order's own delivery/pickup timestamp, but the Delivery Date column shows the last delivery stop from the stops list. When a stop date is edited after the order was created, the two disagree. Because of this known mismatch, the page deliberately skips re-checking dates on the client when a server filter is active — so the disagreeing row stays in the list and gets invoiced.

Measured on live data (delivery Jun 1 – Aug 27, 2026, 16,266 orders): 215 orders where the two delivery dates differ, and 10 of them have a last stop date completely outside the range. That matches "a few extra orders" per large batch.

### Cause 2 — date range boundaries are compared in UTC, not Chicago time

The from/to boundaries are sent as plain `YYYY-MM-DD 00:00:00` / `23:59:59` with no timezone, and the database interprets them as UTC (confirmed: DB timezone is UTC). Chicago is UTC-5, so the window is effectively shifted 5 hours: loads delivered in the evening of the day *before* the range start are pulled in, and evening loads on the last day of the range can be pulled from the following day's edge.

Measured for Jul 01 – Aug 27, 2026: 5 orders included by the query whose Chicago delivery date is outside the selected range.

## The fix

1. **Make the date filter consistent with what's displayed.** Keep server-side date filtering for speed, but re-apply the date check on the client using the same date the table shows (last delivery stop, falling back to the order's delivery timestamp) before a row can be listed/invoiced. This removes the "skip client date filter when server-filtered" shortcut that currently lets mismatched rows through.

2. **Convert range boundaries to Chicago-time instants.** Send the from/to boundaries as explicit timestamps with the Chicago offset (start = 00:00:00 Chicago, end = 23:59:59.999 Chicago) so the server window matches the days the user picked. Applies to both delivery and pickup ranges.

3. **Widen the server window slightly, filter exactly on the client.** Because stop dates can differ from the order timestamp, query one day of padding on each side server-side and let the client date check (step 1) decide the final list. This prevents legitimately in-range loads from being missed while still excluding out-of-range ones.

4. **Safety net before invoicing.** In the invoice action, re-verify each order against the currently active filters and drop any that no longer match, reporting them in the existing warnings dialog instead of silently invoicing them.

## Technical notes

- `src/pages/Orders.tsx`: `serverFilters` builds the boundary strings via `formatDateNoTz` (no timezone) — change to Chicago-offset ISO strings and add ±1 day padding. In `filteredOrders`, the `isServerFiltered` shortcut currently sets `matchesDateAlways` / `matchesPickupDateAlways` to `true`; make those checks always run and resolve the compared date the same way the Delivery/Pickup columns do.
- `supabase/functions/search-orders/index.ts`: `gte/lte` on `delivery_datetime` / `pickup_datetime` stay as-is; they just receive timezone-aware boundaries.
- `generateInvoices` in `Orders.tsx`: add the pre-flight filter re-check and surface skipped loads through `InvoiceWarning`.
- No schema changes, no migrations, no changes to invoice PDF layout or numbering.
