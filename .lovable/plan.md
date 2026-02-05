
# Fix Border Alignment and Background Overflow

## Problems Identified

1. **Orange Background Overflow**: The orange header from the main Trips table is bleeding into the nested driver trips section
2. **Black Border Truncation**: The black column header border (`border-y-2 border-foreground`) doesn't extend all the way like the blue week summary border does

## Root Causes

### Orange Background Overflow
- The `TableCell` needs stronger background isolation from parent table styling
- Current `bg-background` may not fully override inherited styles

### Black Border Truncation  
- The container `<div className="border rounded-lg overflow-hidden bg-card">` (line 362) has `overflow-hidden` which clips the borders
- The column header row is INSIDE this container, so its borders get clipped at the rounded corners
- The blue week bar also uses `border-b` but appears to work because it's the first element

## Solution

### 1. Restructure the week card to prevent border clipping

Move the column header OUTSIDE the `overflow-hidden` container, or remove `overflow-hidden` and handle rounded corners differently:

```tsx
// Current structure (causes clipping):
<div className="border rounded-lg overflow-hidden bg-card">
  <div>Week summary bar (blue border)</div>
  <div>Column headers (black border - CLIPPED)</div>
  <div>Order rows...</div>
</div>

// Fixed structure:
<div className="border rounded-lg bg-card">
  <div>Week summary bar (blue border)</div>
  <div>Column headers (black border - NOT clipped)</div>
  <div>Order rows...</div>
</div>
```

### 2. Add stronger background isolation

Ensure the outer container has explicit background to prevent orange bleed:

```tsx
<TableCell colSpan={colSpan} className="p-0 border-l-4 border-l-yellow-500">
  <div className="bg-background py-2">
    {/* Content - explicit bg-background wrapper */}
  </div>
</TableCell>
```

### 3. Make borders consistent

Both week bar and column header should use same border approach:
- Week summary: `border-b-2 border-blue-500` (or similar)
- Column header: `border-y-2 border-foreground`

Both need `w-full` to ensure they span the container width.

## Files to Modify

**`src/components/NestedDriverTripsDropdown.tsx`**:

1. **Line 342**: Add explicit background wrapper inside TableCell
2. **Line 362**: Remove `overflow-hidden` from the week card container
3. **Line 432**: Ensure the column header row spans full width with proper border styling

## Visual Result

After changes:
- Orange header will NOT bleed into nested section (clean separation)
- Black column header border will extend full width (matching blue week bar)
- Both borders will have consistent thickness and visibility
- Rounded corners on week cards will still look correct without clipping content
