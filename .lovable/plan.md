

## Use Internal Load Number Suffix for Invoice Company Grouping

**Problem**: Invoicing currently uses `order.companyName` (driver's current company) for folder grouping, invoice suffix, and XLSX data. If a driver switches companies, old loads get invoiced under the wrong entity. The internal load number suffix (e.g., `-BF`, `-BFP`) is frozen at creation and is the reliable source of truth.

### Changes

**1. `src/utils/formatInternalLoadNumber.ts`** — Add reverse mapping function:

```typescript
export function getCompanyNameFromSuffix(internalLoadNumber: string | null | undefined): string | null {
  if (!internalLoadNumber) return null;
  const parts = internalLoadNumber.split("-");
  if (parts.length < 2) return null;
  const suffix = parts[parts.length - 1].toUpperCase();
  const map: Record<string, string> = {
    "BF": "Beverly Freight Inc",
    "BFP": "BF Prime LLC",
    "BFU": "BF Prime United LLC",
    "UE": "United Enterprise Solutions Inc",
    "BG": "BG Prime Inc",
    "AP": "AP Silver Trans LLC",
  };
  return map[suffix] || null;
}
```

**2. `src/utils/invoiceGenerator.ts`** — Replace `order.companyName` with suffix-derived company in three places:

- **Line ~204-206 (folder grouping)**: Derive company from `getCompanyNameFromSuffix(order.internalLoadNumber)`, fallback to `order.companyName`
- **Line ~240 (PDF header)**: Use `order.bookedByCompanyName || derivedCompany` instead of `order.bookedByCompanyName || companyName`
- **Line ~537-540 (XLSX data)**: Use derived company for the `Invoice#` formatting

This ensures the frozen suffix drives all company decisions in invoicing, not the driver's current company assignment.

