# Add manual "bypass" for missing files

Right now two panels block on missing files:
- **Lumper missing Revised RC / Additional** (orders with `lumper > 0`)
- **EFS Fuel missing receipt or gallons** (`efs_other_requests` where `purpose = 'Fuel'`)

Sometimes the file legitimately can't be uploaded but the request is valid. Add a manual bypass that behaves exactly as if the file were uploaded — the row disappears from the missing panel, the driver stops being flagged, and downstream logic (e.g. dispatcher/driver missing-data indicators) treats it as complete.

## Schema changes (migration)

1. `orders` — add `lumper_revised_rc_bypassed boolean not null default false` plus `lumper_revised_rc_bypassed_by uuid`, `lumper_revised_rc_bypassed_at timestamptz` for audit.
2. `efs_other_requests` — add `receipt_bypassed boolean not null default false` plus `receipt_bypassed_by uuid`, `receipt_bypassed_at timestamptz`. This single flag bypasses both the missing receipt AND the missing gallons for that Fuel request (they're the same panel row).

No new grants needed (existing table grants cover new columns). No RLS changes — existing policies apply.

## Query changes

- `useLumperMissingRevisedRC`: exclude orders where `lumper_revised_rc_bypassed = true`. Add to `select`, and treat bypassed rows as "has RC" in the post-filter.
- `useEfsMissingReceipts`: change the `.or(...)` to also require `receipt_bypassed = false` (rewrite as: fuel AND receipt_bypassed=false AND (receipt_path is null OR quantity is null)).
- `useEfsMissingByDriver`: same additional filter so driver indicators clear.

## UI

- **LumperMissingRevisedRCPanel** — next to the existing "Upload" action, add a small "Mark as uploaded" button (ghost/outline) with a confirm dialog ("This will hide the row without a file. Continue?"). On confirm, `update orders set lumper_revised_rc_bypassed = true, ..._by = auth.uid(), ..._at = now()`.
- **EfsMissingReceiptsPanel** — same pattern on each fuel row: a "Mark as complete" bypass button that sets `receipt_bypassed = true` and closes the row for both receipt and gallons.
- Both bypass actions invalidate the relevant react-query keys so the row disappears immediately.

## Permissions

Restrict bypass buttons to admin/manager/accounting (same roles that already delete EFS requests). Non-privileged users don't see the button. No mention of the bypass anywhere else in the UI.

## Out of scope

- No new admin screen to review bypassed rows.
- No un-bypass button (can be reverted via SQL if needed).
- Historical unbypassed rows are unaffected.
