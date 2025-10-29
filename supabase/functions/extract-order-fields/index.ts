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

    // Convert PDF to base64
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);
    
    console.log('PDF buffer size:', pdfBuffer.length);

    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < pdfBuffer.length; i += chunkSize) {
      const chunk = pdfBuffer.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Pdf = btoa(binaryString);
    
    console.log('PDF converted to base64, length:', base64Pdf.length);

    // Compact optimized prompt (< 1000 tokens for memory efficiency)
    const systemPrompt = `Extract shipping data from PDF. Use OCR for scanned images.

**BROKER (Extract First):**
brokerNameCandidates: Array of possible broker names from document top/header (e.g. ["TQL", "C.H. Robinson"])
brokerAddressCandidates: Array of possible broker addresses
Broker = company issuing rate confirmation, NOT carrier/shipper/receiver

**PICKUP vs DELIVERY:**
"PU"/"PICKUP"/"Origin" = pickup | "SO"/"STOP"/"DEL"/"Consignee" = delivery
NEVER use carrier info for pickup/delivery - carrier is trucking company, not shipping location

**ADDRESS CLEANING:**
1. Remove after " - ": dock numbers, gates, instructions
2. Remove prefixes: BLDG, DC, WAREHOUSE, PLANT, DU, city names
3. Find street number (3-5 digits) - address starts here
4. Expand: N→North, Ave→Avenue, Blvd→Boulevard, Dr→Drive, St→Street, Ste→Suite
5. City goes in "city" field only, not "address"

Examples:
"BLDG 19 1904 N LECOMPTE - DOCK 5" → "1904 North Lecompte"
"123 MAIN AVE - AROUND BACK" → "123 Main Avenue"

**ZIP:** Extract 5 or 9-digit. Format 9-digit as "12345-6789". Infer from city/state if missing.

**REQUIRED:** brokerNameCandidates (array), brokerAddressCandidates (array), brokerLoadNumber, freightAmount, mileage, commodity (max 4 words), weight, equipment, shipper names

**OUTPUT (Single-drop):**
{
  "brokerNameCandidates": ["NAME1", "NAME2"],
  "brokerAddressCandidates": ["ADDR1", "ADDR2"],
  "brokerLoadNumber": "string",
  "pickupAddress": "street", "pickupCity": "city", "pickupState": "ST", "pickupZip": "12345",
  "pickupDate": "YYYY-MM-DD", "pickupStartTime": "HH:MM", "pickupEndTime": "HH:MM",
  "pickupShipper": "company",
  "deliveryAddress": "street", "deliveryCity": "city", "deliveryState": "ST", "deliveryZip": "12345",
  "deliveryDate": "YYYY-MM-DD", "deliveryStartTime": "HH:MM", "deliveryEndTime": "HH:MM",
  "deliveryShipper": "company",
  "freightAmount": 1250, "mileage": 450, "commodity": "max 4 words", "weight": 42000,
  "equipment": "string", "temperature": "string"
}

**OUTPUT (Multi-drop):**
{
  "brokerNameCandidates": ["NAME1"], "brokerAddressCandidates": ["ADDR1"],
  "brokerLoadNumber": "string",
  "pickups": [{"address":"street","city":"city","state":"ST","zip":"12345","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","shipper":"company"}],
  "deliveries": [{"address":"street","city":"city","state":"ST","zip":"12345","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","shipper":"company"}],
  "freightAmount": 1250, "mileage": 450, "commodity": "max 4 words", "weight": 42000,
  "equipment": "string", "temperature": "string"
}

Return ONLY JSON. No markdown. Use null for missing fields.`;

    console.log('Calling Gemini 1.5 Flash for PDF analysis...');
    
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt + '\n\nAnalyze this PDF and extract order information using OCR if needed. Return ONLY JSON - no markdown, no explanations.' },
            { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
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

    // Count extracted fields for response
    let fieldsExtracted = 0;
    const countFields = (obj: any, prefix = '') => {
      for (const key in obj) {
        if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
          if (Array.isArray(obj[key])) {
            obj[key].forEach((item: any, index: number) => countFields(item, `${prefix}${key}[${index}].`));
          } else if (typeof obj[key] === 'object') {
            countFields(obj[key], `${prefix}${key}.`);
          } else {
            fieldsExtracted++;
          }
        }
      }
    };
    countFields(extractedData);

    console.log(`✅ Extraction complete: ${fieldsExtracted} fields extracted`);

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        fieldsExtracted,
        message: `Successfully extracted ${fieldsExtracted} fields from PDF`
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
