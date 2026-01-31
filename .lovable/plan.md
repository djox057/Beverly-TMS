

# Plan: Bulk Import Excel for Multiple Drivers

## Overview

Create a new dialog component that allows importing an Excel file containing 200+ sheets (one per driver). Each sheet name follows the format `"(truck_number) (driver_full_name)"` (e.g., `"134 Sherik Williams"`, `"363 Roderick Sonnier"`). The feature will:

1. Parse all sheet names from the uploaded Excel file
2. Match sheet names to existing drivers in the database by truck number AND driver name
3. Show a preview of matches (matched, unmatched, ambiguous)
4. Allow bulk import of expenses/cash advances for all matched drivers at once

---

## How Matching Works

### Sheet Name Format
```
"134 Sherik Williams" → Truck: 134, Name: Sherik Williams
"363 Roderick Sonnier" → Truck: 363, Name: Roderick Sonnier
```

### Matching Algorithm
For each sheet name:
1. **Parse**: Extract truck number (first word) and driver name (remaining words)
2. **Find Driver**: Query drivers where:
   - `truck_info.truck_number` matches extracted truck number
   - Driver `name` (or `first_name + last_name`) fuzzy matches extracted name
3. **Categorize Result**:
   - **Matched**: Exactly one driver found with matching truck + name
   - **Unmatched**: No driver found with that truck number
   - **Ambiguous**: Multiple drivers found (e.g., same truck, similar names)

### Example Matching Flow
```text
Excel Sheet: "134 Sherik Williams"
                  ↓
Parse → Truck: "134", Name: "Sherik Williams"
                  ↓
Query → Find driver with truck_number = "134"
                  ↓
Compare → Driver.name vs "Sherik Williams" (fuzzy match)
                  ↓
Result → Matched to driver ID: abc123
```

---

## UI Flow

### Step 1: Upload File
- Button on Stuff page header: "Bulk Import"
- Opens dialog with file upload dropzone
- Accepts `.xlsx` files only

### Step 2: Processing & Preview
After file upload:
```text
┌──────────────────────────────────────────────────────────┐
│ Bulk Import Results                                       │
├──────────────────────────────────────────────────────────┤
│ ✅ Matched: 185 sheets                                    │
│ ❌ Unmatched: 12 sheets                                   │
│ ⚠️ Ambiguous: 3 sheets                                    │
├──────────────────────────────────────────────────────────┤
│ Sheet Name              │ Status    │ Driver          │  │
│ 134 Sherik Williams     │ ✅ Matched │ Sherik Williams │  │
│ 363 Roderick Sonnier    │ ✅ Matched │ Roderick Sonnier│  │
│ 999 John Doe            │ ❌ No Match│ -               │  │
│ 134 Williams            │ ⚠️ Ambig. │ 2 drivers found │  │
└──────────────────────────────────────────────────────────┘
```

### Step 3: Import
- "Import All Matched" button
- Progress indicator showing: "Importing 45/185..."
- Summary after completion: "Successfully imported 185 drivers, 3,420 expenses, 892 cash advances"

---

## Technical Implementation

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/BulkImportDriverExcelDialog.tsx` | Main dialog component with all UI and logic |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Stuff.tsx` | Add "Bulk Import" button and dialog trigger |

---

## Component Structure

### BulkImportDriverExcelDialog.tsx

**State Management**:
```typescript
interface SheetMatch {
  sheetName: string;           // Original sheet name from Excel
  truckNumber: string;         // Parsed truck number
  driverNameFromSheet: string; // Parsed driver name
  status: 'matched' | 'unmatched' | 'ambiguous';
  matchedDriver?: {            // Matched driver details
    id: string;
    name: string;
    truckNumber: string;
  };
  ambiguousDrivers?: Array<{   // Multiple matches
    id: string;
    name: string;
  }>;
  parsedData?: ParsedData;     // Reuse existing parsing logic
}
```

**Key Functions**:

1. `parseSheetName(name: string)` - Extract truck number and driver name
2. `matchSheetToDriver(sheetName, drivers)` - Find matching driver
3. `parseAllSheets(workbook)` - Iterate all sheets and parse each one
4. `importAllMatched(matches)` - Bulk insert for all matched sheets

### Matching Logic

```typescript
function parseSheetName(sheetName: string): { truckNumber: string; driverName: string } | null {
  const match = sheetName.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  return {
    truckNumber: match[1],
    driverName: match[2].trim()
  };
}

function matchSheetToDriver(
  parsed: { truckNumber: string; driverName: string },
  drivers: Driver[]
): SheetMatch {
  // Find drivers with matching truck number
  const byTruck = drivers.filter(d => 
    d.truck_info?.truck_number === parsed.truckNumber
  );
  
  if (byTruck.length === 0) {
    return { status: 'unmatched' };
  }
  
  // Fuzzy name matching - normalize and compare
  const normalized = (name: string) => 
    name.toLowerCase().replace(/[^a-z]/g, '');
  
  const targetName = normalized(parsed.driverName);
  
  const matches = byTruck.filter(d => {
    const driverName = d.name || `${d.first_name} ${d.last_name}`;
    return normalized(driverName) === targetName;
  });
  
  if (matches.length === 1) {
    return { status: 'matched', matchedDriver: matches[0] };
  } else if (matches.length > 1) {
    return { status: 'ambiguous', ambiguousDrivers: matches };
  }
  
  // Fallback: partial match on truck number alone
  if (byTruck.length === 1) {
    return { status: 'matched', matchedDriver: byTruck[0] };
  }
  
  return { status: 'unmatched' };
}
```

### Reusing Existing Parsing Logic

The existing `parseExcelFile()` function from `ImportDriverExcelDialog.tsx` will be reused:
- Extract deal info (weekly_payment, weeks_count, agreement_start_date)
- Parse expenses table
- Separate cash advances from regular expenses

### Import Process

For performance with 200+ sheets:
1. Parse all sheets first (CPU-bound, ~2-3 seconds)
2. Batch database inserts (100 expenses per batch)
3. Show progress indicator
4. Use `yieldToMain()` between batches to keep UI responsive

---

## UI Changes to Stuff.tsx

Add a "Bulk Import" button in the header section:

```tsx
<div className="flex items-center gap-2">
  <Button 
    variant="outline" 
    onClick={() => setShowBulkImportDialog(true)}
  >
    <FileSpreadsheet className="h-4 w-4 mr-2" />
    Bulk Import
  </Button>
</div>
```

---

## Error Handling

- **Malformed sheet names**: Skip sheets that don't match `"(number) (name)"` format
- **Parse errors**: Log and skip individual sheets, continue with others
- **Database errors**: Rollback all inserts for that driver, report in summary
- **Duplicates**: Option to skip or overwrite existing expenses (based on explanation + date)

---

## Summary

This feature enables importing hundreds of driver expense sheets in one operation:

1. Upload single Excel file with 200+ sheets
2. Automatic matching based on sheet name format `"(truck) (driver name)"`
3. Preview showing matched/unmatched/ambiguous results
4. One-click bulk import for all matched drivers
5. Detailed summary of imported data

