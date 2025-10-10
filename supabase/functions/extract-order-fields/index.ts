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

    // Prepare the system prompt with all extraction instructions
    const systemPrompt = `You are an expert at extracting shipping/logistics data from PDF documents, including scanned images and PDFs without selectable text. Use OCR capabilities to read any text in images.

CRITICAL: First, analyze the document to determine if this is a SINGLE-DROP or MULTI-DROP load.

Multi-drop indicators:
- Multiple pickup addresses listed
- Multiple delivery addresses listed  
- Words like "multi-stop", "multi-drop", "multiple stops"
- Stop numbers (Stop 1, Stop 2, etc.)
- Multiple dates/times for pickups or deliveries

SHIPPER AND RECEIVER NAME EXTRACTION (CRITICAL):
- ALWAYS extract the company/facility name for pickup locations (shipper name)
- ALWAYS extract the company/facility name for delivery locations (receiver name)
- Look for these in sections labeled: "Shipper", "Pickup Location", "Origin", "From", "Consignor"
- Look for these in sections labeled: "Receiver", "Consignee", "Delivery Location", "Destination", "To"
- Company names are often the first line of an address block or appear near location details
- Examples: "ABC Warehouse", "XYZ Distribution Center", "Walmart DC #1234", "Target Store #567"

If MULTI-DROP is detected:
- Extract ALL pickup stops into the "pickups" array
- Extract ALL delivery stops into the "deliveries" array
- Each stop should have: address, city, state, zip, date, startTime, endTime, shipper (company name)

If SINGLE-DROP (standard load):
- Use the legacy single fields: pickupAddress, pickupCity, pickupState, etc.
- MUST include pickupShipper (company name for pickup)
- MUST include deliveryShipper (company name for delivery/receiver)

Extract ALL available information and return ONLY a valid JSON object with the exact field names specified. Do not include any markdown formatting or explanations.

CRITICAL ADDRESS EXTRACTION RULES FOR GEOCODING COMPATIBILITY:

ADDRESS PRIORITY (ALWAYS TRY FOR FULL ADDRESS FIRST):
1. BEST: Extract FULL address with ALL components available:
   - address: Street number + street name (e.g., "123 Main St", "4567 Industrial Blvd")
   - city: City name only (e.g., "Houston", "Los Angeles")
   - state: 2-letter state code (e.g., "TX", "CA")
   - zip: ZIP code (e.g., "77001" or "77001-1234")
   Example: address="123 Main St", city="Houston", state="TX", zip="77001"

2. GOOD: If street address unavailable, extract city + state + zip:
   - address: Leave empty or null
   - city: City name (REQUIRED)
   - state: 2-letter code (REQUIRED)
   - zip: ZIP code
   Example: city="Houston", state="TX", zip="77001"

3. ACCEPTABLE: If only city and state are visible:
   - address: Leave empty or null
   - city: City name (REQUIRED)
   - state: 2-letter code (REQUIRED)
   - zip: Leave empty if not found
   Example: city="Houston", state="TX"

4. AVOID: DO NOT return ONLY street address without city/state - this cannot be geocoded
   - BAD: address="123 Main St" with no city/state
   - If you see only a street, try to find the city/state elsewhere in the document

CRITICAL PARSING RULES:
- city: Extract ONLY the city name (e.g., "Houston", "Los Angeles", "New York")
- state: Extract ONLY the 2-letter state code (e.g., "TX", "CA", "NY")
- zip: Extract zip code with these rules:
  * If 5 digits or fewer, return as-is (e.g., "77001")
  * If more than 5 digits, format as ZIP+4 with hyphen (e.g., "77001-1234")
  * Remove any spaces or extra characters
- DO NOT include country names (USA, United States, etc.) in any address field
- DO NOT include ZIP codes, suite numbers, or other components in city/state fields
- DO NOT swap city and state values
- DO NOT return partial street addresses without city/state

EXAMPLES of correct city/state extraction:
- "123 Main St, Houston, TX 77001" → city: "Houston", state: "TX"
- "Suite 200, 456 Oak Ave, Los Angeles, CA 90210" → city: "Los Angeles", state: "CA"

IMPORTANT: When extracting dates, convert them to YYYY-MM-DD format correctly. For example:
- 09/24/25 becomes 2025-09-24
- 9/24/2025 becomes 2025-09-24  
- Sep 24, 2025 becomes 2025-09-24

For MULTI-DROP loads, return JSON like:
{
  "brokerLoadNumber": "string",
  "pickups": [
    {
      "address": "street address only",
      "city": "city name only",
      "state": "2-letter code",
      "zip": "zip code",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "puNumber": "pickup/appointment number",
      "poNumber": "purchase order number",
      "shipper": "COMPANY NAME (e.g., 'ABC Warehouse', 'XYZ Distribution')"
    }
  ],
  "deliveries": [
    {
      "address": "street address only",
      "city": "city name only", 
      "state": "2-letter code",
      "zip": "zip code",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "poNumber": "purchase order number",
      "shipper": "COMPANY NAME (e.g., 'Target DC #123', 'Walmart Store')"
    }
  ],
  "freightAmount": number,
  "mileage": number,
  "commodity": "string - MAXIMUM 4 WORDS, be concise (e.g., 'Auto Parts', 'Fresh Produce', 'Furniture')"
}

For SINGLE-DROP loads, return JSON with legacy fields:
{
  "brokerLoadNumber": "string",
  "pickupAddress": "string - complete pickup street address (without city/state/zip)",
  "pickupCity": "string - ONLY the pickup city name",
  "pickupState": "string - ONLY the 2-letter pickup state code",
  "pickupZip": "string - pickup ZIP code",
  "pickupDate": "string - pickup date in YYYY-MM-DD format",
  "pickupTime": "pickup time (HH:MM format, if only one time is given)",
  "pickupStartTime": "pickup start time (HH:MM format, if time range is given)",
  "pickupEndTime": "pickup end time (HH:MM format, if time range is given)",
  "pickupPuNumber": "pickup/appointment number",
  "pickupPoNumber": "purchase order number for pickup",
  "pickupShipper": "COMPANY NAME for pickup (e.g., 'ABC Warehouse', 'XYZ Distribution Center')",
  "deliveryAddress": "string - complete delivery street address (without city/state/zip)",
  "deliveryCity": "string - ONLY the delivery city name", 
  "deliveryState": "string - ONLY the 2-letter delivery state code",
  "deliveryZip": "string - delivery ZIP code",
  "deliveryDate": "string - delivery date in YYYY-MM-DD format",
  "deliveryTime": "delivery time (HH:MM format, if only one time is given)",
  "deliveryStartTime": "delivery start time (HH:MM format, if time range is given)",
  "deliveryEndTime": "delivery end time (HH:MM format, if time range is given)",
  "deliveryPoNumber": "purchase order number for delivery",
  "deliveryShipper": "COMPANY NAME for delivery/receiver (e.g., 'Target Store #567', 'Costco DC')",
  "freightAmount": number,
  "mileage": number,
  "commodity": "string - MAXIMUM 4 WORDS, be concise (e.g., 'Auto Parts', 'Fresh Produce', 'Furniture')",
  "weight": number,
  "trailer": "string",
  "equipment": "string",
  "temperature": "string"
}`;

    // Call Gemini 2.5 Flash Lite API with inline PDF data
    console.log('Calling Gemini 2.5 Flash Lite for PDF analysis...');
    
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