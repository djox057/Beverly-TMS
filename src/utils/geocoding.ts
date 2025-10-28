export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === '') {
    return null;
  }

  try {
    // Call our edge function through Supabase client
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { address }
    });

    if (error) {
      console.error('Geocoding failed:', error);
      return null;
    }

    if (data?.success) {
      return {
        latitude: data.latitude,
        longitude: data.longitude
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}
