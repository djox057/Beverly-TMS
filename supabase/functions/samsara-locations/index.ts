import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SamsaraVehicle {
  id: string;
  name: string;
  gps?: {
    latitude: number;
    longitude: number;
    time: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    time: string;
    speed?: number;
  };
}

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number;
  ageMinutes?: number;
  isValid?: boolean;
}

// Location validation bounds (US Continental)
const LOCATION_BOUNDS = {
  minLat: 25.0,
  maxLat: 50.0,
  minLon: -125.0,
  maxLon: -65.0
};

const MAX_LOCATION_AGE_MINUTES = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!apiKey1 || !apiKey2) {
      throw new Error('Samsara API keys not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all trucks from database
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number');

    if (trucksError) {
      console.error('Error fetching trucks:', trucksError);
      throw trucksError;
    }

    const apiKeys = [apiKey1, apiKey2];
    const allVehicles: SamsaraVehicle[] = [];

    // Fetch vehicles from both Samsara accounts using both endpoints
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
      const apiKey = apiKeys[keyIndex];
      console.log(`Fetching from API key ${keyIndex + 1}...`);
      
      // Try both endpoints
      const endpoints = [
        'https://api.samsara.com/fleet/vehicles/locations',
        'https://api.samsara.com/fleet/vehicles'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            console.error(`Samsara API error (${endpoint}): ${response.status} ${response.statusText}`);
            continue;
          }

          const data = await response.json();
          const vehicles: SamsaraVehicle[] = data.data || [];
          
          console.log(`Fetched ${vehicles.length} vehicles from ${endpoint}`);
          
          // Add vehicles with their API source
          vehicles.forEach(v => allVehicles.push({ ...v, apiKeyIndex: keyIndex }));
          break; // Use first successful endpoint
        } catch (error) {
          console.error(`Error fetching from ${endpoint}:`, error);
        }
      }
    }

    console.log(`Total vehicles fetched: ${allVehicles.length}`);
    console.log(`Total trucks in database: ${trucks?.length || 0}`);

    // Log sample vehicle names for debugging
    console.log('\n=== SAMPLE VEHICLE NAMES ===');
    allVehicles.slice(0, 10).forEach(v => {
      console.log(`  "${v.name}" (ID: ${v.id})`);
    });

    // Log sample truck numbers for debugging
    console.log('\n=== SAMPLE TRUCK NUMBERS ===');
    (trucks || []).slice(0, 10).forEach(t => {
      console.log(`  "${t.truck_number}" (ID: ${t.id})`);
    });

    // Match vehicles with trucks using flexible matching
    const allLocations: TruckLocation[] = [];
    let matchAttempts = 0;
    let successfulMatches = 0;
    
    for (const truck of trucks || []) {
      matchAttempts++;
      console.log(`\n--- Matching attempt ${matchAttempts} ---`);
      console.log(`Looking for truck: "${truck.truck_number}"`);
      
      const matchedVehicle = findMatchingVehicle(allVehicles, truck.truck_number);
      
      if (matchedVehicle) {
        console.log(`✓ Found matching vehicle: "${matchedVehicle.name}"`);
        successfulMatches++;
        
        const location = matchedVehicle.location || matchedVehicle.gps;
        
        if (location && location.latitude && location.longitude) {
          const ageMinutes = location.time 
            ? (Date.now() - new Date(location.time).getTime()) / 1000 / 60 
            : 999999;
          
          const isValid = validateLocationBounds(location.latitude, location.longitude);
          const isFresh = ageMinutes <= MAX_LOCATION_AGE_MINUTES;
          
          console.log(`  Location: ${location.latitude}, ${location.longitude}`);
          console.log(`  Age: ${ageMinutes.toFixed(1)} minutes`);
          console.log(`  Valid bounds: ${isValid}`);
          console.log(`  Fresh: ${isFresh}`);
          
          if (isValid) {
            allLocations.push({
              truck_id: truck.id,
              truck_number: truck.truck_number,
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: location.time || new Date().toISOString(),
              speed: location.speed || 0,
              ageMinutes: ageMinutes,
              isValid: isFresh
            });
            
            console.log(`  ✓ Added to locations list`);
          } else {
            console.log(`  ✗ Location out of bounds`);
          }
        } else {
          console.log(`  ✗ No valid location data in vehicle`);
        }
      } else {
        console.log(`✗ No matching vehicle found`);
      }
    }

    console.log(`\n=== MATCHING SUMMARY ===`);
    console.log(`Total match attempts: ${matchAttempts}`);
    console.log(`Successful matches: ${successfulMatches}`);
    console.log(`Final locations: ${allLocations.length}`);

    console.log(`Matched ${allLocations.length} truck locations`);

    return new Response(
      JSON.stringify({ locations: allLocations }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in samsara-locations function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Flexible truck name matching with multiple variants
 */
function findMatchingVehicle(vehicles: SamsaraVehicle[], truckNumber: string): SamsaraVehicle | null {
  if (!truckNumber) {
    console.log('  Empty truck number provided');
    return null;
  }
  
  // Normalize truck number and create variants
  const norm = String(truckNumber).replace(/^#/, '').trim();
  const pad4 = norm.padStart(4, '0');
  
  const variants = [
    `TRUCK ${pad4}`,
    `TRUCK #${pad4}`,
    `TRUCK${pad4}`,
    `TRUCK #${norm}`,
    `TRUCK ${norm}`,
    `TRUCK${norm}`,
    `#${pad4}`,
    `#${norm}`,
    pad4,
    norm,
    String(truckNumber)
  ];
  
  console.log(`  Trying variants: ${variants.slice(0, 5).join(', ')}...`);
  
  // Find matching vehicle
  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;
    const vehicleName = String(vehicle.name).toUpperCase().trim();
    
    // Check each variant
    for (const variant of variants) {
      const variantUpper = variant.toUpperCase();
      
      // Exact match
      if (vehicleName === variantUpper) {
        console.log(`  ✓ Exact match found: "${vehicle.name}" matches "${variant}"`);
        return vehicle;
      }
      
      // Contains match (for cases like "TRUCK 9494 - Driver Name")
      if (vehicleName.includes(variantUpper)) {
        console.log(`  ✓ Partial match found: "${vehicle.name}" contains "${variant}"`);
        return vehicle;
      }
      
      // Check if vehicle name contains the padded number anywhere
      if (vehicleName.includes(pad4)) {
        console.log(`  ✓ Number match found: "${vehicle.name}" contains "${pad4}"`);
        return vehicle;
      }
    }
  }
  
  console.log(`  ✗ No match found for any variant`);
  return null;
}

/**
 * Validate location is within US bounds
 */
function validateLocationBounds(lat: number, lon: number): boolean {
  if (lat === 0 && lon === 0) return false;
  
  return !(
    lat < LOCATION_BOUNDS.minLat || 
    lat > LOCATION_BOUNDS.maxLat || 
    lon < LOCATION_BOUNDS.minLon || 
    lon > LOCATION_BOUNDS.maxLon
  );
}
