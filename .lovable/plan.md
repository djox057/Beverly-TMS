## Problem

In the gold-outline highlight logic for `Reports.tsx`, when a same-order pickup and delivery overlap horizontally with **different widths** (e.g. delivery is one of two half-width stops, pickup is a single full-width stop), the current code splits the wider slot into multiple segments to remove the border only over the overlap range. That makes a single pickup cell look visually split with a vertical seam in its gold outline — even though there is only one pickup in that cell.

Reference (uploaded screenshot): "Marietta, GA 14:00" pickup spans the whole bottom of the cell, but the gold outline around it shows a vertical seam in the middle because the matched delivery above only covers the right half.

Expected:
- Pickup with a single stop → one continuous gold rectangle, no internal seams.
- Doubled middle line (where delivery bottom meets pickup top) still hidden.

## Fix

In `src/pages/Reports.tsx` inside the gold overlay block (around lines 2820–2895), change the strategy from "split the wider slot into segments" to "remove the border on the fully-covered (smaller-width) side":

For each pair of matched same-order delivery slot D and pickup slot P that overlap horizontally:

- Compute overlap range `[oLeft, oRight]` and overlap width.
- If overlap width >= D's width − epsilon → D is fully covered by P:
  - Drop D's `borderBottom` entirely (single rect, no segmentation).
- If overlap width >= P's width − epsilon → P is fully covered by D:
  - Drop P's `borderTop` entirely (single rect, no segmentation).
- If neither fully covers the other (true partial overlap with mismatched extents) → keep both borders intact (accept a short doubled segment) rather than introduce a visible seam in the larger slot.

This removes the segmentation pass entirely. Each matched pickup and delivery slot renders as exactly one gold rectangle. The doubled-line cleanup only happens on the slot that is fully contained — which by definition has no border to "split" because the entire side is covered.

## Result

- Single full-width pickup with a half-width same-order delivery above:
  - Delivery loses its bottom border (matches existing visual that pickup continues below it).
  - Pickup keeps its full continuous top border with no internal seam.
- Two stops pickup paired with two stops delivery, same width: existing `pairedDelivery` combined rectangle path still handles it (unchanged).
- Equal full-width pickup + delivery same-order: paired-rect path also handles it (unchanged).

## Files

- `src/pages/Reports.tsx` — replace the per-segment loop in both "Standalone matched delivery slots" and "Standalone matched pickup slots" blocks with the single-rect + full-coverage check described above.

No business logic, data, or styling token changes.
