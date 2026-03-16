import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
  fuel?: number;
}

interface HosUpdate {
  id: string;
  drive: number;
  shift: number;
  break: number;
  cycle: number;
  status: string | null;
  updated: string;
}

// Get bearer token using client_key
async function getBearerToken(clientKey: string): Promise<string | null> {
  try {
    const response = await fetch(AUTH_URL, {
      method: 'GET',
      headers: { 'client_key': clientKey, 'Accept': 'application/json' }
    });
    if (response.status !== 200) return null;
    const json = await response.json();
    return json.token || null;
  } catch (error) {
    console.error(`Auth error for key ${clientKey.slice(0, 10)}...:`, error);
    return null;
  }
}

// Fetch data using bearer token
async function fetchDataWithToken(token: string): Promise<TransitRecord[]> {
  try {
    const response = await fetch(`${API_URL}?additionalInfo=true`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (response.status !== 200) return [];
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
      if (!token) continue;
      const data = await fetchDataWithToken(token);
      if (data.length) mergedData.push(...data);
    } catch (error) {
      console.error(`Error processing key ${key.slice(0, 10)}...:`, error);
    }
  }
  console.log(`Total records fetched: ${mergedData.length}`);
  return mergedData;
}

// Normalize truck number for matching
function normalizeTruckNumber(truckNum: string): string {
  return truckNum.toString().replace(/#/g, '').trim().replace(/^0+/, '') || '0';
}

// Create lookup map with most recent valid HOS data for each truck
function createTruckLookupMap(apiData: TransitRecord[]): { 
  byOriginal: Record<string, TransitRecord>,
  byNormalized: Record<string, TransitRecord>
} {
  const byOriginal: Record<string, TransitRecord> = {};
  const byNormalized: Record<string, TransitRecord> = {};
  
  for (const record of apiData) {
    if (!record?.name) continue;
    const originalNum = record.name.toString().replace(/#/g, '').trim();
    const normalizedNum = normalizeTruckNumber(originalNum);
    
    for (const [key, map] of [
      [originalNum, byOriginal], 
      [normalizedNum, byNormalized]
    ] as [string, Record<string, TransitRecord>][]) {
      const prev = map[key];
      if (
        !prev ||
        (isValidHosRecord(record) && !isValidHosRecord(prev)) ||
        (isValidHosRecord(record) && isValidHosRecord(prev) &&
          new Date(record.hosUtcTimestamp || record.utcTimestamp || 0) > 
          new Date(prev.hosUtcTimestamp || prev.utcTimestamp || 0)) ||
        (!isValidHosRecord(prev) && !isValidHosRecord(record) &&
          new Date(record.utcTimestamp || 0) > new Date(prev.utcTimestamp || 0))
      ) {
        map[key] = record;
      }
    }
  }

  return { byOriginal, byNormalized };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('HOS Sync started');
    
    const apiKeysEnv = Deno.env.get('TRANSIT_TRACKING_API_KEYS');
    const unitedApiKey = Deno.env.get('TRANSIT_TRACKING_API_KEY_UNITED');
    
    if (!apiKeysEnv && !unitedApiKey) {
      throw new Error('No Transit Tracking API keys configured');
    }

    const apiKeys: string[] = [];
    if (apiKeysEnv) {
      apiKeys.push(...apiKeysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0));
    }
    if (unitedApiKey?.trim()) {
      apiKeys.push(unitedApiKey.trim());
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Overlap guard: skip if last update was < 60 seconds ago
    const { data: recentDriver } = await supabase
      .from('drivers')
      .select('hos_last_updated')
      .not('hos_last_updated', 'is', null)
      .order('hos_last_updated', { ascending: false })
      .limit(1)
      .single();

    if (recentDriver?.hos_last_updated) {
      const lastUpdate = new Date(recentDriver.hos_last_updated);
      const secondsAgo = (Date.now() - lastUpdate.getTime()) / 1000;
      if (secondsAgo < 60) {
        console.log(`Skipping: last update was ${Math.round(secondsAgo)}s ago`);
        return new Response(JSON.stringify({ success: true, skipped: true, secondsAgo: Math.round(secondsAgo) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch API data and build lookup
    const allApiData = await getAllTransitData(apiKeys);
    const { byOriginal, byNormalized } = createTruckLookupMap(allApiData);

    // Get trucks with assigned drivers
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select(`
        truck_number,
        driver1_id,
        driver2_id,
        driver1:drivers!trucks_driver1_id_fkey(id, name),
        driver2:drivers!trucks_driver2_id_fkey(id, name)
      `);

    if (trucksError) throw new Error(`Error fetching trucks: ${trucksError.message}`);
    if (!trucks?.length) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: 'No trucks' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all updates into a batch
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const updates: HosUpdate[] = [];
    const fuelUpdates: { id: string; fuel: number }[] = [];

    for (const truck of trucks) {
      const driversToUpdate = [truck.driver1, truck.driver2].filter(Boolean);
      const truckNum = truck.truck_number;
      const normalizedTruckNum = normalizeTruckNumber(truckNum);
      const hosData = byOriginal[truckNum] || byNormalized[normalizedTruckNum];

      // Collect fuel level for this truck regardless of driver HOS validity
      if (hosData && hosData.fuel != null) {
        fuelUpdates.push({ id: truck.id, fuel: Math.round(hosData.fuel) });
      }
      
      for (const driver of driversToUpdate) {
        if (driver && typeof driver === 'object' && 'id' in driver) {
          if (hosData && isValidHosRecord(hosData)) {
            updates.push({
              id: driver.id as string,
              drive: hosData.minsTillDriving || 0,
              shift: hosData.minsTillShift || 0,
              break: hosData.minsTillBreak || 0,
              cycle: hosData.minsTillCycle || 0,
              status: hosData.statusAbbreviation || null,
              updated: timestamp
            });
          } else if (hosData && !isValidHosRecord(hosData)) {
            updates.push({
              id: driver.id as string,
              drive: -1,
              shift: -1,
              break: -1,
              cycle: -1,
              status: hosData.statusAbbreviation || 'OFF',
              updated: timestamp
            });
          }
        }
      }
    }

    // Single batch RPC call for driver HOS updates
    let updatedCount = 0;
    if (updates.length > 0) {
      const { data: count, error: rpcError } = await supabase.rpc('bulk_update_hos', {
        updates: updates
      });
      
      if (rpcError) {
        console.error('Bulk update error:', rpcError);
        throw new Error(`Bulk update failed: ${rpcError.message}`);
      }
      updatedCount = count || 0;
      console.log(`Batch updated ${updatedCount} drivers in 1 query`);
    }

    // Batch update truck fuel levels
    if (fuelUpdates.length > 0) {
      await Promise.all(fuelUpdates.map(u =>
        supabase.from('trucks').update({ fuel_level: u.fuel }).eq('id', u.id)
      ));
      console.log(`Updated fuel levels for ${fuelUpdates.length} trucks`);
    }

    console.log(`HOS sync complete. ${updatedCount} drivers updated from ${allApiData.length} API records.`);

    return new Response(JSON.stringify({ 
      success: true, 
      updated: updatedCount,
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
