## Fix

In `src/pages/Reports.tsx` gold overlay rects (around lines 2842–2895), when a delivery or pickup slot is `fullyCovered` (border on the inner side already dropped), also shrink its height so the side (left/right) borders don't extend past the seam between the top and bottom halves and stick out into the other slot.

- Matched delivery slot, `fullyCovered === true`: keep `top: -3`, change `height: 38` → `height: 35` so the side borders stop exactly at the seam (y = 32) instead of overhanging into the pickup area.
- Matched pickup slot, `fullyCovered === true`: change `top: 29` → `top: 32` and keep `height: 35` so the side borders start at the seam instead of overlapping the delivery area above.

No change for non-`fullyCovered` rects (they keep full borders and current dimensions). No change to the paired combined-rect path. No business logic changes.
