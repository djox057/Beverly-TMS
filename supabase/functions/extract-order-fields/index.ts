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
  puNumber?: string;  // Pickup number
  poNumber?: string;  // Purchase order number
  shipper?: string;   // Shipper/Receiver name
}

interface ExtractedOrderData {
  brokerLoadNumber?: string;
  internalLoadNumber?: string;
  broker?: string;
  brokerName?: string;
  brokerAddress?: string;
  brokerNameCandidates?: string[];  // NEW: Multiple broker name options
  brokerAddressCandidates?: string[];  // NEW: Multiple address options
  matchedBrokerId?: string;
  // Support for multiple pickups
  pickups?: PickupDeliveryStop[];
  // Support for multiple deliveries
  deliveries?: PickupDeliveryStop[];
  // Legacy single pickup/delivery fields (for backward compatibility)
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupDate?: string;
  pickupStartDate?: string;
  pickupEndDate?: string;
  pickupStartTime?: string;
  pickupEndTime?: string;
  pickupPuNumber?: string;  // Pickup number
  pickupPoNumber?: string;  // Purchase order number
  pickupShipper?: string;   // Shipper name
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryDate?: string;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
  deliveryStartTime?: string;
  deliveryEndTime?: string;
  deliveryPoNumber?: string;  // Purchase order number for delivery
  deliveryShipper?: string;   // Receiver name
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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Parse the multipart form data
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) {
      throw new Error('No PDF file provided in form data');
    }

    if (pdfFile.type !== 'application/pdf') {
      throw new Error('File must be a PDF');
    }

    console.log('Processing PDF file:', pdfFile.name, 'Size:', pdfFile.size);

    // Convert PDF to base64 for inline transmission
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);
    
    console.log('PDF buffer size:', pdfBuffer.length);
    console.log('Converting PDF to base64...');

    // Convert to base64 in chunks to avoid stack overflow
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < pdfBuffer.length; i += chunkSize) {
      const chunk = pdfBuffer.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Pdf = btoa(binaryString);
    
    console.log('PDF converted to base64, length:', base64Pdf.length);

    // Compressed system prompt with broker candidates
    const systemPrompt = `Extract shipping/logistics data from PDFs. Use OCR for scanned images.

## BROKER INFO (EXTRACT FIRST!)
- Look at TOP of document (header, letterhead)
- Extract broker name + address from header
- If multiple variations found (e.g. "CH ROBINSON", "C.H. ROBINSON WORLDWIDE"), return ALL in brokerNameCandidates array
- Return full address in brokerAddressCandidates array
Example: {"brokerNameCandidates": ["TQL", "TOTAL QUALITY LOGISTICS"], "brokerAddressCandidates": ["6275 Hazeltine National Dr, Orlando, FL 32822"]}

## CRITICAL: CARRIER ≠ PICKUP/DELIVERY
- NEVER use carrier address/city/state/zip for pickup or delivery locations
- Carrier = trucking company info (ignore for addresses)
- Pickup/delivery addresses come from sections labeled "PU", "SO", "Pickup", "Delivery"

## PICKUPS VS DELIVERIES (MUST HAVE 1+ OF EACH!)
PICKUPS: Labels "PU", "PICKUP", "Origin", "Shipper", or earlier dates
DELIVERIES: Labels "SO", "STOP", "DELIVERY", "Consignee", or later dates
VALIDATE: Must return at least 1 pickup AND 1 delivery

## EXTRACT ALL FIELDS
- brokerLoadNumber, freightAmount (number only), mileage, commodity (max 4 words), weight, equipment, temperature
- For each pickup/delivery: shipper name, address, city, state, zip, date, time, puNumber, poNumber

## ADDRESS CLEANING (MANDATORY!)
REMOVE: Everything after " - ", dock instructions (DOCK DOORS, LOADING DOCK, USE GATE), delivery notes (CALL AHEAD, SEE NOTES)
KEEP: Street number, street name, Suite/Building/Plant identifiers
ZIP: MUST extract 5 or 9-digit zip code
Examples:
- "1000 KREIDER DR STE 200 - DOCK DOORS 3-5" → "1000 KREIDER DR STE 200"
- "123 MAIN ST REAR DOCK" → "123 MAIN ST"

## ADDRESS PARSING
- Remove facility IDs (BLDG/DC + numbers) before street number
- Find 3-5 digit street number = address start
- City goes ONLY in "city" field, not in "address"
- Format: {"address": "123 Main St", "city": "Chicago", "state": "IL", "zip": "60601"}

## OUTPUT FORMAT
Return JSON with these fields:
{
  "brokerNameCandidates": ["NAME1", "NAME2"],  // All broker name variations found
  "brokerAddressCandidates": ["ADDRESS"],
  "brokerLoadNumber": "12345",
  "pickups": [{"address": "123 Main", "city": "Chicago", "state": "IL", "zip": "60601", "date": "2025-01-15", "startTime": "08:00", "endTime": "12:00", "shipper": "Company", "puNumber": "PU123", "poNumber": "PO456"}],
  "deliveries": [{"address": "456 Oak", "city": "Detroit", "state": "MI", "zip": "48201", "date": "2025-01-16", "startTime": "14:00", "endTime": "18:00", "shipper": "Receiver", "poNumber": "PO789"}],
  "freightAmount": 2000,
  "mileage": 500,
  "commodity": "Goods",
  "weight": 40000,
  "equipment": "53' Dry Van",
  "temperature": "Ambient"
}`;

    console.log('Calling Gemini API for PDF extraction...');
    
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: systemPrompt + '\n\nPlease analyze this shipping/logistics PDF document (which may be a scanned image) and extract ALL available order information using OCR if needed. Return ONLY the JSON object with the data you can find. No explanations, no markdown formatting, just pure JSON.'
              },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Pdf
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16384,
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
    
    // Log the full response structure for debugging
    console.log('Full Gemini response:', JSON.stringify(aiData, null, 2));
    
    // Check for prompt feedback (blocked by safety filters)
    if (aiData.promptFeedback?.blockReason) {
      console.error('Prompt was blocked:', aiData.promptFeedback);
      throw new Error(`Gemini blocked the request: ${aiData.promptFeedback.blockReason}`);
    }
    
    // Check if there are candidates
    if (!aiData.candidates || aiData.candidates.length === 0) {
      console.error('No candidates in response:', aiData);
      throw new Error('Gemini returned no candidates. The PDF might be too complex or the content triggered safety filters.');
    }
    
    const candidate = aiData.candidates[0];
    
    // Check for finish reason
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

    // Parse the JSON response
    let extractedData: ExtractedOrderData;
    try {
      // Clean up the response in case it has markdown formatting
      let cleanContent = extractedContent;
      if (extractedContent.includes('```json')) {
        const match = extractedContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          cleanContent = match[1];
        }
      } else if (extractedContent.includes('```')) {
        const match = extractedContent.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
          cleanContent = match[1];
        }
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
      
      // Check if we have legacy pickup fields
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
        console.log('✅ Converted legacy pickup to array format');
      }
      
      // Check if we have legacy delivery fields
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
        console.log('✅ Converted legacy delivery to array format');
      }
    }

    // Sort pickups and deliveries by datetime
    if (extractedData.pickups && extractedData.pickups.length > 1) {
      extractedData.pickups.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
      console.log('Sorted pickups by datetime');
    }
    
    if (extractedData.deliveries && extractedData.deliveries.length > 1) {
      extractedData.deliveries.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
      console.log('Sorted deliveries by datetime');
    }

    // CRITICAL VALIDATION: Ensure at least 1 pickup and 1 delivery
    const pickupCount = extractedData.pickups?.length || 0;
    const deliveryCount = extractedData.deliveries?.length || 0;
    
    console.log('=== EXTRACTION VALIDATION ===');
    console.log(`Found ${pickupCount} pickup(s) and ${deliveryCount} delivery(ies)`);
    console.log('Pickups:', JSON.stringify(extractedData.pickups || [], null, 2));
    console.log('Deliveries:', JSON.stringify(extractedData.deliveries || [], null, 2));
    
    // Auto-correction if validation fails
    if (pickupCount === 0 || deliveryCount === 0) {
      console.warn('⚠️ VALIDATION FAILED: Missing pickups or deliveries. Attempting auto-correction...');
      
      // Combine all stops and sort by date/time
      const allStops = [
        ...(extractedData.pickups || []).map(s => ({ ...s, type: 'pickup' })),
        ...(extractedData.deliveries || []).map(s => ({ ...s, type: 'delivery' }))
      ].sort((a, b) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
      
      console.log('All stops sorted by date:', JSON.stringify(allStops, null, 2));
      
      if (allStops.length >= 2) {
        // If we have 2+ stops, split them: first = pickup, rest = deliveries
        const { type: _, ...firstStop } = allStops[0];
        const remainingStops = allStops.slice(1).map(({ type: _, ...stop }) => stop);
        
        extractedData.pickups = [firstStop];
        extractedData.deliveries = remainingStops;
        
        console.log(`✅ Auto-corrected: ${extractedData.pickups.length} pickup(s), ${extractedData.deliveries.length} delivery(ies)`);
      } else if (allStops.length === 1) {
        // Only 1 stop found - document is incomplete
        console.error('❌ Only 1 stop found in document. Cannot create valid load.');
        throw new Error('Document contains only 1 location. A valid load requires at least 1 pickup and 1 delivery location. Please check the document and try again.');
      } else {
        // No stops found at all
        console.error('❌ No location stops found in document.');
        throw new Error('No pickup or delivery locations could be found in the document. Please ensure the document contains location information and try again.');
      }
    }
    
    // Final validation check
    const finalPickupCount = extractedData.pickups?.length || 0;
    const finalDeliveryCount = extractedData.deliveries?.length || 0;
    
    console.log(`Final validation: ${finalPickupCount} pickup(s), ${finalDeliveryCount} delivery(ies)`);
    
    if (finalPickupCount === 0 || finalDeliveryCount === 0) {
      console.error('❌ Auto-correction failed. Still missing pickups or deliveries.');
      throw new Error('Unable to extract valid pickup and delivery information. Every load must have at least 1 pickup and 1 delivery. The document may be incomplete or in an unsupported format.');
    }
    
    console.log('✅ Validation passed!');

    // Broker matching is now handled on the frontend using brokerNameCandidates
    console.log('📋 Broker info extracted:');
    console.log('  Broker name candidates:', extractedData.brokerNameCandidates);
    console.log('  Broker address candidates:', extractedData.brokerAddressCandidates);

    // Validate that we extracted some meaningful data
    const meaningfulFields = Object.entries(extractedData).filter(([key, value]) => {
      return value !== null && 
             value !== undefined && 
             value !== '' && 
             (typeof value !== 'string' || value.trim().length > 0);
    });

    console.log(`Found ${meaningfulFields.length} fields with data:`, meaningfulFields.map(([key]) => key));

    if (meaningfulFields.length === 0) {
      throw new Error('No meaningful data could be extracted from the PDF');
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        fieldsExtracted: meaningfulFields.length,
        message: `Successfully extracted ${meaningfulFields.length} fields from PDF`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in extract-order-fields function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to extract data from PDF'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});