import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Get all data from Transit Tracking API with detailed logging
async function getAllTransitDataDebug(apiKeys: string[]) {
  const allResults: any[] = [];
  
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const keyInfo: any = {
      keyIndex: i + 1,
      keyPrefix: key.slice(0, 10) + '...',
      keyLength: key.length,
      authSuccess: false,
      recordCount: 0,
      sampleRecords: [] as any[],
      error: null as string | null
    };

    try {
      const token = await getBearerToken(key);
      if (!token) {
        keyInfo.error = 'Failed to authenticate';
        allResults.push(keyInfo);
        continue;
      }
      
      keyInfo.authSuccess = true;
      const data = await fetchDataWithToken(token);
      keyInfo.recordCount = data.length;
      
      // Take first 5 records as samples
      keyInfo.sampleRecords = data.slice(0, 5).map(record => ({
        name: record.name,
        minsTillDriving: record.minsTillDriving,
        minsTillShift: record.minsTillShift,
        minsTillCycle: record.minsTillCycle,
        statusAbbreviation: record.statusAbbreviation,
        hosUtcTimestamp: record.hosUtcTimestamp,
        utcTimestamp: record.utcTimestamp
      }));
      
      allResults.push(keyInfo);
      console.log(`Key ${i + 1}: Got ${data.length} records`);
    } catch (error) {
      keyInfo.error = error instanceof Error ? error.message : 'Unknown error';
      allResults.push(keyInfo);
      console.error(`Error processing key ${i + 1}:`, error);
    }
  }
  
  return allResults;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('HOS Debug function started');
    
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

    // Debug all API keys
    const debugResults = await getAllTransitDataDebug(apiKeys);
    
    const totalRecords = debugResults.reduce((sum, result) => sum + result.recordCount, 0);
    const successfulKeys = debugResults.filter(result => result.authSuccess).length;
    
    console.log(`Debug complete. ${successfulKeys}/${apiKeys.length} keys successful, ${totalRecords} total records`);

    return new Response(JSON.stringify({ 
      success: true,
      totalApiKeys: apiKeys.length,
      successfulKeys,
      totalRecords,
      keyResults: debugResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in HOS debug:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});