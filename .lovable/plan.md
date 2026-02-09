

# Google Sheets Backup Sync

## Overview

Create a scheduled sync system that exports your app's order data to two Google Sheets:
1. **Trips Sheet** -- mirrors the /orders (Trips) page, with one tab per company, color-coded rows
2. **Reports Sheet** -- condensed view with: Truck#, Driver, Home, Dispatch Name, Pickup City/State, Pickup DateTime, Delivery City/State, Delivery DateTime, Note

A cron job runs every 5 minutes, fetching all current orders and writing them to Google Sheets via the Sheets API v4.

## Step 1: Google Cloud Setup (You Do This)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or use an existing one)
2. Enable the **Google Sheets API** (APIs & Services > Library > search "Google Sheets API" > Enable)
3. Create a **Service Account** (APIs & Services > Credentials > Create Credentials > Service Account)
4. Generate a JSON key for the service account (click the service account > Keys tab > Add Key > JSON)
5. Create two Google Sheets files:
   - One named "Trips Backup"
   - One named "Reports Backup"
6. Share both sheets with the service account email (it looks like `name@project-id.iam.gserviceaccount.com`) with **Editor** access
7. Copy the spreadsheet IDs from each sheet's URL (the long string between `/d/` and `/edit`)

After this, you'll provide me with:
- The service account JSON key (stored as a secret)
- The two spreadsheet IDs (stored as secrets)

## Step 2: Store Secrets

Three secrets will be added to Supabase:
- `GOOGLE_SERVICE_ACCOUNT_KEY` -- the full JSON key file contents
- `GOOGLE_SHEETS_TRIPS_ID` -- spreadsheet ID for Trips backup
- `GOOGLE_SHEETS_REPORTS_ID` -- spreadsheet ID for Reports backup

## Step 3: Create Edge Function

A new edge function `sync-google-sheets` will:

1. Authenticate with Google Sheets API using the service account JWT (using `jose` library for JWT signing -- no googleapis dependency needed)
2. Fetch all unlocked orders from the database with relations (trucks, drivers, companies, brokers, pickup_drops)
3. For **Trips sheet**:
   - Group orders by company name
   - Create/update one tab per company
   - Write columns: Truck#, Driver, Load#, Pickup Date, Pickup City, Delivery Date, Delivery City, Miles, Broker Name, Broker Load#, Driver Pay, Freight Amt
   - Apply row colors matching the Trips page logic:
     - Purple: recovery loads
     - Red tint: reduced pay (total freight < base freight)
     - Green tint: additional pay (total freight > base freight)
     - Orange tint: canceled or has date change notes
     - White/alternating: normal
4. For **Reports sheet**:
   - Write columns: Truck#, Driver, Home, Dispatch Name, Pickup City State, Pickup DateTime, Delivery City State, Delivery DateTime, Note
   - Group by dispatcher, one tab per dispatcher or single sheet sorted

## Step 4: Schedule via pg_cron

A cron job calls the edge function every 5 minutes using `pg_net`.

## Technical Details

### Edge Function Structure (`supabase/functions/sync-google-sheets/index.ts`)

```text
+---------------------------+
| 1. Google Auth (JWT/jose) |
| Sign JWT with service key |
| Exchange for access token |
+---------------------------+
          |
          v
+---------------------------+
| 2. Fetch Orders           |
| All unlocked orders with  |
| trucks, drivers, brokers, |
| companies, pickup_drops   |
+---------------------------+
          |
          v
+---------------------------+     +---------------------------+
| 3a. Build Trips Data      |     | 3b. Build Reports Data    |
| Group by company          |     | Columns: Truck#, Driver,  |
| Match Trips page colors   |     | Home, Dispatch, Pickup,   |
| One sheet tab per company |     | Delivery, Note            |
+---------------------------+     +---------------------------+
          |                                  |
          v                                  v
+---------------------------+     +---------------------------+
| 4a. Write to Trips Sheet  |     | 4b. Write to Reports Sheet|
| Clear + write all tabs    |     | Clear + write all data    |
| Apply cell formatting     |     | Apply cell formatting     |
+---------------------------+     +---------------------------+
```

### Color Mapping (Trips)

The edge function will replicate this logic from `Trips.tsx` (lines 4922-4948):

| Condition | Color (RGB for Sheets) |
|---|---|
| Recovery load | Purple: `{red: 0.85, green: 0.75, blue: 0.95}` |
| Reduced pay (totalFreight < freightAmount) | Light red: `{red: 0.95, green: 0.8, blue: 0.8}` |
| Additional pay (totalFreight > freightAmount) | Light green: `{red: 0.8, green: 0.95, blue: 0.8}` |
| Canceled or date change notes | Light orange: `{red: 0.95, green: 0.88, blue: 0.8}` |
| Normal even row | Light gray: `{red: 0.96, green: 0.96, blue: 0.96}` |
| Normal odd row | White: `{red: 1, green: 1, blue: 1}` |

### Google Sheets API Calls

Uses raw fetch with OAuth2 tokens (no heavy `googleapis` package):
- `POST /v4/spreadsheets/{id}:batchUpdate` -- manage sheets (tabs), apply formatting
- `PUT /v4/spreadsheets/{id}/values/{range}` -- write cell values
- `POST /v4/spreadsheets/{id}/values:batchUpdate` -- bulk write multiple ranges

### Files Created/Modified

| File | Action |
|---|---|
| `supabase/functions/sync-google-sheets/index.ts` | New -- main sync logic |
| `supabase/config.toml` | Add `[functions.sync-google-sheets]` with `verify_jwt = false` |

### Cron Setup (SQL -- run manually)

A `pg_cron` + `pg_net` schedule calling the function every 5 minutes, authenticated with the `CRON_SECRET`.

