## Plan

Fix the nearby-trucks filter so changing a dispatcher date carousel does not temporarily hide matched trucks.

### What I’ll change
1. Keep the last valid nearby-truck matches separate from transient report reloads.
2. Only replace `proximityMatchedTrucks` when the current report data has enough truck/order data to calculate matches reliably.
3. During date-carousel background loading, continue showing the existing nearby-truck list and sticky distance notes instead of recomputing to an empty list.
4. Still recompute normally when the searched address changes or when switching offices with loaded truck data.

### Technical approach
- Update `src/pages/Reports.tsx` around the proximity search effect.
- Add a small helper/check before applying a new match map: if grouped report data is empty or all computed matches are empty during background/date reload, skip overwriting the previous matches.
- Use the existing `isFetchingBackground` signal and current `proximityCoords` state; no database or backend changes.