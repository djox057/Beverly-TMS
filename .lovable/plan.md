

# Fix Order File Upload Failures Due to Filenames

## Problem
Files with characters like `-`, spaces, or other special chars in their names fail to upload to Supabase Storage. The current `sanitizeFileName` preserves hyphens and spaces, but these can cause issues. Additionally, the extraction flow in NewOrder sends the original (unsanitized) filename via FormData which may cause edge function failures.

## Plan

### 1. Make `sanitizeFileName` more aggressive (`src/utils/orderFilesUpload.ts`)

- Replace spaces with underscores
- Replace hyphens with underscores  
- Only allow alphanumeric chars, underscores, dots, and parentheses
- Collapse consecutive underscores/dots

### 2. Add UUID fallback to `uploadOrderFilePreserveName`

After the sanitized name fails (non-conflict error), retry once with a UUID-based filename preserving only the extension:
```text
{orderId}/{folder}/{uuid}.{ext}
```

### 3. Fix NewOrder extraction flow (`src/pages/NewOrder.tsx`)

When creating the FormData for the extraction edge function, create a new `File` object with a sanitized name before appending to FormData:
```typescript
const safeName = sanitizeFileName(pdfFile.name);
const safeFile = new File([pdfFile], safeName, { type: pdfFile.type });
formData.append("pdf", safeFile);
```

Export `sanitizeFileName` from `orderFilesUpload.ts` for reuse.

### Files Changed
- `src/utils/orderFilesUpload.ts` — aggressive sanitization + UUID fallback
- `src/pages/NewOrder.tsx` — sanitize filename before sending to edge function

