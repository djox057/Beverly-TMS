import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeRequest {
  address?: string;
  addresses?: string[]; // Support batch requests
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, addresses }: GeocodeRequest = await req.json();
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Handle batch requests
    if (addresses && Array.isArray(addresses)) {
      console.log(`🔍 Batch geocoding ${addresses.length} addresses`);
      
      const results = await Promise.all(
        addresses.map(async (addr) => {
          try {
            // Check cache first
            const { data: cached } = await supabase
              .from('geocoding_cache')
              .select('latitude, longitude')
              .eq('address', addr)
              .maybeSingle();
            
            if (cached) {
              console.log('✅ Cache hit for:', addr);
              supabase
                .from('geocoding_cache')
                .update({ hit_count: (cached as any).hit_count + 1 })
                .eq('address', addr)
                .then();
              
              return {
                address: addr,
                success: true,
                latitude: parseFloat(cached.latitude as any),
                longitude: parseFloat(cached.longitude as any)
              };
            }

            // Geocode with rate limiting (1 per second for Nominatim)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const encodedAddress = encodeURIComponent(addr);
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;
            
            const response = await fetch(nominatimUrl, {
              headers: { 'User-Agent': 'TruckingApp/1.0' }
            });

            if (!response.ok) {
              return { address: addr, success: false, error: 'Geocoding failed' };
            }

            const data = await response.json();
            
            if (data && data.length > 0) {
              const result = {
                address: addr,
                success: true,
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
              };
              
              supabase
                .from('geocoding_cache')
                .insert({
                  address: addr,
                  latitude: result.latitude,
                  longitude: result.longitude
                })
                .then();
              
              return result;
            }

            return { address: addr, success: false, error: 'No results found' };
          } catch (error) {
            return { address: addr, success: false, error: String(error) };
          }
        })
      );
      
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Handle single address request (original behavior)
    if (!address || address.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check cache first
    const { data: cached } = await supabase
      .from('geocoding_cache')
      .select('latitude, longitude')
      .eq('address', address)
      .maybeSingle();
    
    if (cached) {
      console.log('✅ Cache hit for:', address);
      supabase
        .from('geocoding_cache')
        .update({ hit_count: (cached as any).hit_count + 1 })
        .eq('address', address)
        .then();
      
      return new Response(
        JSON.stringify({
          success: true,
          latitude: parseFloat(cached.latitude as any),
          longitude: parseFloat(cached.longitude as any)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Geocoding address:', address);

    const encodedAddress = encodeURIComponent(address);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;
    
    console.log('📍 Calling Nominatim:', nominatimUrl);

    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'TruckingApp/1.0'
      }
    });

    if (!response.ok) {
      console.error('❌ Nominatim request failed:', response.statusText);
      return new Response(
        JSON.stringify({ error: 'Geocoding failed' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = {
        success: true,
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
      console.log('✅ Geocoded successfully:', result);
      
      supabase
        .from('geocoding_cache')
        .insert({
          address,
          latitude: result.latitude,
          longitude: result.longitude
        })
        .then();
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⚠️ No results found for address');
    return new Response(
      JSON.stringify({ success: false, error: 'No results found' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Geocoding error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
