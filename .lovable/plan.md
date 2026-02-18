

## Fix: Order File Uploads Not Reflecting in Reports Until Refresh

### Problem
After uploading BOL/POD files on the Reports page, cells don't turn dark green until a manual refresh. Two issues:
1. The upload handler invalidates `["reports"]` query key, but the adapter uses `["adapter-order-files"]` -- so the invalidation does nothing.
2. The adapter has a module-level cache (`orderFilesCacheByOrderId`) that also needs clearing for the specific order.

### Changes

**File 1: `src/hooks/useReportsDateWindowAdapter.ts` (line 58)**
Export the existing `invalidateOrderFilesCacheForOrder` function:
```typescript
// Before:
const invalidateOrderFilesCacheForOrder = (orderId: string | null | undefined) => {

// After:
export const invalidateOrderFilesCacheForOrder = (orderId: string | null | undefined) => {
```

**File 2: `src/pages/Reports.tsx`**

Add to import (line 51):
```typescript
import { useReportsDateWindowAdapter, USE_DATE_WINDOW_LOADING, invalidateOrderFilesCacheForOrder } from "@/hooks/useReportsDateWindowAdapter";
```

Fix invalidation after upload (lines 923-924):
```typescript
// Before:
queryClient.invalidateQueries({ queryKey: ["reports"] });

// After:
invalidateOrderFilesCacheForOrder(zoomedLoad.orderId);
queryClient.invalidateQueries({ queryKey: ["adapter-order-files"], refetchType: "active" });
```

### Summary
2 files, 3 line changes. No circular dependency risk -- the exported function is a pure cache manipulation with no dependencies on Reports.tsx.
