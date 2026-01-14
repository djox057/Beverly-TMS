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

// Company name that uses a separate API key
const UNITED_COMPANY_NAME = 'United Enterprise Solutions Inc';

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
      console.log(`Got ${data.length} records with key ${apiKey.slice(0, 10)}...`);
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
    const unitedApiKey = Deno.env.get('TRANSIT_TRACKING_API_KEY_UNITED');
    
    console.log('Raw API keys env:', apiKeysEnv ? `Found ${apiKeysEnv.length} characters` : 'Not found');
    console.log('United API key:', unitedApiKey ? `Found ${unitedApiKey.length} characters` : 'Not found');
    
    if (!apiKeysEnv) {
      console.error('TRANSIT_TRACKING_API_KEYS environment variable not set');
      throw new Error('TRANSIT_TRACKING_API_KEYS environment variable not set');
    }

    // Parse general API keys (expecting comma-separated values)
    const apiKeys = apiKeysEnv.split(',').map(key => key.trim()).filter(key => key.length > 0);
    console.log(`Parsed ${apiKeys.length} general API keys for Transit Tracking`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data from Transit Tracking API (general keys)
    const generalApiData = await getAllTransitData(apiKeys);
    
    // Fetch data from United-specific API key if available
    let unitedApiData: TransitRecord[] = [];
    if (unitedApiKey) {
      console.log('Fetching data for United Enterprise Solutions Inc...');
      unitedApiData = await getTransitDataForKey(unitedApiKey);
      console.log(`Got ${unitedApiData.length} records from United API key`);
    }

    // Create lookup maps
    const generalTruckLookupMap = createTruckLookupMap(generalApiData);
    const unitedTruckLookupMap = createTruckLookupMap(unitedApiData);
    
    console.log(`Created general lookup map with ${Object.keys(generalTruckLookupMap).length} trucks`);
    console.log(`Created United lookup map with ${Object.keys(unitedTruckLookupMap).length} trucks`);

    // Get trucks and their assigned drivers from database, including company info
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select(`
        truck_number,
        driver1_id,
        driver2_id,
        company_id,
        company:companies!trucks_company_id_fkey(id, name),
        driver1:drivers!trucks_driver1_id_fkey(id, name, email, phone, license_number, company_id, company:companies!drivers_company_id_fkey(id, name)),
        driver2:drivers!trucks_driver2_id_fkey(id, name, email, phone, license_number, company_id, company:companies!drivers_company_id_fkey(id, name))
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

    console.log(`Processing ${trucks.length} trucks from database:`);
    console.log(`Available assets in general lookup map: ${Object.keys(generalTruckLookupMap).slice(0, 20).join(', ')}...`);
    console.log(`Available assets in United lookup map: ${Object.keys(unitedTruckLookupMap).join(', ')}`);

    for (const truck of trucks) {
      console.log(`Truck: ${truck.truck_number}`);
      
      // Get drivers to update
      const driversToUpdate = [truck.driver1, truck.driver2].filter(Boolean);
      
      for (const driver of driversToUpdate) {
        if (driver && typeof driver === 'object' && 'id' in driver && 'name' in driver) {
          // Check if driver belongs to United Enterprise Solutions Inc
          // Access company data using bracket notation to handle nested relation
          const driverObj = driver as Record<string, unknown>;
          const companyData = driverObj['company'];
          let driverCompanyName: string | null = null;
          
          if (Array.isArray(companyData) && companyData.length > 0 && companyData[0] && typeof companyData[0] === 'object') {
            driverCompanyName = (companyData[0] as { name?: string }).name || null;
          } else if (companyData && typeof companyData === 'object' && 'name' in (companyData as object)) {
            driverCompanyName = (companyData as { name: string }).name;
          }
          
          const isUnitedDriver = driverCompanyName === UNITED_COMPANY_NAME;
          
          // Use appropriate lookup map based on driver's company
          const lookupMap = isUnitedDriver ? unitedTruckLookupMap : generalTruckLookupMap;
          const hosData = lookupMap[truck.truck_number];
          
          console.log(`Driver ${driver.name} (Company: ${driverCompanyName || 'N/A'}) - Using ${isUnitedDriver ? 'United' : 'General'} lookup map`);
          
          if (hosData && isValidHosRecord(hosData)) {
            console.log(`✅ Found VALID HOS data for driver ${driver.name} on truck ${truck.truck_number}:`, {
              drive_minutes: hosData.minsTillDriving || 0,
              shift_minutes: hosData.minsTillShift || 0,
              break_minutes: hosData.minsTillBreak || 0,
              cycle_minutes: hosData.minsTillCycle || 0,
              status: hosData.statusAbbreviation || null,
              api_timestamp: hosData.hosUtcTimestamp || hosData.utcTimestamp
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
      general_api_records: generalApiData.length,
      united_api_records: unitedApiData.length
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
