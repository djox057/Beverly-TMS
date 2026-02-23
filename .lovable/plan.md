

## Fix City Column Background

The City column currently uses `bg-muted/50` which creates a visible difference from the other columns. The other columns (Total, Avg Freight, Avg Miles, RPM) have no explicit background set, so they inherit the default transparent/card background.

### Changes

**File: `src/pages/BeverlyHeatmap.tsx`**

- Remove `bg-muted/50` from the City `TableHead` and `TableCell` elements
- Replace with `bg-background` (or simply the card background) so the sticky column blends seamlessly with the rest of the table while still functioning as a sticky column (needs a background to avoid content showing through when scrolling)

Specifically:
- `TableHead`: change `bg-muted/50` to `bg-background`
- `TableCell`: change `bg-muted/50` to `bg-background`

