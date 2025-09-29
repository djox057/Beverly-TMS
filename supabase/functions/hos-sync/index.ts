import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Transit Tracking API configuration
const AUTH_URL = 'https://assets.transittracking.us/api/v1/auth';
const API_URL = 'https://assets.transittracking.us/api/v1/assets/currentWithTimers';

interface TransitRecord {
  name?: string;
  minsTillDriving?: number;
  minsTillShift?: number;
  minsTillCycle?: number;
  statusAbbreviation?: string;
  hosUtcTimestamp?: string;
  utcTimestamp?: string;
}

// Get bearer token using client_key
async function getBearerToken(clientKey: string): Promise<string | null> {
  try {
    console.log(`Attempting auth for key ${clientKey.slice(0, 10)}...`);
    const response = await fetch(AUTH_URL, {
      method: 'GET',
      headers: {
        'client_key': clientKey,
        'Accept': 'application/json'
      }
    });

    console.log(`Auth response status for key ${clientKey.slice(0, 10)}...: ${response.status}`);
    
    if (response.status !== 200) {
      const errorText = await response.text();
      console.log(`Auth failed for key ${clientKey.slice(0, 10)}... - Status: ${response.status}, Error: ${errorText}`);
      return null;
    }

    const json = await response.json();
    const token = json.token || null;
    console.log(`Auth ${token ? 'successful' : 'failed'} for key ${clientKey.slice(0, 10)}...`);
    return token;
  } catch (error) {
    console.error(`Error getting token for key ${clientKey.slice(0, 10)}...:`, error);
    return null;
  }
}

// Fetch data using bearer token
async function fetchDataWithToken(token: string): Promise<TransitRecord[]> {
  try {
    const url = `${API_URL}?additionalInfo=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status !== 200) {
      console.log(`Data fetch failed - Status: ${response.status}`);
      return [];
    }

    const json = await response.json();
    return Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    console.error('Error fetching data with token:', error);
    return [];
  }
}

// Check if record contains valid HOS data
function isValidHosRecord(record: TransitRecord): boolean {
  return !!(
    record &&
    (
      (record.minsTillDriving && record.minsTillDriving > 0) ||
      (record.minsTillShift && record.minsTillShift > 0) ||
      (record.minsTillCycle && record.minsTillCycle > 0) ||
      (record.hosUtcTimestamp && record.hosUtcTimestamp !== '0001-01-01T00:00:00')
    )
  );
}

// Get all data from Transit Tracking API
async function getAllTransitData(apiKeys: string[]): Promise<TransitRecord[]> {
  const mergedData: TransitRecord[] = [];
  
  for (const key of apiKeys) {
    try {
      const token = await getBearerToken(key);
      if (!token) {
        console.log(`Failed to get token for key ${key.slice(0, 10)}...`);
        continue;
      }
      
      const data = await fetchDataWithToken(token);
      if (data && data.length) {
        console.log(`Got ${data.length} records with key ${key.slice(0, 10)}...`);
        mergedData.push(...data);
      }
    } catch (error) {
      console.error(`Error processing key ${key.slice(0, 10)}...:`, error);
    }
  }
  
  console.log(`Total records fetched: ${mergedData.length}`);
  return mergedData;
}

// Create lookup map with most recent valid HOS data for each truck
function createTruckLookupMap(apiData: TransitRecord[]): Record<string, TransitRecord> {
  const apiDataMap: Record<string, TransitRecord> = {};
  
  apiData.forEach(record => {
    if (record && record.name) {
      // Remove # characters and trim spaces from truck number
      const truckNum = record.name.toString().replace(/#/g, '').trim();
      const prev = apiDataMap[truckNum];

      // Prefer valid HOS records, or most recent if both are valid/invalid
      if (
        !prev ||
        (isValidHosRecord(record) && !isValidHosRecord(prev)) ||
        (isValidHosRecord(record) && isValidHosRecord(prev) &&
          new Date(record.hosUtcTimestamp || record.utcTimestamp || 0) > 
          new Date(prev.hosUtcTimestamp || prev.utcTimestamp || 0)) ||
        (!isValidHosRecord(prev) && !isValidHosRecord(record) &&
          new Date(record.utcTimestamp || 0) > new Date(prev.utcTimestamp || 0))
      ) {
        apiDataMap[truckNum] = record;
      }
    }
  });

  return apiDataMap;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('HOS Sync function started');
    
    // Get API keys from environment
    const apiKeysEnv = Deno.env.get('TRANSIT_TRACKING_API_KEYS');
    console.log('Raw API keys env:', apiKeysEnv ? `Found ${apiKeysEnv.length} characters` : 'Not found');
    
    if (!apiKeysEnv) {
      console.error('TRANSIT_TRACKING_API_KEYS environment variable not set');
      throw new Error('TRANSIT_TRACKING_API_KEYS environment variable not set');
    }

    // Parse API keys (expecting comma-separated values)
    const apiKeys = apiKeysEnv.split(',').map(key => key.trim()).filter(key => key.length > 0);
    console.log(`Parsed ${apiKeys.length} API keys for Transit Tracking`);
    console.log('API key lengths:', apiKeys.map(key => key.length));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data from Transit Tracking API
    const apiData = await getAllTransitData(apiKeys);
    if (apiData.length === 0) {
      throw new Error('No data received from Transit Tracking API');
    }

    // Create lookup map for trucks
    const truckLookupMap = createTruckLookupMap(apiData);
    console.log(`Created lookup map with ${Object.keys(truckLookupMap).length} trucks`);

    // Get all drivers from database with their transit mapping
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, name, license_number, email, phone');

    if (driversError) {
      throw new Error(`Error fetching drivers: ${driversError.message}`);
    }

    if (!drivers || drivers.length === 0) {
      console.log('No drivers found in database');
      return new Response(JSON.stringify({ 
        success: true, 
        updated: 0, 
        message: 'No drivers found in database' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update drivers with HOS data
    const updates = [];
    let updatedCount = 0;

    console.log(`Processing ${drivers.length} drivers from database:`);
    drivers.forEach(driver => {
      console.log(`DB Driver: ${driver.name} (ID: ${driver.id})`);
    });

    console.log(`Available assets in API lookup map: ${Object.keys(truckLookupMap).join(', ')}`);

    for (const driver of drivers) {
      if (!driver.name) {
        console.log(`Skipping driver ${driver.id} - no name`);
        continue;
      }

      // Try multiple matching strategies for drivers
      const normalizedDriverName = driver.name.replace(/#/g, '').trim();
      let hosData = truckLookupMap[normalizedDriverName];
      
      // If no direct match, try other identifiers
      if (!hosData && driver.license_number) {
        hosData = truckLookupMap[driver.license_number.replace(/#/g, '').trim()];
      }
      
      // Try email prefix if available
      if (!hosData && driver.email) {
        const emailPrefix = driver.email.split('@')[0];
        hosData = truckLookupMap[emailPrefix];
      }
      
      // Try phone number if available
      if (!hosData && driver.phone) {
        const cleanPhone = driver.phone.replace(/\D/g, '');
        hosData = truckLookupMap[cleanPhone];
      }

      console.log(`Driver ${driver.name} -> normalized: "${normalizedDriverName}" -> HOS data found: ${!!hosData}`);

      if (hosData && isValidHosRecord(hosData)) {
        const updateData = {
          id: driver.id,
          hos_drive_minutes: hosData.minsTillDriving || 0,
          hos_shift_minutes: hosData.minsTillShift || 0,
          hos_cycle_minutes: hosData.minsTillCycle || 0,
          hos_status: hosData.statusAbbreviation || null,
          hos_last_updated: new Date().toISOString()
        };
        
        console.log(`Updating driver ${driver.name} (${driver.id}) with VALID HOS data:`, {
          drive_minutes: updateData.hos_drive_minutes,
          shift_minutes: updateData.hos_shift_minutes,
          cycle_minutes: updateData.hos_cycle_minutes,
          status: updateData.hos_status,
          api_name: hosData.name,
          api_timestamp: hosData.hosUtcTimestamp || hosData.utcTimestamp,
          is_valid: true
        });
        
        updates.push(updateData);
        updatedCount++;
      } else if (hosData && !isValidHosRecord(hosData)) {
        console.log(`Found HOS data for driver ${driver.name} but it's INVALID:`, {
          drive_minutes: hosData.minsTillDriving || 0,
          shift_minutes: hosData.minsTillShift || 0,
          cycle_minutes: hosData.minsTillCycle || 0,
          status: hosData.statusAbbreviation || null,
          api_name: hosData.name,
          api_timestamp: hosData.hosUtcTimestamp || hosData.utcTimestamp,
          is_valid: false
        });
      } else {
        console.log(`No HOS data found for driver ${driver.name} (normalized: "${normalizedDriverName}")`);
      }
    }

    // Batch update drivers
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('drivers')
          .update({
            hos_drive_minutes: update.hos_drive_minutes,
            hos_shift_minutes: update.hos_shift_minutes,
            hos_cycle_minutes: update.hos_cycle_minutes,
            hos_status: update.hos_status,
            hos_last_updated: update.hos_last_updated
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Error updating driver ${update.id}:`, updateError);
        }
      }
    }

    console.log(`HOS sync complete. Updated ${updatedCount} drivers.`);

    return new Response(JSON.stringify({ 
      success: true, 
      updated: updatedCount,
      total_drivers: drivers.length,
      api_records: apiData.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in HOS sync:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});