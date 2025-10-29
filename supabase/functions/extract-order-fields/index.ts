import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PickupDeliveryStop {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  puNumber?: string;
  poNumber?: string;
  shipper?: string;
}

interface ExtractedOrderData {
  brokerLoadNumber?: string;
  internalLoadNumber?: string;
  broker?: string;
  brokerName?: string;
  brokerAddress?: string;
  brokerNameCandidates?: string[];
  brokerAddressCandidates?: string[];
  matchedBrokerId?: string;
  pickups?: PickupDeliveryStop[];
  deliveries?: PickupDeliveryStop[];
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupDate?: string;
  pickupStartDate?: string;
  pickupEndDate?: string;
  pickupStartTime?: string;
  pickupEndTime?: string;
  pickupPuNumber?: string;
  pickupPoNumber?: string;
  pickupShipper?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryDate?: string;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
  deliveryStartTime?: string;
  deliveryEndTime?: string;
  deliveryPoNumber?: string;
  deliveryShipper?: string;
  freightAmount?: number;
  mileage?: number;
  commodity?: string;
  weight?: number;
  trailer?: string;
  equipment?: string;
  temperature?: string;
}

serve(async (req) => {
  console.log('🚀 [1] Function called, method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let fileUri: string | null = null;
  
  try {
    console.log('🚀 [2] Getting API key');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    console.log('🚀 [3] Parsing FormData');
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) {
      throw new Error('No PDF file provided');
    }
    console.log('🚀 [4] PDF received:', pdfFile.name, pdfFile.size, 'bytes');

    // Upload to Gemini using simple Blob approach
    console.log('🚀 [5] Creating upload body');
    const boundary = `Boundary${Date.now()}`;
    const encoder = new TextEncoder();
    
    const uploadBody = new Blob([
      encoder.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n{"file":{"display_name":"${pdfFile.name}"}}\r\n`),
      encoder.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfFile,
      encoder.encode(`\r\n--${boundary}--`)
    ]);
    console.log('🚀 [6] Upload body created, size:', uploadBody.size);

    console.log('🚀 [7] Uploading to Gemini');
    const uploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: uploadBody
      }
    );
    console.log('🚀 [8] Upload response:', uploadResponse.status);

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error('❌ Upload error:', uploadResponse.status, errText);
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    fileUri = uploadData.file.uri;
    console.log('✅ [9] Uploaded:', fileUri);

    const systemPrompt = `Extract shipping data from PDF rate confirmation. Use OCR if needed.

**BROKER INFO (required):**
brokerNameCandidates: Array of broker names from top of document
brokerAddressCandidates: Array of broker addresses
brokerLoadNumber: Load/reference number

**STOPS:**
Extract pickups[] and deliveries[] arrays with: address, city, state, zip, date (YYYY-MM-DD), startTime, endTime, shipper
Clean addresses: remove dock/gate info after "-", expand abbreviations (N→North, Ave→Avenue)
ZIP: 5 or 9 digits (format: 12345-6789)

**OTHER FIELDS:**
freightAmount (number), mileage (number), commodity (max 4 words), weight (number), equipment, temperature

**OUTPUT:**
{
  "brokerNameCandidates": ["NAME"],
  "brokerAddressCandidates": ["ADDRESS"],
  "brokerLoadNumber": "string",
  "pickups": [{"address":"","city":"","state":"","zip":"","date":"","startTime":"","endTime":"","shipper":""}],
  "deliveries": [{"address":"","city":"","state":"","zip":"","date":"","startTime":"","endTime":"","shipper":""}],
  "freightAmount": 0,
  "mileage": 0,
  "commodity": "",
  "weight": 0,
  "equipment": "",
  "temperature": ""
}

Return ONLY JSON. Use null for missing fields.`;

    console.log('🚀 [10] Calling Gemini AI');
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Gemini API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`Failed to analyze PDF with Gemini: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('✅ [11] Gemini response received');
    
    if (aiData.promptFeedback?.blockReason) {
      console.error('Prompt was blocked:', aiData.promptFeedback);
      throw new Error(`Gemini blocked the request: ${aiData.promptFeedback.blockReason}`);
    }
    
    if (!aiData.candidates || aiData.candidates.length === 0) {
      console.error('No candidates in response:', aiData);
      throw new Error('Gemini returned no candidates. The PDF might be too complex or the content triggered safety filters.');
    }
    
    const candidate = aiData.candidates[0];
    
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Unusual finish reason:', candidate.finishReason);
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Content generation was blocked by safety filters');
      }
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('PDF is too complex and exceeded token limit. Try uploading a simpler or shorter PDF.');
      }
    }
    
    const extractedContent = candidate.content?.parts?.[0]?.text?.trim();
    
    if (!extractedContent) {
      console.error('No text content found in candidate:', JSON.stringify(candidate, null, 2));
      throw new Error('No content in AI response. The PDF might be unreadable or contain no extractable data.');
    }
    
    console.log('Gemini response content:', extractedContent);

    let extractedData: ExtractedOrderData;
    try {
      let cleanContent = extractedContent;
      if (extractedContent.includes('```json')) {
        const match = extractedContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      } else if (extractedContent.includes('```')) {
        const match = extractedContent.match(/```\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      }
      
      extractedData = JSON.parse(cleanContent);
      console.log('Successfully parsed extracted data:', extractedData);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Content that failed to parse:', extractedContent);
      throw new Error('Failed to parse AI response as JSON. The PDF might contain unexpected formatting.');
    }

    // Convert legacy single-stop format to array format if needed
    if (!extractedData.pickups && extractedData.pickupAddress) {
      extractedData.pickups = [{
        address: extractedData.pickupAddress,
        city: extractedData.pickupCity,
        state: extractedData.pickupState,
        zip: extractedData.pickupZip,
        date: extractedData.pickupDate || extractedData.pickupStartDate,
        startTime: extractedData.pickupStartTime,
        endTime: extractedData.pickupEndTime,
        puNumber: extractedData.pickupPuNumber,
        poNumber: extractedData.pickupPoNumber,
        shipper: extractedData.pickupShipper
      }];
    }

    if (!extractedData.deliveries && extractedData.deliveryAddress) {
      extractedData.deliveries = [{
        address: extractedData.deliveryAddress,
        city: extractedData.deliveryCity,
        state: extractedData.deliveryState,
        zip: extractedData.deliveryZip,
        date: extractedData.deliveryDate || extractedData.deliveryStartDate,
        startTime: extractedData.deliveryStartTime,
        endTime: extractedData.deliveryEndTime,
        poNumber: extractedData.deliveryPoNumber,
        shipper: extractedData.deliveryShipper
      }];
    }

    // Sort stops by datetime
    if (extractedData.pickups && extractedData.pickups.length > 1) {
      extractedData.pickups.sort((a, b) => {
        const dateA = new Date(`${a.date || '1970-01-01'} ${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date || '1970-01-01'} ${b.startTime || '00:00'}`);
        return dateA.getTime() - dateB.getTime();
      });
    }

    if (extractedData.deliveries && extractedData.deliveries.length > 1) {
      extractedData.deliveries.sort((a, b) => {
        const dateA = new Date(`${a.date || '1970-01-01'} ${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date || '1970-01-01'} ${b.startTime || '00:00'}`);
        return dateA.getTime() - dateB.getTime();
      });
    }

    // Validate and auto-correct pickup/delivery arrays
    const hasPickups = extractedData.pickups && extractedData.pickups.length > 0;
    const hasDeliveries = extractedData.deliveries && extractedData.deliveries.length > 0;

    if (!hasPickups && hasDeliveries && extractedData.deliveries!.length > 1) {
      console.log('Auto-correcting: Moving first delivery to pickup');
      extractedData.pickups = [extractedData.deliveries![0]];
      extractedData.deliveries = extractedData.deliveries!.slice(1);
    } else if (hasPickups && !hasDeliveries && extractedData.pickups!.length > 1) {
      console.log('Auto-correcting: Moving last pickup to delivery');
      extractedData.deliveries = [extractedData.pickups![extractedData.pickups!.length - 1]];
      extractedData.pickups = extractedData.pickups!.slice(0, -1);
    }

    const finalHasPickups = extractedData.pickups && extractedData.pickups.length > 0;
    const finalHasDeliveries = extractedData.deliveries && extractedData.deliveries.length > 0;

    if (!finalHasPickups || !finalHasDeliveries) {
      throw new Error('At least one pickup and one delivery location are required. Please ensure the PDF contains this information.');
    }

    console.log('✅ Extraction complete');

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        message: 'Successfully extracted PDF data'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } finally {
    // Cleanup: Delete uploaded file from Gemini
    if (fileUri) {
      try {
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiApiKey) {
          console.log('🧹 Cleaning up:', fileUri);
          const fileName = fileUri.split('/').pop();
          await fetch(
            `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${geminiApiKey}`,
            { method: 'DELETE' }
          );
          console.log('✅ File deleted');
        }
      } catch (cleanupError) {
        console.error('⚠️ Cleanup failed:', cleanupError);
      }
    }
  }
});
