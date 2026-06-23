## Problem

In `src/pages/NewOrder.tsx`, the submit flow does this in order:

1. RPC `create_order_with_unique_load_number` → order row created
2. Insert `pickup_drops`
3. Loop and upload RC / BOL / POD / ADDITIONAL files to Storage, then insert `order_files` rows
4. Any `throw` in steps 2–3 falls into one `catch` that shows a single toast: **"Error Creating Order"**

When the RC upload step throws (intermittent, mostly on Edge), the user sees that toast and assumes the load wasn't created — but the order row + stops already exist. They re-create the load, which is what they're reporting as "creates the order just without RC".

Two root causes:

- **Reporting**: post-creation failures (file uploads) are reported with the same wording as pre-creation failures.
- **Reliability on Edge**: Storage uploads via `uploadOrderFilePreserveName` only retry on `TypeError: Failed to fetch`. Edge intermittently fails the multipart upload with a different error shape (aborted request / "body stream already read" after Edge's network stack retries internally, or a transient 5xx from Storage). These aren't currently retried.

## Fix

### 1. Separate "order created" from "files failed" (frontend only, `src/pages/NewOrder.tsx`)

- Track a boolean `orderCreated` flag set to `true` immediately after the RPC + `pickup_drops` insert succeed.
- Wrap the file-upload loop in its own try/catch. On failure:
  - Keep the created order (don't redirect away from the upload list).
  - Show a non-destructive warning toast: **"Load #XXXX created — some files failed to upload. Please re-upload them from Edit Order."** with the failing category/filename.
  - Still navigate to `/orders` (or offer an "Open order" action) but don't show "Error Creating Order".
- Only the existing `catch` for pre-creation failures keeps the current "Error Creating Order" wording.

### 2. Make Storage uploads more resilient (`src/utils/orderFilesUpload.ts` + the upload loop)

- In `uploadOrderFilePreserveName`, retry transient upload errors (network errors, HTTP 5xx, `AbortError`) up to 3 times with exponential backoff (300ms / 900ms / 2.5s) before falling back to the UUID filename.
- Before uploading, read the File into an `ArrayBuffer` once and upload a fresh `Blob` built from it. Edge has known issues re-streaming the same `File` reference on retry; using a buffered Blob avoids the "body stream already read" / aborted-upload failures we believe are causing this.
- Broaden `withFetchRetry`'s `isNetworkErr` to also retry on `AbortError`, generic `TypeError` without a message, and Supabase Storage errors with HTTP status 502/503/504.

### 3. Idempotency for `order_files` (`src/pages/NewOrder.tsx`)

- Before inserting an `order_files` row, skip if a row with the same `(order_id, file_category, file_name)` already exists, so retrying the failed step after the user re-clicks Save (now possible from Edit Order) doesn't duplicate file rows.

## Out of scope

- No DB migration. No RLS changes.
- No change to the RPC or stops insertion logic — those steps are not the failure path the user is hitting.

## Verification

- Manually fail an RC upload (e.g. block the storage URL in DevTools) → confirm:
  - Order row still exists
  - Warning toast (not error) shown
  - User lands in a state where they can re-upload from Edit Order without creating a duplicate load
- Repeat on Edge to confirm the buffered-Blob + extended retry path no longer throws on transient uploads.
