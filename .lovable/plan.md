
Investigation summary (current state)

1) The two red “Missing files” in your screenshot are real storage misses, not merge bugs:
- Invoice 10903-UE → `RC/RateConf_2002509104.pdf` exists in `order_files` table, but does NOT exist in `storage.objects`.
- Invoice 10876-UE → `BOL/217979284010.jpg` exists in `order_files`, but does NOT exist in storage (while sibling `217979285010.jpg` does exist).

2) The amber “Embedded as Attachments” warnings are expected fallback behavior:
- Those RC PDFs do exist in storage.
- `merge-pdfs` is intentionally attaching them (paperclip fallback) when inline page merge fails.

3) This is a broader data-integrity issue, not just two files:
- `order_files` rows with no matching storage object: 463
- Category split of missing rows: RC 206, POD 145, BOL 103, ADDITIONAL 9

4) Root-cause likely path:
- Client file deletion in `EditOrder.tsx` does storage delete + DB delete as separate calls, and does not check/handle errors for either call robustly.
- Role policy mismatch increases risk of partial operations:
  - `order_files` DELETE policy excludes `supervisor`
  - storage `order-files` DELETE policies also exclude `supervisor`
  - insert/view permissions include more roles
- Result: orphan metadata rows (DB references to files no longer in storage).

What `https://.../functions/v1/create-invoice-folder` is used for

- Function behavior today: accepts `invoices[]` + `xlsxData` + `folderName`, builds a ZIP in-memory, returns `zipBytes` JSON payload.
- It does NOT create a Google Drive folder (docs are outdated there).
- It appears unused by the current app flow:
  - no frontend reference to `create-invoice-folder`
  - current invoicing path builds ZIP client-side and uses `merge-pdfs` for attachments
- So this function is effectively legacy/orphaned unless an external caller uses it.

Implementation plan

Phase 1 — Stop new corruption
1. Harden client deletion flow (`EditOrder.tsx`):
   - Explicitly validate both storage delete result and DB delete result.
   - If either fails, show user-facing error and do not silently continue.
2. Align permissions:
   - Decide role policy consistency for delete (include `supervisor` in both DB + storage, or exclude in UI).
3. Add guardrails in UI:
   - Hide/disable delete action for roles that cannot delete both layers.

Phase 2 — Repair existing bad rows
4. Add one-time reconciliation job:
   - Scan `order_files` against `storage.objects` (`order-files` bucket).
   - Mark or remove orphaned rows (recommended: soft-mark first, then cleanup).
5. Add a quick admin report:
   - “Missing file references” view so ops can review/restore/delete rows safely.

Phase 3 — Improve invoice diagnostics
6. Enrich `merge-pdfs` skip reasons:
   - Return machine-readable reason codes (`storage_missing`, `download_failed`, `unsupported_format`, etc.).
7. Show better warning copy in Orders dialog:
   - Differentiate “file missing from storage” vs “format fallback attachment”.

Phase 4 — Decide fate of create-invoice-folder
8. Either:
   - remove/deprecate it (if truly unused), or
   - keep it and document it as “server-side ZIP builder,” not Drive folder creator.
9. Update `docs/BACKEND_ARCHITECTURE.md` to match real behavior.

Validation checklist after implementation
- Re-test invoice generation end-to-end for the loads from your screenshot.
- Verify red warnings only appear for truly missing storage objects.
- Verify amber warnings still open as paperclip attachments in Acrobat.
- Verify deleting/replacing files never leaves `order_files` orphan rows.
