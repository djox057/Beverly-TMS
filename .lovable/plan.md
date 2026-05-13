I’ll make a focused visual-only fix in `src/pages/Reports.tsx`:

1. **Force the golden outline above the red today border**
   - Render the golden highlight overlay after the actual stop cells instead of before them, so it wins the stacking order.
   - Keep a very high `zIndex` on the gold overlay.

2. **Keep borders visible when pickup and delivery are connected**
   - Stop removing the top/bottom border widths for connected pickup/drop slots.
   - Instead, prevent the doubled middle line by slightly aligning/overlapping the two highlight rectangles while preserving a visible top and bottom edge.

3. **Scope the outline only to matched stops**
   - Keep the per-slot calculation based on the exact rendered pickup/drop stop order.
   - Do not create a widened combined overlay that spans unrelated neighboring stops.

4. **Remove empty gaps between multiple pickup/drop stops**
   - Replace the `space-x-0.5` flex gap with zero-gap layout.
   - Keep each multi-stop cell at exact proportional widths so the green stop boxes touch cleanly without blank space.

No data/business logic changes; only Reports visual rendering.