# Recovery load emails: match last delivery date to pickup date

When a load is marked Recovery (`retrieval = true`), dispatchers currently get an email listing any of their trucks whose last delivery is within 150 miles of the pickup, regardless of when that truck became empty. This change makes the availability date matter.

## What changes

1. **Date filter per truck** — a truck is only included in the email when its driver's last delivery date (Chicago calendar day) is the same day as the recovery load's pickup date. Trucks that deliver earlier or later are dropped. If no truck matches, no email is sent (the app shows "No trucks nearby" as it does today).
2. **Header note when the pickup is not today** — the email subject and the header line say which day the load is for:
   - pickup is today: `Recovery load #123 - 2 of your trucks nearby` (unchanged)
   - pickup is tomorrow: header shows `FOR TOMORROW - Fri 08/21` 
   - pickup is later: header shows `FOR 08/24 (Mon)`
   The same tag is prefixed to the subject so it is visible in the inbox.
3. The truck table keeps a **Last delivery** column, now showing the date alongside the city, so the recipient can see the match.

## Technical notes

Only `supabase/functions/send-recovery-load-alert/index.ts` changes.

- Fetch the recovery load's `pickup_datetime` (currently not selected) and derive its Chicago calendar day.
- The per-truck last order query already returns each driver's flagged last order; add `delivery_datetime` to that select, and also pull `datetime` on the delivery `pickup_drops` rows as a fallback (use the highest-sequence delivery stop when `orders.delivery_datetime` is null).
- Compare Chicago `YYYY-MM-DD` strings (via `Intl.DateTimeFormat` with `timeZone: "America/Chicago"`), consistent with the rest of the project's date handling.
- Skip a truck when either date is missing or the days differ; this filter runs after the 150-mile radius check so the geocode budget is unaffected.
- Compute the day tag by diffing the pickup day against today in Chicago (0 = today, 1 = tomorrow, else the dated form) and inject it into both `subject` and the `loadHeader` block.
