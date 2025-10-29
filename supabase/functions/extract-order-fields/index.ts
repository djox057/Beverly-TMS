import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Just echo back - no processing
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: {
          brokerLoadNumber: '',
          brokerNameCandidates: [],
          brokerAddressCandidates: [],
          pickups: [],
          deliveries: [],
          freightAmount: 0,
          mileage: 0,
          commodity: '',
          weight: 0,
          equipment: ''
        },
        message: 'PDF extraction moved to client-side'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
