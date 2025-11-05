# Local Edge Functions Setup Guide (Cloud Database)

This guide explains how to run Supabase Edge Functions locally while connecting to your **cloud production database**.

## Restored Edge Functions

1. **check-delivery-etas** - Checks if deliveries are running late
2. **samsara-locations** - Fetches and saves truck locations from Samsara API
3. **geocode-address** - Geocodes addresses (already exists)
4. **calculate-route** - Calculates routes between coordinates (already exists)

## Scheduled Functions

Based on the analysis:
- **samsara-locations**: Should run every 5-10 minutes to keep truck locations fresh
- **check-delivery-etas**: Should run every 10-20 minutes to monitor delivery ETAs

## Step-by-Step Local Setup (Cloud Database)

### 1. Install Supabase CLI (if not already installed)

```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### 2. Skip Local Supabase - Use Cloud Database Instead

**You do NOT need to run `supabase start` for this setup.** Your edge functions will connect directly to the cloud database.

### 3. Get Your Cloud Service Role Key

You need to get your **Service Role Key** from the Supabase dashboard:

1. Go to: https://supabase.com/dashboard/project/wjkbtagwgjniilmgwutb/settings/api
2. Copy the **service_role** key (secret key - keep it safe!)

### 4. Set Environment Variables for Cloud Database

Create a `.env.local` file in your `supabase/functions` directory:

```bash
# Cloud Database Configuration
SUPABASE_URL=https://wjkbtagwgjniilmgwutb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_dashboard
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM

# Get these from Supabase Dashboard > Edge Function Secrets
SAMSARA_API_KEY_1=your_samsara_key_1
SAMSARA_API_KEY_2=your_samsara_key_2
```

**Important:** Replace `your_service_role_key_from_dashboard` with the actual service role key from your Supabase dashboard.

### 5. Serve Functions Locally (Connecting to Cloud Database)

Open separate terminal windows for each function:

**Terminal 1 - Geocode Address:**
```bash
supabase functions serve geocode-address --env-file supabase/functions/.env.local --no-verify-jwt
```

**Terminal 2 - Calculate Route:**
```bash
supabase functions serve calculate-route --env-file supabase/functions/.env.local --no-verify-jwt
```

**Terminal 3 - Samsara Locations:**
```bash
supabase functions serve samsara-locations --env-file supabase/functions/.env.local --no-verify-jwt
```

**Terminal 4 - Check Delivery ETAs:**
```bash
supabase functions serve check-delivery-etas --env-file supabase/functions/.env.local --no-verify-jwt
```

**Note:** Functions will connect to your **cloud database** at `https://wjkbtagwgjniilmgwutb.supabase.co` and write/read data there.

### 6. Test Functions Manually

```bash
# Test geocode-address (will cache results in cloud database)
curl -X POST http://127.0.0.1:54321/functions/v1/geocode-address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM" \
  -d '{"address": "1600 Amphitheatre Parkway, Mountain View, CA"}'

# Test samsara-locations (will fetch from Samsara and save to cloud database)
curl -X POST http://127.0.0.1:54321/functions/v1/samsara-locations \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"

# Test check-delivery-etas (will check cloud database for active orders)
curl -X POST http://127.0.0.1:54321/functions/v1/check-delivery-etas \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"
```

### 7. Set Up Scheduled Execution Locally

Create a Node.js script `local-scheduler.js` in your project root:

```javascript
const schedule = require('node-schedule');

const SUPABASE_URL = 'http://127.0.0.1:54321'; // Local edge functions
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM';

async function callFunction(functionName) {
  try {
    console.log(`[${new Date().toISOString()}] Calling ${functionName}...`);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] ${functionName} result:`, data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error calling ${functionName}:`, error);
  }
}

// Run samsara-locations every 5 minutes
schedule.scheduleJob('*/5 * * * *', () => {
  callFunction('samsara-locations');
});

// Run check-delivery-etas every 10 minutes
schedule.scheduleJob('*/10 * * * *', () => {
  callFunction('check-delivery-etas');
});

console.log('Local scheduler started!');
console.log('- samsara-locations: Every 5 minutes');
console.log('- check-delivery-etas: Every 10 minutes');

// Run once immediately on startup
callFunction('samsara-locations');
callFunction('check-delivery-etas');
```

Install the required package:
```bash
npm install node-schedule node-fetch@2
```

Run the scheduler:
```bash
node local-scheduler.js
```

### 8. View Cloud Database in Supabase Studio

While your functions run locally, you can view the cloud database data in real-time:

**Cloud Database Studio:** https://supabase.com/dashboard/project/wjkbtagwgjniilmgwutb/editor

Check these tables to verify functions are working:
- `truck_locations` - Updated by `samsara-locations`
- `geocoding_cache` - Updated by `geocode-address`
- `orders` - Read by `check-delivery-etas`

## Monitoring Logs

### View logs in terminal:
The logs will appear in the terminal where you ran `supabase functions serve`.

### View cloud function logs:
https://supabase.com/dashboard/project/wjkbtagwgjniilmgwutb/functions

## Production Deployment

When ready to deploy to production, these functions will be deployed automatically. Then set up cron jobs in production:

```sql
-- Connect to production database via Supabase Studio SQL Editor

SELECT cron.schedule(
  'samsara-locations-prod',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/samsara-locations',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'check-delivery-etas-prod',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/check-delivery-etas',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

## Troubleshooting

### Functions not responding:
- Make sure all dependent functions are running (e.g., check-delivery-etas needs geocode-address and calculate-route)
- Check that environment variables in `.env.local` are set correctly
- Verify service role key is correct from Supabase dashboard
- Check terminal output for errors

### Scheduler not working:
- Make sure all 4 functions are served locally before running scheduler
- Check that Node.js and node-schedule are installed
- Verify functions respond to manual curl tests first

### Database connection issues:
- Ensure SUPABASE_URL points to cloud: `https://wjkbtagwgjniilmgwutb.supabase.co`
- Verify SUPABASE_SERVICE_ROLE_KEY is from cloud dashboard
- Check cloud database is accessible: https://supabase.com/dashboard/project/wjkbtagwgjniilmgwutb

### Data not appearing in cloud:
- Check function logs in terminal for errors
- Verify RLS policies allow function to write data
- Check cloud database tables directly in Supabase Studio
- Ensure Samsara API keys are valid
