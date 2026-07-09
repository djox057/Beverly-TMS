## Goal
Add a button on each truck in the Live Fleet Map that generates a Samsara **public Live Share link** (the same feature shown in your screenshot) — a URL anyone can open without a Samsara login, with an expiration date and an optional destination/ETA.

## How Samsara exposes this
Samsara's REST API endpoint:

```
POST https://api.samsara.com/live-shares
Authorization: Bearer <SAMSARA_API_KEY_n>
{
  "name": "TRUCK 4677",
  "vehicleId": "<samsara vehicle id>",
  "endsAtTime": "2026-07-16T22:00:00Z"
}
```

Response contains `liveSharingUrl` — the public link.

Each API key is scoped to one Samsara org, so the request must be sent using the **same key** the truck was matched with. We already track `apiKeyIndex` per vehicle in `samsara-locations`.

## Implementation

### 1. New edge function — `supabase/functions/samsara-live-share/index.ts`
- Auth: require a logged-in Supabase user (same pattern as `samsara-inspect`); reject anon.
- Input (JSON body): `{ truck_id: string, truck_number: string, expires_in_hours?: number }` (default 168h = 7 days, max 90 days).
- Look up the truck's Samsara vehicle: fetch `/fleet/vehicles` on all 7 keys and match by truck number using the existing matching logic. Reuse the matcher from `samsara-locations` (copy the function into this file — edge functions don't share modules easily).
- Call `POST https://api.samsara.com/live-shares` with the matched key.
- Return `{ url, expiresAt, keyLabel }` to the client. Log failures with status + body.

### 2. Frontend hook — `src/hooks/useSamsaraLiveShare.ts`
`useMutation` wrapper that invokes the edge function and returns the URL.

### 3. UI — `src/pages/TrucksMap.tsx` and `src/components/DispatcherFleetMapDialog.tsx`
Add a small **"Share Live Location"** button (Share2 icon from lucide) in the map popup and next to each sidebar row.

Click flow:
1. Open a small dialog with an expiration dropdown (24 h / 3 days / 7 days / 14 days / 30 days — default 7 days).
2. On confirm, call the edge function, then:
   - Copy the returned URL to clipboard.
   - Show a toast: `Live share link copied — expires <date>`.
   - Display the URL in the dialog with a copy button and an "Open" button so the user can paste it into email/SMS themselves.

No link is persisted in our DB — each click creates a new link via Samsara. (Samsara stores/lists them in their dashboard.)

### 4. Role gating
Restrict button visibility to `admin`, `manager`, `accounting`, `dispatch`, and `afterhours` roles (i.e. everyone who currently sees the fleet map).

## Notes / non-goals
- No "destination + ETA" toggle in v1 — just plain live location share. We can add it later by passing `destination` coordinates to the Samsara endpoint.
- No revocation UI in v1 — links expire on their own; deletion is done in the Samsara dashboard if needed.
- No DB migration needed.

## Open question
OK with the expiration presets **24h / 3d / 7d / 14d / 30d, default 7 days**, or do you want a different set (or a custom date/time picker like Samsara's own dialog)?