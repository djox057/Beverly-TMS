

## Fix: Restore Edge-Based PDF Merge, Add BOL Support, Fix Warning Dialog

### Problem (3 issues)
1. Client-side merge lacks storage path fallback and "Attachment Included" notice for non-standard PDFs — it just skips them
2. BOL files fetched in `ordersTransform.ts` (line 82) but excluded from `invoiceGenerator.ts` — silently dropped
3. Warning dialog (Orders.tsx line 2209) always says "embedded as attachments" for ALL warnings, including files that were actually skipped entirely

### Changes

**File 1: `src/utils/invoiceGenerator.ts`**

- Add `bolFiles?: OrderFile[]` to `Order` interface (line 84)
- Add `bolFiles: OrderFile[]` to `MergeTask` interface (line 101)
- Add `'BOL'` to `SkippedFile` and `IncludedFile` `file_type` unions (lines 107, 113)
- **Replace `processMergeTask`** (lines 155-241): Call `supabase.functions.invoke('merge-pdfs', ...)` instead of client-side pdf-lib merge. On success return edge function's `pdfBytes`, `skippedFiles`, and `fallbackFiles` (filtered from `includedFiles` where `fallback === true`). On failure, return invoice-only PDF.
- **Delete `downloadFileFromStorage`** (lines 128-145) and **`isImageFile`** (lines 147-153) — only used by the removed client-side merge path
- Update merge task construction (line 594): add `bolFiles: order.bolFiles || []`
- Add startup log: `console.log('[invoice] Using merge-pdfs edge function + client-side ZIP assembly')`
- `pdf-lib` import: check if still used after changes; remove if not

**File 2: `supabase/functions/merge-pdfs/index.ts`**

- Add `bolFiles` to destructuring (line 86)
- Update `totalFiles` to include `(bolFiles?.length || 0)` (line 95)
- Add BOL processing block after RC (line 311), before POD:
  ```typescript
  if (bolFiles && bolFiles.length > 0) {
    console.log(`Processing ${bolFiles.length} BOL file(s)...`);
    for (const bolFile of bolFiles) {
      const success = await addFileToPdf(bolFile, 'BOL');
      if (success) successCount++;
    }
  }
  ```
- Add `'BOL'` to the type union in `addFileToPdf`, `includedFiles`, `skippedFiles`

**File 3: `src/pages/Orders.tsx`** (lines 2200-2232)

- Split warning dialog into two sections by `warning.reason`:
  - **`skipped`** (red/destructive): "could NOT be attached — these files are missing from the invoice"
  - **`fallback`** (amber/warning): "embedded as attachments — open in Adobe Acrobat, paperclip icon"
- Update dialog description to be generic ("Some files had issues during invoice generation")

### Merge order
RC → BOL → POD → ADDITIONAL (deterministic)

### What's removed
- `downloadFileFromStorage` and `isImageFile` helpers — only used by client-side merge path, deleted entirely (not moved)

### What stays the same
- ZIP assembly remains client-side
- Batch processing, timeout wrappers, progress tracking unchanged
- `create-invoice-folder` edge function left as-is (unused, not deleted)
- `pdf-lib` import: remove if no longer referenced after this change

