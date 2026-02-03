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
  minsTillBreak?: number;
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

// Get data from Transit Tracking API for a single key
async function getTransitDataForKey(apiKey: string): Promise<TransitRecord[]> {
  try {
    const token = await getBearerToken(apiKey);
    if (!token) {
      console.log(`Failed to get token for key ${apiKey.slice(0, 10)}...`);
      return [];
    }
    
    const data = await fetchDataWithToken(token);
    if (data && data.length) {
      // Log all truck numbers from this key for debugging
      const truckNumbers = data.map(r => r.name).filter(Boolean).sort();
      console.log(`Got ${data.length} records with key ${apiKey.slice(0, 10)}...`);
      console.log(`Truck numbers from key ${apiKey.slice(0, 10)}...: ${truckNumbers.join(', ')}`);
      return data;
    }
    return [];
  } catch (error) {
    console.error(`Error processing key ${apiKey.slice(0, 10)}...:`, error);
    return [];
  }
}

// Get all data from Transit Tracking API (for general keys)
async function getAllTransitData(apiKeys: string[]): Promise<TransitRecord[]> {
  const mergedData: TransitRecord[] = [];
  
  for (const key of apiKeys) {
    const data = await getTransitDataForKey(key);
    mergedData.push(...data);
  }
  
  console.log(`Total records fetched from general keys: ${mergedData.length}`);
  return mergedData;
}

// Normalize truck number for matching (remove leading zeros, special chars)
function normalizeTruckNumber(truckNum: string): string {
  // Remove #, spaces, and leading zeros
  return truckNum.toString().replace(/#/g, '').trim().replace(/^0+/, '') || '0';
}

// Create lookup map with most recent valid HOS data for each truck
// Stores both original and normalized versions for flexible matching
function createTruckLookupMap(apiData: TransitRecord[]): { 
  byOriginal: Record<string, TransitRecord>,
  byNormalized: Record<string, TransitRecord>
} {
  const byOriginal: Record<string, TransitRecord> = {};
  const byNormalized: Record<string, TransitRecord> = {};
  
  apiData.forEach(record => {
    if (record && record.name) {
      const originalNum = record.name.toString().replace(/#/g, '').trim();
      const normalizedNum = normalizeTruckNumber(originalNum);
      
      // Store by original
      const prevOrig = byOriginal[originalNum];
      if (
        !prevOrig ||
        (isValidHosRecord(record) && !isValidHosRecord(prevOrig)) ||
        (isValidHosRecord(record) && isValidHosRecord(prevOrig) &&
          new Date(record.hosUtcTimestamp || record.utcTimestamp || 0) > 
          new Date(prevOrig.hosUtcTimestamp || prevOrig.utcTimestamp || 0)) ||
        (!isValidHosRecord(prevOrig) && !isValidHosRecord(record) &&
          new Date(record.utcTimestamp || 0) > new Date(prevOrig.utcTimestamp || 0))
      ) {
        byOriginal[originalNum] = record;
      }
      
      // Store by normalized (without leading zeros)
      const prevNorm = byNormalized[normalizedNum];
      if (
        !prevNorm ||
        (isValidHosRecord(record) && !isValidHosRecord(prevNorm)) ||
        (isValidHosRecord(record) && isValidHosRecord(prevNorm) &&
          new Date(record.hosUtcTimestamp || record.utcTimestamp || 0) > 
          new Date(prevNorm.hosUtcTimestamp || prevNorm.utcTimestamp || 0)) ||
        (!isValidHosRecord(prevNorm) && !isValidHosRecord(record) &&
          new Date(record.utcTimestamp || 0) > new Date(prevNorm.utcTimestamp || 0))
      ) {
        byNormalized[normalizedNum] = record;
      }
    }
  });

  return { byOriginal, byNormalized };
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
    const unitedApiKey = Deno.env.get('TRANSIT_TRACKING_API_KEY_UNITED');
    
    console.log('Raw API keys env:', apiKeysEnv ? `Found ${apiKeysEnv.length} characters` : 'Not found');
    console.log('United API key:', unitedApiKey ? `Found ${unitedApiKey.length} characters` : 'Not found');
    
    if (!apiKeysEnv && !unitedApiKey) {
      console.error('No API keys found');
      throw new Error('No Transit Tracking API keys configured');
    }

    // Parse all API keys - combine general keys with United key
    const apiKeys: string[] = [];
    
    if (apiKeysEnv) {
      const generalKeys = apiKeysEnv.split(',').map(key => key.trim()).filter(key => key.length > 0);
      apiKeys.push(...generalKeys);
    }
    
    // Add United API key to the list if available (treat it like all other keys)
    if (unitedApiKey && unitedApiKey.trim().length > 0) {
      apiKeys.push(unitedApiKey.trim());
    }
    
    console.log(`Total API keys to process: ${apiKeys.length}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data from all API keys
    const allApiData = await getAllTransitData(apiKeys);
    
    // Create lookup maps from all data (keyed by truck number - both original and normalized)
    const { byOriginal, byNormalized } = createTruckLookupMap(allApiData);
    
    // Log truck numbers from API for debugging
    const allTruckNumbers = Object.keys(byOriginal).sort();
    console.log(`Created lookup map with ${allTruckNumbers.length} trucks from ${allApiData.length} total records`);

    // Get trucks and their assigned drivers from database
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select(`
        truck_number,
        driver1_id,
        driver2_id,
        driver1:drivers!trucks_driver1_id_fkey(id, name),
        driver2:drivers!trucks_driver2_id_fkey(id, name)
      `);

    if (trucksError) {
      throw new Error(`Error fetching trucks: ${trucksError.message}`);
    }

    if (!trucks || trucks.length === 0) {
      console.log('No trucks found in database');
      return new Response(JSON.stringify({ 
        success: true, 
        updated: 0, 
        message: 'No trucks found in database' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update drivers with HOS data based on truck assignments
    let updatedCount = 0;

    console.log(`Processing ${trucks.length} trucks from database`);

    for (const truck of trucks) {
      // Get drivers to update
      const driversToUpdate = [truck.driver1, truck.driver2].filter(Boolean);
      
      for (const driver of driversToUpdate) {
        if (driver && typeof driver === 'object' && 'id' in driver && 'name' in driver) {
          // Try exact match first, then normalized match (handles leading zeros)
          const truckNum = truck.truck_number;
          const normalizedTruckNum = normalizeTruckNumber(truckNum);
          let hosData = byOriginal[truckNum] || byNormalized[normalizedTruckNum];
          
          if (hosData && isValidHosRecord(hosData)) {
            console.log(`✅ Found VALID HOS data for driver ${driver.name} on truck ${truck.truck_number}:`, {
              drive_minutes: hosData.minsTillDriving || 0,
              shift_minutes: hosData.minsTillShift || 0,
              break_minutes: hosData.minsTillBreak || 0,
              cycle_minutes: hosData.minsTillCycle || 0,
              status: hosData.statusAbbreviation || null,
            });
            
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            
            const { error: updateError } = await supabase
              .from('drivers')
              .update({
                hos_drive_minutes: hosData.minsTillDriving || 0,
                hos_shift_minutes: hosData.minsTillShift || 0,
                hos_break_minutes: hosData.minsTillBreak || 0,
                hos_cycle_minutes: hosData.minsTillCycle || 0,
                hos_status: hosData.statusAbbreviation || null,
                hos_last_updated: timestamp
              })
              .eq('id', driver.id);
            
            if (updateError) {
              console.error(`Error updating driver ${driver.name}:`, updateError);
            } else {
              console.log(`✅ Updated HOS data for driver: ${driver.name}`);
              updatedCount++;
            }
          } else if (hosData && !isValidHosRecord(hosData)) {
            console.log(`Found HOS data for driver ${driver.name} but it's INVALID`);
          } else {
            console.log(`No HOS data found for driver ${driver.name} on truck ${truck.truck_number}`);
          }
        }
      }
    }

    console.log(`HOS sync complete. Updated ${updatedCount} drivers.`);

    return new Response(JSON.stringify({ 
      success: true, 
      updated: updatedCount,
      total_drivers: updatedCount,
      total_api_records: allApiData.length,
      api_keys_used: apiKeys.length
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
