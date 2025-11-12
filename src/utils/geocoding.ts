export interface Coordinates {
  latitude: number;
  longitude: number;
}

// In-memory cache with 24-hour TTL to drastically reduce edge function calls
const geocodeCache = new Map<string, { coords: Coordinates; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Batch geocoding requests to reduce edge function invocations
let geocodingQueue: Array<{
  address: string;
  resolve: (value: Coordinates | null) => void;
}> = [];
let geocodingTimer: NodeJS.Timeout | null = null;

const processBatchGeocoding = async () => {
  const batch = geocodingQueue;
  geocodingQueue = [];
  geocodingTimer = null;

  if (batch.length === 0) return;

  // Group by unique addresses to deduplicate
  const uniqueAddresses = new Map<string, Array<(value: Coordinates | null) => void>>();
  
  for (const { address, resolve } of batch) {
    const normalizedAddress = address.trim().toLowerCase();
    if (!uniqueAddresses.has(normalizedAddress)) {
      uniqueAddresses.set(normalizedAddress, []);
    }
    uniqueAddresses.get(normalizedAddress)!.push(resolve);
  }

  // Process each unique address
  const { supabase } = await import('@/integrations/supabase/client');
  
  for (const [address, resolvers] of uniqueAddresses.entries()) {
    try {
      const { data, error } = await supabase.functions.invoke('geocode-address', {
        body: { address }
      });

      const result = (error || !data?.success) ? null : {
        latitude: data.latitude,
        longitude: data.longitude
      };

      // Cache the result
      if (result) {
        geocodeCache.set(address, { coords: result, timestamp: Date.now() });
      }

      // Resolve all waiting promises for this address
      resolvers.forEach(resolve => resolve(result));
    } catch (error) {
      console.error('Batch geocoding error:', error);
      resolvers.forEach(resolve => resolve(null));
    }
  }
};

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === '') {
    return null;
  }

  const normalizedAddress = address.trim().toLowerCase();

  // Check in-memory cache first
  const cached = geocodeCache.get(normalizedAddress);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log('✅ Using in-memory geocoding cache for:', address);
    return cached.coords;
  }

  // Add to batch queue
  return new Promise((resolve) => {
    geocodingQueue.push({ address: normalizedAddress, resolve });

    // Debounce: wait 50ms for more requests before processing
    if (geocodingTimer) {
      clearTimeout(geocodingTimer);
    }
    geocodingTimer = setTimeout(processBatchGeocoding, 50);
  });
}
