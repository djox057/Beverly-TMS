

## Fix: Stale Order Files in Reports After Upload/Delete

### Problem 1: Upload in Reports Dialog
After uploading a BOL/POD from the Reports zoomed load dialog, the adapter query is correctly invalidated (previous fix), but the `zoomedLoad` local state still holds the old `documents` and `orderFiles` arrays. The dialog continues showing the file as "not uploaded" until closed and reopened.

### Problem 2: Delete in Edit Order, Then Return to Reports
When a user opens Edit Order from Reports, deletes a file, saves, and navigates back -- the Reports grid still shows the deleted file as present (dark green). The module-level `orderFilesCacheByOrderId` in the adapter was never cleared for that order. File deletions are part of the `performSave` flow (not instant), so a single invalidation before `navigateBack()` covers all file changes.

---

### Changes

**File 1: `src/pages/Reports.tsx` (after line 925)**

Optimistically update `zoomedLoad` state after upload succeeds, so the dialog immediately reflects the new file:

```typescript
// After the invalidation (line 925), update zoomed load state
setZoomedLoad(prev => {
  if (!prev) return prev;
  const newFiles = uploadFiles.map((file, i) => ({
    id: `temp-${Date.now()}-${i}`,
    file_name: file.name,
    file_path: `${prev.orderId}/${uploadDocType}/${file.name}`,
    file_category: uploadDocType,
  }));
  const updatedOrderFiles = [...prev.orderFiles, ...newFiles];
  const updatedDocuments = [...new Set([
    ...prev.documents,
    uploadDocType,
  ])];
  return { ...prev, orderFiles: updatedOrderFiles, documents: updatedDocuments };
});
```

**File 2: `src/pages/EditOrder.tsx` (line ~2672, before `navigateBack()`)**

Import and call cache invalidation so Reports gets fresh file data:

```typescript
// Add to imports:
import { invalidateOrderFilesCacheForOrder } from "@/hooks/useReportsDateWindowAdapter";

// Before navigateBack() at line 2672:
invalidateOrderFilesCacheForOrder(id);
```

This is a single call site because all file changes (uploads and deletes) are committed inside `performSave` before `navigateBack()` is called. There are no instant/standalone delete operations outside the save flow.

---

### Summary
- 2 files modified
- Reports.tsx: optimistic state update after upload (instant visual feedback in dialog)
- EditOrder.tsx: 1 import + 1 line before navigation (cache cleared so grid shows correct state on return)
- No new queries, subscriptions, or performance impact

