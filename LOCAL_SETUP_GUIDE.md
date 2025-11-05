# Local Supabase Edge Functions Setup Guide

This guide explains how to set up and run Supabase Edge Functions locally with scheduled execution.

## Restored Edge Functions

1. **check-delivery-etas** - Checks if deliveries are running late
2. **samsara-locations** - Fetches and saves truck locations from Samsara API
3. **geocode-address** - Geocodes addresses (already exists)
4. **calculate-route** - Calculates routes between coordinates (already exists)

## Scheduled Functions

Based on the analysis:
- **samsara-locations**: Should run every 5-10 minutes to keep truck locations fresh
- **check-delivery-etas**: Should run every 10-20 minutes to monitor delivery ETAs

## Step-by-Step Local Setup

### 1. Install Supabase CLI (if not already installed)

```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### 2. Start Local Supabase

```bash
supabase start
```

This will give you the endpoints you shared:
- API URL: http://127.0.0.1:54321
- Database URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Studio URL: http://127.0.0.1:54323

### 3. Set Local Environment Variables

Create a `.env.local` file in your `supabase/functions` directory:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz
SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SAMSARA_API_KEY_1=your_samsara_key_1
SAMSARA_API_KEY_2=your_samsara_key_2
```

### 4. Serve Functions Locally

Open separate terminal windows for each function:

**Terminal 1 - Geocode Address:**
```bash
supabase functions serve geocode-address --env-file supabase/functions/.env.local
```

**Terminal 2 - Calculate Route:**
```bash
supabase functions serve calculate-route --env-file supabase/functions/.env.local
```

**Terminal 3 - Samsara Locations:**
```bash
supabase functions serve samsara-locations --env-file supabase/functions/.env.local
```

**Terminal 4 - Check Delivery ETAs:**
```bash
supabase functions serve check-delivery-etas --env-file supabase/functions/.env.local
```

### 5. Test Functions Manually

```bash
# Test geocode-address
curl -X POST http://127.0.0.1:54321/functions/v1/geocode-address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  -d '{"address": "123 Main St, New York, NY 10001"}'

# Test samsara-locations
curl -X POST http://127.0.0.1:54321/functions/v1/samsara-locations \
  -H "Authorization: Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

# Test check-delivery-etas
curl -X POST http://127.0.0.1:54321/functions/v1/check-delivery-etas \
  -H "Authorization: Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
```

### 6. Set Up Scheduled Execution Locally

Create a Node.js script `local-scheduler.js` in your project root:

```javascript
const schedule = require('node-schedule');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

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

### 7. Alternative: Use pg_cron in Local Database

Connect to your local database:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Enable pg_cron extension:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule samsara-locations every 5 minutes
SELECT cron.schedule(
  'samsara-locations-local',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='http://127.0.0.1:54321/functions/v1/samsara-locations',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule check-delivery-etas every 10 minutes
SELECT cron.schedule(
  'check-delivery-etas-local',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='http://127.0.0.1:54321/functions/v1/check-delivery-etas',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- Unschedule (if needed)
-- SELECT cron.unschedule('samsara-locations-local');
-- SELECT cron.unschedule('check-delivery-etas-local');
```

## Monitoring Logs

### View function logs in Supabase Studio:
1. Open http://127.0.0.1:54323
2. Go to Functions
3. Click on a function to see logs

### View logs in terminal:
The logs will appear in the terminal where you ran `supabase functions serve`.

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
- Check that environment variables are set correctly
- Verify Supabase local instance is running: `supabase status`

### Scheduler not working:
- For Node.js scheduler: Make sure all functions are served locally
- For pg_cron: Verify extension is installed: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`

### Database connection issues:
- Verify connection string: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Make sure local Supabase is running: `supabase status`
