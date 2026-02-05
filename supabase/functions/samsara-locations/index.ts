import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Location validation bounds (US Continental)
const LOCATION_BOUNDS = {
  minLat: 25.0,
  maxLat: 50.0,
  minLon: -125.0,
  maxLon: -65.0,
};

const MAX_LOCATION_AGE_MINUTES = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey1 || !apiKey2) {
      throw new Error('Samsara API keys not configured');
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Fetch all trucks from database
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number');

    if (trucksError) {
      console.error('Error fetching trucks:', trucksError);
      throw trucksError;
    }

    const apiKeys = [apiKey1, apiKey2];
    const allVehicles: any[] = [];

    // Fetch vehicles from both Samsara accounts using both endpoints
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
      const apiKey = apiKeys[keyIndex];
      console.log(`Fetching from API key ${keyIndex + 1}...`);

      // Try both endpoints
      const endpoints = [
        'https://api.samsara.com/fleet/vehicles/locations',
        'https://api.samsara.com/fleet/vehicles',
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            console.error(`Samsara API error (${endpoint}): ${response.status} ${response.statusText}`);
            continue;
          }

          const data = await response.json();
          const vehicles = data.data || [];
          console.log(`Fetched ${vehicles.length} vehicles from ${endpoint}`);

          // Add vehicles with their API source
          vehicles.forEach((v: any) =>
            allVehicles.push({
              ...v,
              apiKeyIndex: keyIndex,
            })
          );

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
    allVehicles.slice(0, 10).forEach((v) => {
      console.log(`  "${v.name}" (ID: ${v.id})`);
    });

    // Log sample truck numbers for debugging
    console.log('\n=== SAMPLE TRUCK NUMBERS ===');
    (trucks || []).slice(0, 10).forEach((t) => {
      console.log(`  "${t.truck_number}" (ID: ${t.id})`);
    });

    // Match vehicles with trucks using flexible matching
    const allLocations: any[] = [];
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
            const now = new Date();
            const timestamp =
              location.time ||
              `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
                now.getDate()
              ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
                now.getMinutes()
              ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

            allLocations.push({
              truck_id: truck.id,
              truck_number: truck.truck_number,
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: timestamp,
              speed: location.speed || 0,
              ageMinutes: ageMinutes,
              isValid: isFresh,
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
      JSON.stringify({
        locations: allLocations,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in samsara-locations function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Flexible truck name matching with multiple variants
 * Uses strict matching first, then falls back to pattern matching
 */
function findMatchingVehicle(vehicles: any[], truckNumber: string): any | null {
  if (!truckNumber) {
    console.log('  Empty truck number provided');
    return null;
  }

  // Normalize truck number and create variants
  const norm = String(truckNumber).replace(/^#/, '').trim();
  const pad4 = norm.padStart(4, '0');

  // STRICT exact match variants (must match exactly)
  const strictVariants = [
    `TRUCK ${pad4}`,
    `TRUCK #${pad4}`,
    `TRUCK${pad4}`,
    `TRUCK #${norm}`,
    `TRUCK ${norm}`,
    `TRUCK${norm}`,
    pad4,
    norm,
    String(truckNumber),
  ];

  console.log(`  Trying strict variants for "${truckNumber}": ${strictVariants.slice(0, 5).join(', ')}...`);

  // First pass: STRICT exact match only
  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;

    const vehicleName = String(vehicle.name).toUpperCase().trim();

    // Check each variant for exact match
    for (const variant of strictVariants) {
      const variantUpper = variant.toUpperCase();

      // Exact match only
      if (vehicleName === variantUpper) {
        console.log(`  ✓ EXACT match found: "${vehicle.name}" === "${variant}"`);
        console.log(`  Location: lat=${vehicle.location?.latitude || vehicle.gps?.latitude}, lon=${vehicle.location?.longitude || vehicle.gps?.longitude}`);
        return vehicle;
      }
    }
  }

  // Second pass: Pattern match for "TRUCK XXXX" where XXXX exactly matches the number
  // This ensures we don't match "TRUCK 17572" when looking for "TRUCK 7572"
  const truckExactPattern = new RegExp(`^TRUCK\\s*#?0*${norm}$`, 'i');
  const truckWithSuffixPattern = new RegExp(`^TRUCK\\s*#?0*${norm}\\s*[-\\s]`, 'i');
  
  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;

    const vehicleName = String(vehicle.name).toUpperCase().trim();

    // Match exact truck pattern (TRUCK 7572) or with suffix (TRUCK 7572 - Description)
    if (truckExactPattern.test(vehicleName) || truckWithSuffixPattern.test(vehicleName)) {
      console.log(`  ✓ PATTERN match found: "${vehicle.name}" matches truck pattern for ${norm}`);
      console.log(`  Location: lat=${vehicle.location?.latitude || vehicle.gps?.latitude}, lon=${vehicle.location?.longitude || vehicle.gps?.longitude}`);
      return vehicle;
    }
  }

  // Third pass: Check for number at word boundary but NOT as part of a larger number
  // e.g., "TRUCK 7572" should match, but "TRUCK 17572" or "TRUCK 75721" should NOT
  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;

    const vehicleName = String(vehicle.name).toUpperCase().trim();

    // Create a regex that matches the number as a complete number (not part of a larger number)
    // The lookbehind ensures it's not preceded by a digit, the lookahead ensures it's not followed by a digit
    const completeNumberPattern = new RegExp(`(?<![0-9])0*${norm}(?![0-9])`, 'i');
    
    if (completeNumberPattern.test(vehicleName)) {
      // Verify this isn't a different truck with a similar number
      const allNumbers = vehicleName.match(/\d+/g) || [];
      const foundExactNumber = allNumbers.some(n => 
        n === norm || 
        n === pad4 || 
        n.replace(/^0+/, '') === norm.replace(/^0+/, '')
      );
      
      if (foundExactNumber) {
        console.log(`  ✓ NUMBER BOUNDARY match found: "${vehicle.name}" contains exact number ${norm}`);
        console.log(`  Location: lat=${vehicle.location?.latitude || vehicle.gps?.latitude}, lon=${vehicle.location?.longitude || vehicle.gps?.longitude}`);
        return vehicle;
      }
    }
  }

  console.log(`  ✗ No match found for truck ${norm}`);
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
