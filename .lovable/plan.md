## Goal
Fix the public Samsara Live Share generation for truck 2934 and similar trucks.

## What I found
- The current edge function is reaching Samsara, but Samsara returns:
  - `400`: `"type" is missing from body`
- Samsara’s current `POST /live-shares` API requires:
  - `type: "assetsLocation"`
  - `expiresAtTime` (not `endsAtTime`)
  - `assetsLocationLinkConfig` containing the asset/vehicle id
- The app currently sends the older/wrong shape:
  - `endsAtTime`
  - `assets: [{ vehicleId }]`

## Plan
1. Update `supabase/functions/samsara-live-share/index.ts`
   - Send Samsara the current required payload shape:
     - `type: "assetsLocation"`
     - `name`
     - `expiresAtTime`
     - `assetsLocationLinkConfig: { assetId: <matched vehicle id> }`
   - Keep the existing truck matching across all configured Samsara keys.
   - If Samsara still rejects `assetId` for a vehicle, add a fallback request using `vehicleId` inside the config so we can support either response/schema variation.

2. Improve the frontend error display in `src/components/SamsaraLiveShareDialog.tsx`
   - Instead of showing only `Edge Function returned a non-2xx status code`, read the edge function response body when available.
   - Show the Samsara message directly in the toast, for example: `"type" is missing from body` or permission errors.

3. Verify with truck `2934`
   - Deploy/test the edge function.
   - Confirm it returns a URL shaped like:
     - `https://cloud.samsara.com/o/.../fleet/viewer/...`
   - Confirm the UI copies/displays the link.