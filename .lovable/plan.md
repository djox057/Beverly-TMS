

## Problem

Firefox's `DataTransfer.items.add(file)` works for image files (JPG/PNG) but silently fails or is ignored for PDF files. This is a known Firefox limitation — it only supports adding certain MIME types to drag data. So when dragging a PDF RC file, the code falls through to the `text/uri-list` fallback, which Gmail interprets as a link paste rather than a file attachment.

## Root Cause

Line 5918: `e.dataTransfer.items.add(cachedFile)` — Firefox accepts this for `image/*` types but not `application/pdf`. The `item !== null` check passes but Gmail still doesn't receive a proper file drop.

## Solution

Since Firefox fundamentally cannot drag-and-drop PDF files as attachments into Gmail, we need a two-part approach:

### 1. Detect PDF + non-Chromium and auto-download instead

When a user starts dragging a PDF file in Firefox, automatically trigger a blob download of the file. The user can then attach it from their downloads folder. Show a brief toast explaining this.

### 2. Keep image drag working as-is

For JPG/PNG files on Firefox, the current `items.add(file)` approach works — keep it unchanged.

### Changes in `src/pages/Reports.tsx`

**In the `onDragStart` handler (lines 5905-5931):**

For the non-Chromium branch, check if the file extension is PDF. If it is:
- Set `text/uri-list` as drag data (so something is transferred)
- Trigger an automatic blob download of the cached file (or fetch it)
- Show a toast: "PDF downloaded — attach from your Downloads folder"

For non-PDF files (images), keep the existing `items.add(cachedFile)` logic.

```
onDragStart (non-Chromium branch):
  if file is PDF:
    → setData("text/uri-list", signedUrl)
    → auto-download the PDF via blob + hidden <a> click
    → toast("PDF downloaded — drag from Downloads or attach manually")
  else (images):
    → existing items.add(cachedFile) logic (works fine)
```

This is the only reliable cross-browser approach since Firefox does not support dragging PDF blobs into web applications like Gmail.

