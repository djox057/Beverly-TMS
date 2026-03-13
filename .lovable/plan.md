

## Problem

The non-Chromium (Firefox/Safari) drag-and-drop fallback is broken because the `onDragStart` handler is `async`. The browser's drag-and-drop API is synchronous — by the time the `await fetch()` resolves, the drag operation has already started and `e.dataTransfer` is no longer writable. The `e.dataTransfer.items.add(file)` call happens too late and is silently ignored.

Additionally, Firefox does not support `e.dataTransfer.items.add(file)` for adding File objects during drag operations the same way Chromium does.

## Solution

Since non-Chromium browsers cannot use `DownloadURL` and cannot asynchronously populate `dataTransfer`, the only reliable cross-browser approach is:

1. **For all browsers**: Always set `text/plain` and `text/uri-list` with the file name synchronously in `onDragStart` — this ensures *something* is always transferred.
2. **For Chromium**: Additionally set `DownloadURL` (existing logic, works fine).
3. **For non-Chromium**: Since we can't attach actual file blobs during drag, set `text/uri-list` with the signed URL as fallback. This is the browser limitation — Firefox/Safari simply cannot drag-and-drop actual files from web pages to external apps.

Alternatively, if the goal is to drag files into Gmail or similar web apps that accept file drops, we can **pre-fetch the blob on hover/popover open** and store it, then synchronously add it in `onDragStart`. This would work:

- On popover open (when signed URLs are fetched), also fetch blobs for each file and cache them.
- In `onDragStart`, synchronously read from cache and call `e.dataTransfer.items.add(cachedFile)`.

### Recommended approach

Pre-cache file blobs when the popover opens (signed URLs are already pre-fetched at that point). Then in `onDragStart`, synchronously use the cached blob:

**Changes in `src/pages/Reports.tsx`:**

1. Add a `docBlobCache` state (or ref) alongside existing `docSignedUrls` — a `Record<string, File>` mapping file paths to pre-fetched File objects.
2. When signed URLs are fetched (in the popover open handler), also fetch each file as a blob and store as `File` in the cache.
3. In `onDragStart`:
   - Chromium: keep existing `DownloadURL` logic (synchronous, works).
   - Non-Chromium: synchronously read from `docBlobCache` and call `e.dataTransfer.items.add(cachedFile)`. If not cached, fall back to `text/uri-list`.
4. Remove the `async` from `onDragStart` since all data is now pre-cached.

