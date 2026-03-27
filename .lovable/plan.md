

# Rename User zoey@bfprime.net → lexy@bfprime.net

## Summary
Rename the dispatch user's email from `zoey@bfprime.net` to `lexy@bfprime.net` and update their display name from "Anja Delic-Zoey" to "Anja Delic-Lexy" across auth, profile, and all referencing data.

**User ID:** `68370b07-5a4b-4245-9e69-162f0b691a91`

## What gets updated

| Location | Field | Old → New |
|---|---|---|
| `auth.users` | email | zoey@ → lexy@ |
| `profiles` | email | zoey@ → lexy@ |
| `profiles` | full_name | Anja Delic-Zoey → Anja Delic-Lexy |
| `orders` (55 rows) | booked_by | Anja Delic-Zoey → Anja Delic-Lexy |
| `drivers` (4 drivers) | dispatcher_id | No change needed (references UUID) |

All other tables (assignment_history, weekly_plans, dispatcher_notes, etc.) reference this user by UUID, so they require **no updates** — they'll automatically resolve to the new name/email via joins.

## Steps

1. **Update `auth.users` email** — Call Supabase Admin API via edge function to change the email on the auth account.
2. **Update `profiles` table** — Set `email = 'lexy@bfprime.net'` and `full_name = 'Anja Delic-Lexy'` for user_id `68370b07-...`.
3. **Update `orders.booked_by`** — Update 55 orders where `booked_by = 'Anja Delic-Zoey'` to `'Anja Delic-Lexy'`.

No code changes needed — this is a data-only operation.

## Technical Details
- Auth email update uses the Supabase Admin API (`PUT /auth/v1/admin/users/{id}`)
- Profile and orders updates use direct SQL via the insert tool
- The user's password, role (dispatch), office (KRAGUJEVAC), and all UUID-based references remain unchanged

