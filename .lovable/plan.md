# Samsara key refresh + insured / not insured attribute

## Goal
Replace the Samsara API keys with the newly provided set, group them into "Insured" and "Not Insured" account groups, and record for each truck which group its latest Samsara record came from. Show that status in Reports truck info and in the admin Samsara inspect tool.

## Key sets
Not Insured group (4 accounts): dispatch@bfprime.net, zack@beverlyfreight.net, beverlyrepair@gmail.com, luka@bgprime.net

Insured group (4 accounts with keys): accounting@bfprime.net, Dispatch@apsilvertrans.net, Dispatch@unitedenterprisesolutions.net, dispatch@bgprime.net
(dispatch@beverlyfreight.net has no key in the list, so it is left as a placeholder slot with no secret.)

All existing SAMSARA_API_KEY_1..7 secrets are replaced by this 8-key set. The keys are stored as Supabase secrets only — never in code or the database.

## Behavior
- On every Samsara location sync, each vehicle already carries the index of the API key it came from. The key index maps to an account label and to insured / not insured.
- For each truck, the freshest matching vehicle wins (existing logic). The winning key's group is written to the truck as its insurance source status, along with which account it came from and when it was last seen.
- If a truck is not found by any key, its stored status is left untouched (last known value stays visible).

## Where it shows
- Reports: a small badge next to the truck number in the truck info area reading INSURED (green) or NOT INSURED (amber), with the Samsara account and last-seen time in the tooltip.
- Samsara inspect (admin): each key block already lists its account label; it additionally shows the group (Insured / Not Insured) so an admin can confirm which side a truck answered from.

## Technical notes
- Secrets: replace SAMSARA_API_KEY_1..7 with SAMSARA_API_KEY_1..8 in the new order (1-4 not insured, 5-8 insured). Remove key 7 if it becomes unused.
- Shared mapping table (key index -> account label + insured flag) duplicated in the edge functions that read the keys: `samsara-locations`, `samsara-inspect`, `samsara-live-share`, `get-truck-distances-batch` (the last two only need the label/order update).
- Migration on `public.trucks`: add `samsara_insured boolean`, `samsara_account text`, `samsara_insured_updated_at timestamptz` (all nullable, no default). No RLS change needed; existing trucks policies cover reads. Dispatcher update triggers are not touched — the columns are written by the sync using the service role.
- `samsara-locations` writes those three fields in its existing batched truck update path, and includes `insured` / `account` in the returned locations payload so the UI can use it without an extra query.
- `useSamsaraLocations` type gains the two fields; Reports reads the persisted truck columns (already loaded with truck data) for the badge so it renders even when locations are stale.
- Badge colors use existing semantic tokens, no hardcoded color utilities.
