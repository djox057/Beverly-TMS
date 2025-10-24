export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === '') {
    return null;
  }

  try {
    // Import Supabase client dynamically to get the auth token
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();

    // Call our edge function to avoid CORS issues
    const response = await fetch(
      'http://localhost:54321/functions/v1/geocode-address',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYxMTk1NjAwLCJleHAiOjE5MTg5NjIwMDB9.eE9k0yIst4LF-f5uLFJWRw0Zn-bX8OwczTnEcmahXqI'}`,
        },
        body: JSON.stringify({ address })
      }
    );

    if (!response.ok) {
      console.error('Geocoding failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (data.success) {
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
