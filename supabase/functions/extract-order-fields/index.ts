import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Function started');

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('No API key');

    console.log('Parsing form data');
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) throw new Error('No file');
    console.log('File:', pdfFile.size, 'bytes');

    // Convert to base64 in chunks to avoid stack overflow
    console.log('Converting to base64');
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    console.log('Base64 created');

    console.log('Calling Gemini');
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Extract: brokerNameCandidates[], brokerAddressCandidates[], brokerLoadNumber, pickups[{address,city,state,zip,date,startTime,endTime,shipper}], deliveries[], freightAmount, mileage, commodity, weight, equipment. Return JSON only.' },
            { inline_data: { mime_type: 'application/pdf', data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', response.status, err);
      throw new Error(`Gemini failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let cleanText = text.trim();
    if (cleanText.includes('```json')) {
      const match = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) cleanText = match[1];
    } else if (cleanText.includes('```')) {
      const match = cleanText.match(/```\s*([\s\S]*?)\s*```/);
      if (match) cleanText = match[1];
    }

    const extracted = JSON.parse(cleanText);
    console.log('Success');

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
