## Goal

The "***This is NOT an official payroll statement..." notice should only appear in the in-app preview, not in the PDF that is actually emailed to dispatchers.

## Current behavior

In `src/components/PayrollPreviewDialog.tsx`:
- `generatePreview()` calls `generatePayrollPdf(..., { previewOnly: true })` → adds the notice. ✅ Correct.
- `handleSendEmail()` also calls `generatePayrollPdf(...)` **without** `previewOnly`, so by the code in `src/utils/payrollPdfGenerator.ts` the notice should already be skipped.

However, the user reports the sent PDF still contains the notice. The likely cause: the `previewOnly` flag defaults correctly, but the disclaimer block above it (the red italic "***Due to the company policy..." line) is always rendered — and the user may be referring to that combined paragraph, OR the notice is leaking because something else.

Re-reading `payrollPdfGenerator.ts`: only the `if (options.previewOnly)` branch adds the "This is NOT an official payroll statement..." text. So `handleSendEmail` should already produce a clean PDF. The bug must be elsewhere.

## Investigation step

Confirm there is no other call site that sends the PDF with `previewOnly: true`. Search for `previewOnly` and `send-payroll-email` invocations. If `handleSendEmail` is correct, the issue is that the user is seeing the preview-with-notice in their email client because the same blob object is reused, OR there is a second sender path.

## Plan

1. Audit all call sites of `generatePayrollPdf` and `send-payroll-email` to confirm only `handleSendEmail` sends emails and that it never passes `previewOnly: true`.
2. If a leak is found (e.g., a path passing `previewOnly: true` to the email function), fix it so emailed PDFs always use `previewOnly: false`.
3. As a safety net, add an explicit `{ previewOnly: false }` in `handleSendEmail` to make intent obvious and impossible to misread.
4. Manually verify by sending a test statement and opening the attached PDF — confirm the "This is NOT an official payroll statement..." line is absent while the standard red disclaimer about company policy remains.

## Files likely touched

- `src/components/PayrollPreviewDialog.tsx` — make `handleSendEmail` pass `{ previewOnly: false }` explicitly; fix any other sender path found in the audit.
- (No changes expected to `src/utils/payrollPdfGenerator.ts` — its conditional is already correct.)
