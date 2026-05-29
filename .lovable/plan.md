## Problem

PDF shows pickup `6/1/26` (US MM/DD/YY = June 1, 2026). Today is May 29, 2026, so June 1 is well within the ±15‑day window we already enforce. The AI still extracted it as **Jan 6, 2026** — interpreting the date as DD/MM (European) instead of MM/DD.

The current post‑validation in `supabase/functions/extract-order-fields/index.ts` only tries adjacent **years** when a date falls outside the ±15‑day window. Jan 6 2026 is outside the window in every year (2025/2026/2027), so the date currently gets cleared instead of being recovered as June 1.

## Fix

Update only `supabase/functions/extract-order-fields/index.ts`:

1. **Strengthen the prompt** — make the US `MM/DD/YYYY` rule even more explicit and add an instruction: "If your MM/DD interpretation produces a date outside the ±15‑day window, try swapping day and month before discarding."

2. **Smarter post‑validation (`clampDate`)** — when the parsed date is outside the ±15‑day window:
   - First try adjacent years (current behavior).
   - **New:** then try swapping day↔month (and adjacent years of that swap) to recover DD/MM-formatted dates from European brokers. Only accept if the swapped date is valid (e.g. day ≤ 12 for month) and lands inside the window.
   - Only clear the date if nothing fits.

3. Keep the ±15‑day window logic and everything else unchanged.

No DB changes, no other files touched.

### Expected result for the attached PDF
- Pickup `6/1/26` → MM/DD → June 1 2026 → inside window → kept as `2026-06-01`.
- A European-formatted `01/06/26` (June 1) → MM/DD says Jan 6 (outside window) → swap → June 1 (inside window) → kept as `2026-06-01`.