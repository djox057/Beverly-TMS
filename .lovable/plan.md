## Goal
In Edit Order, let users add multiple separate Lumper entries (Lumper 1, Lumper 2, Lumper 3...) instead of one stacked total. Each entry has its own amount, optional reason, and its own receipt file. The "Missing Lumper Receipt" workflow should require a receipt per entry.

## UX in Edit Order
- In the Additionals manager, Lumper becomes a multi-entry type (like "Other Charges" / "Other Additionals"):
  - Each "Add" creates a new Lumper row with its own amount and optional reason/label (e.g. "Pickup 1", "Walmart DC").
  - Each row is editable and removable independently.
  - Displayed label in the chip list: `Lumper 1`, `Lumper 2`, ... (auto-numbered), with the reason shown next to it if provided.
- Each Lumper row has its own "Receipt" upload button right on the row:
  - Upload, replace, view, delete a single receipt file scoped to that lumper entry.
  - File stored under existing order_files with `file_category = 'LUMPER'` and a new `lumper_index` (or `reason` key) so it stays tied to the specific entry.

## Data model
Add a new jsonb column `orders.lumper_items` storing an array of:
```
{ amount: number, reason: string, file_path: string | null, file_name: string | null }
```
Keep the existing `orders.lumper` numeric column populated as the sum of all `lumper_items.amount` so:
- Invoices, payroll, analytics, and "missing receipt" queries that read `orders.lumper` keep working with zero changes.
- Legacy single-value orders continue to display correctly (auto-migrated into a single `lumper_items` entry on first edit).

No destructive migration of existing data — the legacy `lumper` value stays as-is until the order is edited.

## Missing-Receipt workflow updates
- `useLumperMissingRevisedRC` and `LumperMissingDataDialog` switch from "one receipt per order" to "one receipt per lumper item":
  - An order is "missing" if ANY lumper_items[i] has amount > 0 and no file_path.
  - The dialog lists each missing entry separately (Order #, Lumper N, amount, reason) and uploads the receipt to that specific entry.
  - Legacy orders with only `lumper > 0` and no `lumper_items` still use `lumper_revised_rc_path` as today.

## Files touched
- `supabase/migrations/*` — add `lumper_items jsonb` column on `orders`.
- `src/components/OrderAdditionalsManager.tsx` — make `lumper` a multi-entry type with per-row file upload control; add `lumperItems` / `setLumperItems` props and an `onUploadLumperReceipt(index, file)` / `onDeleteLumperReceipt(index)` callback API.
- `src/pages/EditOrder.tsx` — replace single `lumper` state with `lumperItems` state; load from `orders.lumper_items` (falling back to legacy scalar), persist `lumper_items` and keep `lumper` synced as the sum; wire receipt upload/delete using existing order_files upload util with `file_category='LUMPER'` and an `index` reference.
- `src/hooks/useLumperMissingRevisedRC.ts` and `src/components/LumperMissingDataDialog.tsx` — expand to per-item missing detection and per-item upload target.
- `src/utils/orderChangeTracker.ts` — log per-entry lumper changes (added / removed / amount changed).
- Invoice / payroll readers (`src/utils/invoiceGenerator.ts`, etc.) — no change; they continue to use the summed `orders.lumper`.

## Out of scope
- Changing the New Order page (only Edit Order, per request).
- Changing how lumper totals appear on invoices, payroll, statements, or reports — total stays identical to the sum of entries.
