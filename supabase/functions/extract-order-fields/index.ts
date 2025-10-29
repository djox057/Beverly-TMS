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
  console.log('Extract order fields function called, method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) {
      throw new Error('No PDF file provided in form data');
    }

    if (pdfFile.type !== 'application/pdf') {
      throw new Error('File must be a PDF');
    }

    console.log('Processing PDF file:', pdfFile.name, 'Size:', pdfFile.size);

    // For large PDFs, use Gemini's file upload API instead of inline data
    const useLargeFileAPI = pdfFile.size > 200000; // 200KB threshold
    
    if (useLargeFileAPI) {
      console.log('⚠️ Large PDF detected, using Gemini File API...');
    }

    let fileUri: string | null = null;
    let base64Pdf: string | null = null;

    if (useLargeFileAPI) {
      // Upload to Gemini Files API (handles large files better)
      const arrayBuffer = await pdfFile.arrayBuffer();
      const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'multipart',
        },
        body: (() => {
          const boundary = '----boundary';
          const metadataPart = JSON.stringify({ file: { display_name: pdfFile.name } });
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const parts = [
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadataPart,
            '\r\n--',
            boundary,
            '\r\n',
            'Content-Type: application/pdf\r\n\r\n',
          ];
          
          const textEncoder = new TextEncoder();
          const header = textEncoder.encode(parts.join(''));
          const footer = textEncoder.encode(`\r\n--${boundary}--`);
          
          const result = new Uint8Array(header.length + uint8Array.length + footer.length);
          result.set(header, 0);
          result.set(uint8Array, header.length);
          result.set(footer, header.length + uint8Array.length);
          
          return result;
        })(),
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      fileUri = uploadData.file.uri;
      console.log('✅ File uploaded to Gemini, URI:', fileUri);
    } else {
      // Small file: use inline base64
      const arrayBuffer = await pdfFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
      base64Pdf = btoa(binaryString);
      console.log('✅ Small file converted to base64');
    }

    // Optimized prompt - balanced between size and clarity (200-300 tokens)
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

    console.log('Calling Gemini 2.0 Flash Lite (optimized for speed and memory)...');
    
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: fileUri 
            ? [{ text: systemPrompt }, { file_data: { mime_type: 'application/pdf', file_uri: fileUri } }]
            : [{ text: systemPrompt }, { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }]
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
    console.log('Gemini response received');
    console.log('Full Gemini response:', JSON.stringify(aiData, null, 2));
    
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
      throw new Error(`Failed to parse extraction result: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }

    // Auto-convert legacy single-stop format to array format
    if (!extractedData.pickups && !extractedData.deliveries) {
      console.log('🔄 Detected legacy single-stop format, converting to array format...');
      
      if (extractedData.pickupCity || extractedData.pickupAddress) {
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
      
      if (extractedData.deliveryCity || extractedData.deliveryAddress) {
        extractedData.deliveries = [{
          address: extractedData.deliveryAddress,
          city: extractedData.deliveryCity,
          state: extractedData.deliveryState,
          zip: extractedData.deliveryZip,
          date: extractedData.deliveryDate || extractedData.deliveryStartDate,
          startTime: extractedData.deliveryStartTime,
          endTime: extractedData.deliveryEndTime,
          puNumber: undefined,
          poNumber: extractedData.deliveryPoNumber,
          shipper: extractedData.deliveryShipper
        }];
      }
    }

    // Sort stops by datetime
    if (extractedData.pickups && extractedData.pickups.length > 1) {
      extractedData.pickups.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
    }
    
    if (extractedData.deliveries && extractedData.deliveries.length > 1) {
      extractedData.deliveries.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
    }

    // Validate pickups and deliveries
    const pickupCount = extractedData.pickups?.length || 0;
    const deliveryCount = extractedData.deliveries?.length || 0;
    
    console.log('=== EXTRACTION VALIDATION ===');
    console.log(`Found ${pickupCount} pickup(s) and ${deliveryCount} delivery(ies)`);
    
    // Auto-correction if validation fails
    if (pickupCount === 0 || deliveryCount === 0) {
      console.warn('⚠️ VALIDATION FAILED: Missing pickups or deliveries. Attempting auto-correction...');
      
      const allStops = [
        ...(extractedData.pickups || []).map(s => ({ ...s, type: 'pickup' })),
        ...(extractedData.deliveries || []).map(s => ({ ...s, type: 'delivery' }))
      ].sort((a, b) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
      
      if (allStops.length >= 2) {
        const { type: _, ...firstStop } = allStops[0];
        const remainingStops = allStops.slice(1).map(({ type: _, ...stop }) => stop);
        
        extractedData.pickups = [firstStop];
        extractedData.deliveries = remainingStops;
        
        console.log(`✅ Auto-corrected: ${extractedData.pickups.length} pickup(s), ${extractedData.deliveries.length} delivery(ies)`);
      } else if (allStops.length === 1) {
        throw new Error('Document contains only 1 location. A valid load requires at least 1 pickup and 1 delivery location.');
      } else {
        throw new Error('No pickup or delivery locations could be found in the document.');
      }
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
    console.error('Error in extract-order-fields function:', error);
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
  }
});
