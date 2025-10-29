import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple text cleanup
function cleanText(text: string): string {
  return text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Minimal regex extraction
function quickExtract(text: string) {
  const clean = cleanText(text);
  
  const loadMatch = clean.match(/(?:load|ref)[#:\s]*(\d{6,})/i);
  const dateMatches = [...clean.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)];
  const amountMatch = clean.match(/(?:rate|amount|total)[\s:$]*([\d,]+\.?\d*)/i);
  
  return {
    brokerLoadNumber: loadMatch?.[1] || '',
    brokerNameCandidates: [],
    brokerAddressCandidates: [],
    pickups: dateMatches[0] ? [{
      address: '', city: '', state: '', zip: '',
      date: dateMatches[0][1], startTime: '', endTime: '', shipper: '', pickupNumber: ''
    }] : [],
    deliveries: dateMatches[1] ? [{
      address: '', city: '', state: '', zip: '',
      date: dateMatches[1][1], startTime: '', endTime: '', shipper: '', deliveryNumber: ''
    }] : [],
    freightAmount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0,
    mileage: 0,
    commodity: '',
    weight: 0,
    equipment: ''
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('📄 Function started');

  try {
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) throw new Error('No file provided');
    
    const fileSize = pdfFile.size;
    console.log(`📊 File size: ${fileSize} bytes`);

    // Budget check - 300KB max
    if (fileSize > 300000) {
      console.log(`⚠️ File too large (${fileSize} bytes), returning minimal data`);
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
          path: 'edge-skip',
          warning: 'File too large - skipped extraction',
          elapsed: Date.now() - startTime
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Quick extraction for small files
    console.log('🚀 Quick extraction');
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const extracted = quickExtract(text);
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ Completed in ${elapsed}ms`);
    
    return new Response(
      JSON.stringify({ success: true, data: extracted, path: 'edge-fast', elapsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error after ${elapsed}ms:`, error);
    return new Response(
      JSON.stringify({ success: false, error: String(error), elapsed }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
