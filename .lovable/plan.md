

## Fix: Exclude Canceled Loads from Duplicate Load Warning

### Problem
The duplicate load check queries orders with `.not("status", "eq", "canceled")` but the database has a separate `canceled` boolean column. Orders marked as canceled via this boolean field still trigger the duplicate warning.

### Change

**`src/pages/NewOrder.tsx` (~line 1407)**

Add a filter for the `canceled` boolean column in the duplicate check query:

```typescript
// Current
.eq("broker_load_number", brokerLoadNumber.trim())
.not("status", "eq", "canceled");

// Updated
.eq("broker_load_number", brokerLoadNumber.trim())
.not("status", "eq", "canceled")
.eq("canceled", false);
```

This ensures orders where the `canceled` boolean is `true` are excluded from duplicate detection, regardless of their `status` text value.

One line added, one file changed.

