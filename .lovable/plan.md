

## Fix City Column Background Color Mismatch

**Root Cause**: The sticky City column uses `bg-background`, which is the page's base background color. However, the table lives inside a `Card` component, which uses `bg-card` -- a slightly lighter color in dark mode. This mismatch makes the City column appear darker than the rest of the table.

**Fix**: Change `bg-background` to `bg-card` on both the `TableHead` and `TableCell` for the City column. This ensures the sticky column matches the card's background exactly.

### Changes in `src/pages/BeverlyHeatmap.tsx`

1. **Line 352 (TableHead)**: Change `bg-background` to `bg-card`
2. **Line 365 (TableCell)**: Change `bg-background` to `bg-card`

