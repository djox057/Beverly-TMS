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

    // Prepare the system prompt with all extraction instructions
    const systemPrompt = `# Enhanced AI Extraction Prompt for Shipping/Logistics Documents

You are an expert at extracting shipping/logistics data from PDF documents, including scanned images and PDFs without selectable text. Use OCR capabilities to read any text in images.

## STEP 0: EXTRACT BROKER INFORMATION FIRST (HIGHEST PRIORITY!)

**⚠️ THIS IS THE MOST IMPORTANT INFORMATION - EXTRACT THIS BEFORE ANYTHING ELSE!**

**Broker Name Indicators (Company issuing the rate confirmation/load):**
- Look at the TOP of the document (header area, letterhead)
- Section headers: "Broker", "Carrier Agreement", "Rate Confirmation", "Load Confirmation", "From:", company logo/name at top
- This is usually the company sending you the load, NOT the shipper or receiver
- Common broker names: "TQL", "CH Robinson", "Coyote Logistics", "XPO Logistics", "Landstar", etc.
- Extract the FULL company name as it appears

**Broker Address Indicators:**
- Look near the broker name in the header
- Typically includes: street address, city, state, ZIP
- Format: Complete address (e.g., "6275 Hazeltine National Dr, Orlando, FL 32822")
- This is the broker's office address, NOT pickup/delivery locations

**CRITICAL: You MUST extract brokerName and brokerAddress and include them at the TOP of your JSON response before any other fields!**

Example of what to look for:
=====================================
ACME LOGISTICS LLC
6275 Hazeltine National Dr
Orlando, FL 32822
Phone: (407) 555-1234
=====================================
RATE CONFIRMATION
Load #: 12345
...

Extract: brokerName: "ACME LOGISTICS LLC", brokerAddress: "6275 Hazeltine National Dr, Orlando, FL 32822"

---

## STEP 1: DISTINGUISH PICKUPS FROM DELIVERIES (CRITICAL - READ THIS CAREFULLY!)

**⚠️ ABSOLUTE REQUIREMENT: Every load MUST have AT LEAST 1 pickup AND 1 delivery. NO EXCEPTIONS!**

**PICKUP Location Indicators (Origin/Shipper/From):**
- **Label patterns (MOST RELIABLE)**: "PU", "PU 1", "PU 2", "P1", "P2", "PICKUP", "PICKUP 1"
- Section headers: "Pick Up", "Pickup", "Origin", "Shipper", "From", "Load At", "Loading Point", "Consignor"
- Temporal: Earlier date/time in the document (first chronologically)

**DELIVERY Location Indicators (Destination/Consignee/To):**
- **Label patterns (MOST RELIABLE)**: "SO", "SO 1", "SO 2", "S1", "S2", "STOP", "STOP 1", "STOP 2", "DELIVERY", "DEL"
- **CRITICAL**: "SO" = "Stop Order" = DELIVERY (NOT a pickup!)
- Section headers: "Delivery", "Deliver", "Destination", "Consignee", "To", "Deliver To", "Unload At"
- Temporal: Later date/time in the document (after pickup chronologically)

**🔍 EXAMPLE FROM REAL DOCUMENT:**

PU 1  Name: Azteca Milling LP  Date: 10/13/2025 0900
      ↑ This is a PICKUP (has "PU 1" label)

SO 2  Name: DAWN KANSAS CITY    Date: 10/14/2025 1200
      ↑ This is a DELIVERY (has "SO 2" label, later date)

**STEP-BY-STEP EXTRACTION PROCESS:**
1. **Find ALL labeled locations** in the document (look for PU, SO, Stop, Pickup, Delivery labels)
2. **Classify each location:**
   - If label contains "PU", "PICKUP", or is the FIRST location chronologically → It's a PICKUP
   - If label contains "SO", "STOP", "DELIVERY", or is AFTER pickups chronologically → It's a DELIVERY
3. **Verify you have at least 1 pickup AND 1 delivery** before returning the JSON
4. **If you only find 1 location total**: The document is invalid/incomplete. Return an error.
5. **If you find 2+ locations but all seem like same type**: Re-examine the labels and dates carefully

**MANDATORY VALIDATION BEFORE RETURNING JSON:**
- ✅ At least 1 entry in "pickups" array
- ✅ At least 1 entry in "deliveries" array
- ❌ If validation fails: DO NOT return the JSON. Re-examine the document.

---

## STEP 2: DETERMINE LOAD TYPE

**After identifying pickups vs deliveries, determine if this is a SINGLE-DROP or MULTI-DROP load.**

**Multi-drop indicators:**
- Multiple pickup addresses listed (2+ origins)
- Multiple delivery addresses listed (2+ destinations)
- Words like "multi-stop", "multi-drop", "multiple stops"
- Stop numbers (Stop 1, Stop 2, etc.)
- Multiple dates/times for pickups or multiple dates/times for deliveries

---

## STEP 3: EXTRACT ALL REQUIRED FIELDS

### CRITICAL FIELDS THAT MUST ALWAYS BE EXTRACTED:

**For EVERY load (single or multi-drop):**
- ✅ **brokerLoadNumber** - Load/order reference number
- ✅ **freightAmount** - Payment amount (extract number only, remove $ and commas)
- ✅ **mileage** - Total miles (extract number only)
- ✅ **commodity** - Description of goods (MAXIMUM 4 WORDS)
- ✅ **weight** - Total weight in pounds (extract number only)
- ✅ **trailer** - Trailer type/number if specified
- ✅ **equipment** - Equipment type (e.g., "53' Dry Van", "Reefer", "Flatbed")
- ✅ **temperature** - Temperature requirements if applicable (e.g., "55-60°F", "Frozen", "Ambient")

**For SINGLE-DROP loads:**
- ✅ **pickupShipper** - Company name at pickup (e.g., "ABC Warehouse", "Walmart DC #1234")
- ✅ **pickupPuNumber** - Pickup/appointment number
- ✅ **pickupPoNumber** - Purchase order number for pickup
- ✅ **deliveryShipper** - Company name at delivery (e.g., "Target Store #567", "XYZ Distribution")
- ✅ **deliveryPoNumber** - Purchase order number for delivery

**For MULTI-DROP loads:**
- ✅ **shipper** - Company name for EACH pickup stop
- ✅ **puNumber** - Pickup number for EACH pickup stop
- ✅ **poNumber** - PO number for EACH pickup stop
- ✅ **shipper** - Company name for EACH delivery stop
- ✅ **poNumber** - PO number for EACH delivery stop

---

## STEP 3: SHIPPER AND RECEIVER NAME EXTRACTION (CRITICAL)

**ALWAYS extract company/facility names - these are REQUIRED fields:**

**For Pickup Locations (Shipper):**
- Look in sections labeled: "Shipper", "Pickup Location", "Origin", "From", "Consignor", "Pick Up From"
- Company names are typically the FIRST line of an address block
- May include facility identifiers: "Walmart DC #1234", "Target RDC #8172", "Amazon Fulfillment Center PHX5"
- Extract the FULL company name including any DC/store/facility numbers

**For Delivery Locations (Receiver):**
- Look in sections labeled: "Receiver", "Consignee", "Delivery Location", "Destination", "To", "Deliver To"
- Company names are typically the FIRST line of an address block
- May include store/location numbers: "Target Store #567", "Home Depot #2891"
- Extract the FULL company name including any store/location numbers

**If company name is not clearly visible:**
- Look for business names near the address
- Check for company names in headers or footers
- If absolutely no company name found, use "Unknown Shipper" or "Unknown Receiver"

---

## STEP 4: ADDRESS EXTRACTION AND CLEANING (CRITICAL FOR GEOCODING)

**🚨 MANDATORY: You MUST clean ALL addresses before extracting them into the JSON output.**
**🚨 CRITICAL: You MUST extract ZIP CODES - look carefully for 5 or 9-digit numbers near addresses.**

**STEP-BY-STEP ADDRESS CLEANING PROCESS:**

1. **Identify the raw address** in the document
2. **Remove everything after a dash (-)** if it contains instructions
3. **Remove dock/door numbers and instructions**
4. **Keep ONLY: street number, street name, suite/unit/building identifiers**
5. **Extract city, state, zip separately** (ZIP CODE IS MANDATORY - search thoroughly)

---

## WHAT TO REMOVE FROM ADDRESSES (CRITICAL)

**🚫 DELETE IMMEDIATELY - These patterns MUST be removed:**

### Pattern 1: Anything after " - " (dash with spaces)
- If you see " - " followed by instructions, DELETE everything from the dash onward
- Example: "123 Main St - AROUND BACK" → Keep only "123 Main St"

### Pattern 2: Dock/Door Instructions (ALWAYS REMOVE)
**Remove these EXACT phrases and similar variations:**
- "AROUND BACK DOCK DOORS" + any numbers
- "AROUND BACK DOCK DOOR" + any numbers
- "REAR DOCK DOORS" + any numbers
- "DOCK DOORS" + any numbers
- "LOADING DOCK" + any numbers
- "RECEIVING DOCK" + any numbers
- "USE DOCK" + any numbers
- "DOORS" + any numbers (when after address)

### Pattern 3: Gate Instructions
- "USE GATE" + letter/number
- "ENTER THROUGH" + any text
- "SOUTH GATE", "NORTH GATE", "EAST GATE", "WEST GATE"

### Pattern 4: Delivery Instructions
- "SEE NOTES"
- "CALL AHEAD"
- "APPOINTMENT REQUIRED"
- "ASK FOR" + name
- "CONTACT" + name/phone

---

## REAL EXAMPLES - STUDY THESE CAREFULLY

**Example 1 (MOST COMMON ERROR):**
❌ RAW: "1000 KREIDER DRIVE STE 200 - AROUND BACK DOCK DOORS 3, 4 & 5"
✅ CLEAN: "1000 KREIDER DRIVE STE 200"
- You MUST remove everything from " - " onward
- Final JSON: "address": "1000 KREIDER DRIVE STE 200"

**Example 2:**
❌ RAW: "2707 N BARNES AVE PLANT 5 - LOADING DOCK 12"
✅ CLEAN: "2707 N BARNES AVE PLANT 5"
- Keep Plant 5 (it's a building identifier)
- Remove " - LOADING DOCK 12" (it's an instruction)
- Final JSON: "address": "2707 N BARNES AVE PLANT 5"

**Example 3:**
❌ RAW: "500 INDUSTRIAL BLVD BUILDING B - USE SOUTH GATE - CALL AHEAD"
✅ CLEAN: "500 INDUSTRIAL BLVD BUILDING B"
- Keep Building B (it's part of address)
- Remove both instructions after dashes
- Final JSON: "address": "500 INDUSTRIAL BLVD BUILDING B"

**Example 4:**
❌ RAW: "123 MAIN ST REAR DOCK DOORS 5 & 6"
✅ CLEAN: "123 MAIN ST"
- Remove "REAR DOCK DOORS 5 & 6" completely
- Final JSON: "address": "123 MAIN ST"

---

## WHAT TO KEEP IN ADDRESSES

**✅ These ARE part of the address - DO NOT remove:**
- Street numbers: "123", "2707", "1000"
- Street names: "Main St", "Barnes Ave", "Kreider Drive"
- Suite identifiers: "STE 200", "Suite 200", "Suite 5"
- Building identifiers: "Building A", "Building B", "Bldg 3"
- Plant identifiers: "Plant 5", "Plant A"
- Unit numbers: "Unit 15", "Unit A"

---

## FINAL ADDRESS FORMAT

After cleaning, your address JSON should look like:

{
  "address": "STREET_NUMBER STREET_NAME [SUITE/BUILDING/PLANT]",
  "city": "CITY_NAME",
  "state": "ST",
  "zip": "12345"
}

**Example of CORRECT output:**

{
  "address": "1000 KREIDER DRIVE STE 200",
  "city": "MIDDLETOWN", 
  "state": "PA",
  "zip": "17057"
}

**ZIP CODE EXTRACTION EXAMPLES:**
- "MIDDLETOWN, PA 17057" → zip: "17057"
- "HOUSTON TX 77001-1234" → zip: "77001-1234"
- "CHICAGO, IL 60601" → zip: "60601"
- "EAGLE LAKE, TX" (no zip in doc) → Use your knowledge: zip: "77434" (central zip for Eagle Lake, TX)
- "CHICAGO, IL" (no zip in doc) → Use your knowledge: zip: "60601" (central/downtown Chicago zip)
- **CRITICAL**: If zip not found in document, USE YOUR AI KNOWLEDGE to infer a common/central zip code for that city and state. ALWAYS provide a zip when city and state are available.

---

## VALIDATION CHECKLIST

Before returning your JSON, verify EACH address:
- ❓ Does address contain " - " ? → If yes, remove everything after it
- ❓ Does address mention "DOCK" or "DOORS"? → If yes, remove that part
- ❓ Does address mention "GATE"? → If yes, remove that part
- ❓ Does address have instructions? → If yes, remove them
- ✅ Address should be: street number + street name + suite/building/plant ONLY
- ✅ ZIP CODE: Did you extract the zip code? Search near the state code for 5 or 9 digits. If not found, infer from city/state using your knowledge.

### 2. GOOD: If street address unavailable, extract city + state + zip

address: "" or null
city: City name (REQUIRED)
state: 2-letter code (REQUIRED)
zip: ZIP code

**Example:** city="Houston", state="TX", zip="77001"

### 3. ACCEPTABLE: If only city and state are visible

address: "" or null
city: City name (REQUIRED)
state: 2-letter code (REQUIRED)
zip: "" or null

**Example:** city="Houston", state="TX"

### 4. AVOID: DO NOT return ONLY street address without city/state
- ❌ BAD: address="123 Main St" with no city/state
- If you see only a street, try to find the city/state elsewhere in the document

---

## STEP 5: PARSING RULES FOR BUILDING/PLANT/GATE IDENTIFIERS

**address field MUST include building/plant/gate/dock/suite identifiers:**

✅ **CORRECT Examples:**
- address: "2707 N Barnes Ave Plant 5" (Plant 5 stays with street)
- address: "123 Industrial Blvd Building A" (Building A stays with street)
- address: "456 Warehouse Dr Gate 3" (Gate 3 stays with street)
- address: "789 Dock Rd Suite 200" (Suite 200 stays with street)

❌ **WRONG Examples:**
- address: "2707 N Barnes Ave", city: "Plant 5" (Plant 5 is NOT a city!)

**Common identifiers that belong in the address field (NOT in city):**
- Plant [number/letter] → "Plant 5", "Plant A"
- Building [number/letter] → "Building 2", "Building B"
- Gate [number/letter] → "Gate 3", "Gate A"
- Dock [number/letter] → "Dock 1", "Dock C"
- Suite [number] → "Suite 200"
- Unit [number] → "Unit 15"
- Bay [number] → "Bay 4"
- Warehouse [number] → "Warehouse 3"
- Door [number] → "Door 12"

**city field:** Extract ONLY the actual city name
- ✅ CORRECT: "Houston", "Los Angeles", "Springfield", "New York"
- ❌ WRONG: "Plant 5", "Building A", "DC 1234"

**state field:** Extract ONLY the 2-letter state code
- ✅ CORRECT: "TX", "CA", "NY", "MO"
- ❌ WRONG: "Texas", "California", city names

**zip field:** Extract zip code with these rules (CRITICAL - DO NOT SKIP):
- ALWAYS look for zip codes near the city and state
- Format: 5 digits (like "77434") OR ZIP+4 with hyphen (like "77434-1234")
- If you find 9 consecutive digits, format as ZIP+4: "774341234" → "77434-1234"
- If you find 5 digits, keep as-is: "77434"
- Remove any spaces: "77434 1234" → "77434-1234"
- Common locations: After state code, at end of address line, on separate line
- **IF NOT FOUND IN DOCUMENT**: Use your AI knowledge to provide a common/central zip code for the given city and state (e.g., Eagle Lake, TX → "77434", Chicago, IL → "60601")
- Only set to null if you have no city/state information at all

**DO NOT:**
- Include country names (USA, United States, etc.) in any address field
- Include ZIP codes in city/state fields
- Swap city and state values
- Return partial street addresses without city/state

---

## STEP 6: DATE AND TIME EXTRACTION

**DATES - Convert to YYYY-MM-DD format:**
- \`09/24/25\` → \`2025-09-24\`
- \`9/24/2025\` → \`2025-09-24\`
- \`Sep 24, 2025\` → \`2025-09-24\`
- \`24-Sep-25\` → \`2025-09-24\`

**TIMES - Convert to HH:MM 24-hour format:**
- \`2:00 PM\` → \`14:00\`
- \`8:00 AM\` → \`08:00\`
- \`1400\` → \`14:00\`

**IMPORTANT: When extracting times for pickup and delivery:**
- If only ONE time is provided (no time range), use that single time for BOTH startTime AND endTime
- Example: If pickup time is "14:00", set both \`pickupStartTime="14:00"\` and \`pickupEndTime="14:00"\`
- Example: If delivery time is "08:00", set both \`deliveryStartTime="08:00"\` and \`deliveryEndTime="08:00"\`
- If a time range is given (e.g., "8:00 AM - 12:00 PM"), extract both start and end times
- This applies to both multi-drop stops and single-drop loads

---

## STEP 7: NUMBER EXTRACTION (CRITICAL FOR CURRENCY)

**For numeric fields, extract ONLY the number, but handle decimals correctly:**

**Currency/Money (freightAmount):**
- STEP 1: Remove dollar sign ($)
- STEP 2: Remove commas (,)
- STEP 3: Parse as decimal number (keep decimal point)
- STEP 4: Return as number (not multiplied by 100)

**Examples:**
- $1,300.00 → Remove $ → 1,300.00 → Remove commas → 1300.00 → Parse as number → 1300
- $1,250.50 → 1250.50 (NOT 125050!)
- $850 → 850
- $2,500.25 → 2500.25 (NOT 250025!)

**Other numeric fields:**
- mileage: 450 miles → Extract as 450 (number only, remove text)
- weight: 42,000 lbs → Remove commas → 42000 (number only, remove text and commas)

---

## STEP 8: OUTPUT FORMAT

### IF SINGLE-DROP LOAD:
Return this JSON structure with ALL fields (BROKER INFO MUST BE FIRST):

{
  "brokerName": "BROKER COMPANY NAME - EXTRACT FIRST!",
  "brokerAddress": "Broker's full address - EXTRACT FIRST!",
  "brokerLoadNumber": "string",
  "pickupAddress": "street address with building/plant/gate",
  "pickupCity": "city name only",
  "pickupState": "2-letter state code",
  "pickupZip": "zip code",
  "pickupDate": "YYYY-MM-DD",
  "pickupStartTime": "HH:MM",
  "pickupEndTime": "HH:MM",
  "pickupPuNumber": "pickup/appointment number",
  "pickupPoNumber": "purchase order number",
  "pickupShipper": "COMPANY NAME - REQUIRED",
  "deliveryAddress": "street address with building/plant/gate",
  "deliveryCity": "city name only",
  "deliveryState": "2-letter state code",
  "deliveryZip": "zip code",
  "deliveryDate": "YYYY-MM-DD",
  "deliveryStartTime": "HH:MM",
  "deliveryEndTime": "HH:MM",
  "deliveryPoNumber": "purchase order number",
  "deliveryShipper": "COMPANY NAME - REQUIRED",
  "freightAmount": 1250,
  "mileage": 450,
  "commodity": "maximum 4 words",
  "weight": 42000,
  "trailer": "string",
  "equipment": "string",
  "temperature": "string"
}

### IF MULTI-DROP LOAD:
Return this JSON structure with ALL fields (BROKER INFO MUST BE FIRST):

{
  "brokerName": "BROKER COMPANY NAME - EXTRACT FIRST!",
  "brokerAddress": "Broker's full address - EXTRACT FIRST!",
  "brokerLoadNumber": "string",
  "pickups": [
    {
      "address": "street address with building/plant/gate",
      "city": "city name only",
      "state": "2-letter code",
      "zip": "zip code",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "puNumber": "pickup number",
      "poNumber": "purchase order",
      "shipper": "COMPANY NAME - REQUIRED"
    }
  ],
  "deliveries": [
    {
      "address": "street address with building/plant/gate",
      "city": "city name only",
      "state": "2-letter code",
      "zip": "zip code",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "poNumber": "purchase order",
      "shipper": "COMPANY NAME - REQUIRED"
    }
  ],
  "freightAmount": 1250,
  "mileage": 450,
  "commodity": "maximum 4 words",
  "weight": 42000,
  "trailer": "string",
  "equipment": "string",
  "temperature": "string"
}

---

## FINAL INSTRUCTIONS

1. **Extract ALL available information** - do not leave fields empty if data exists in the document
2. **Return ONLY valid JSON** - no markdown formatting, no explanations, no code blocks
3. **Use null for missing fields** - if a field cannot be found, use null or empty string ""
4. **Company names are REQUIRED** - always extract shipper/receiver company names
5. **Validate addresses** - ensure city and state are always included for geocoding
6. **Double-check parsing** - ensure Plant/Building/Gate identifiers are in the address field, not city field

**If a required field is unclear or missing from the document, still include it in the JSON with null or empty value rather than omitting it entirely.**`;

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

    // Try to match broker from database
    console.log('🔍 Attempting to match broker from database...');
    console.log('Extracted broker name:', extractedData.brokerName);
    console.log('Extracted broker address:', extractedData.brokerAddress);
    
    if (extractedData.brokerName || extractedData.brokerAddress) {
      try {
        // Import Supabase client
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.58.0');
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        // Levenshtein distance for fuzzy matching
        const levenshtein = (a: string, b: string): number => {
          if (a.length === 0) return b.length;
          if (b.length === 0) return a.length;
          const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
          for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
          for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
          for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
              );
            }
          }
          return matrix[b.length][a.length];
        };

        // Token sort ratio (sort words alphabetically then compare)
        const tokenSortRatio = (a: string, b: string): number => {
          const normalize = (s: string) => s.toLowerCase().split(/\s+/).filter(w => w.length > 0).sort().join(' ');
          const aNorm = normalize(a);
          const bNorm = normalize(b);
          const distance = levenshtein(aNorm, bNorm);
          const maxLen = Math.max(aNorm.length, bNorm.length);
          return maxLen === 0 ? 100 : ((maxLen - distance) / maxLen) * 100;
        };

        // Partial ratio (best substring match)
        const partialRatio = (a: string, b: string): number => {
          const shorter = a.length <= b.length ? a : b;
          const longer = a.length > b.length ? a : b;
          let bestRatio = 0;
          for (let i = 0; i <= longer.length - shorter.length; i++) {
            const substring = longer.substring(i, i + shorter.length);
            const distance = levenshtein(shorter, substring);
            const ratio = ((shorter.length - distance) / shorter.length) * 100;
            if (ratio > bestRatio) bestRatio = ratio;
          }
          return bestRatio;
        };

        // Normalize text: uppercase, remove punctuation, remove common suffixes
        const normalizeText = (text: string): string => {
          return text
            .toUpperCase()
            .replace(/[^\w\s@.-]/g, ' ')
            .replace(/\b(INC|LLC|LTD|CO|COMPANY|CORP|CORPORATION|DBA|THE)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        // Extract MC number from text
        const extractMC = (text: string): string | null => {
          const match = text.match(/\bMC[#:\s-]*(\d+)/i);
          return match ? match[1] : null;
        };

        // Extract email domain
        const extractEmailDomain = (text: string): string | null => {
          const match = text.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
          return match ? match[1].toLowerCase() : null;
        };

        // Extract phone area code
        const extractAreaCode = (text: string): string | null => {
          const match = text.match(/\((\d{3})\)|(\d{3})[-.]\d{3}[-.]\d{4}/);
          return match ? (match[1] || match[2]) : null;
        };

        // Extract city, state, zip from address
        const parseAddress = (address: string): { city: string; state: string; zip: string } => {
          const cityMatch = address.match(/,\s*([^,]+?)\s*,?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
          if (cityMatch) {
            return { 
              city: cityMatch[1].toUpperCase().trim(), 
              state: cityMatch[2].toUpperCase(), 
              zip: cityMatch[3] 
            };
          }
          const simpleMatch = address.match(/,\s*([^,]+?)\s*,\s*([A-Z]{2})/i);
          if (simpleMatch) {
            return { 
              city: simpleMatch[1].toUpperCase().trim(), 
              state: simpleMatch[2].toUpperCase(), 
              zip: '' 
            };
          }
          return { city: '', state: '', zip: '' };
        };

        // Weighted broker matching with scoring
        interface MatchResult {
          matchedBrokerId: string | null;
          matchedCompanyName: string;
          confidence: 'AUTO_MATCH' | 'REVIEW' | 'NO_MATCH';
          score: number;
        }

        const matchBroker = (
          extractedName: string, 
          extractedAddress: string, 
          brokers: any[]
        ): MatchResult => {
          console.log(`🔍 Starting weighted broker matching...`);
          console.log(`   Extracted name: "${extractedName}"`);
          console.log(`   Extracted address: "${extractedAddress}"`);
          
          const extractedMC = extractMC(extractedName + ' ' + extractedAddress);
          const extractedDomain = extractEmailDomain(extractedAddress);
          const extractedAreaCode = extractAreaCode(extractedAddress);
          const extractedLocation = parseAddress(extractedAddress);
          const normalizedExtractedName = normalizeText(extractedName);
          
          console.log(`   MC: ${extractedMC || 'none'}`);
          console.log(`   Email domain: ${extractedDomain || 'none'}`);
          console.log(`   Area code: ${extractedAreaCode || 'none'}`);
          console.log(`   Location: ${extractedLocation.city}, ${extractedLocation.state} ${extractedLocation.zip}`);
          
          let bestMatch: any = null;
          let bestScore = 0;
          
          for (const broker of brokers) {
            let score = 0;
            const reasons: string[] = [];
            
            const brokerMC = broker.mc_number || extractMC(broker.name + ' ' + (broker.address || ''));
            const normalizedBrokerName = normalizeText(broker.name);
            
            // 1. MC number exact match → 1000 points (AUTO_MATCH)
            if (extractedMC && brokerMC && extractedMC === brokerMC) {
              score += 1000;
              reasons.push(`MC match (+1000)`);
              console.log(`   ✅ MC MATCH: ${broker.name} (MC ${brokerMC})`);
            }
            
            // 2. Company name exact match → +60
            if (normalizedExtractedName === normalizedBrokerName) {
              score += 60;
              reasons.push(`exact name (+60)`);
            }
            
            // 3. Fuzzy name similarity (token_sort_ratio) × 0.4 → up to +40
            const nameSimilarity = tokenSortRatio(normalizedExtractedName, normalizedBrokerName);
            const nameFuzzyScore = Math.round((nameSimilarity / 100) * 40);
            if (nameFuzzyScore > 0) {
              score += nameFuzzyScore;
              reasons.push(`name similarity (+${nameFuzzyScore})`);
            }
            
            // 4. Email domain match → +25
            if (extractedDomain && broker.address) {
              const brokerDomain = extractEmailDomain(broker.address);
              if (brokerDomain && extractedDomain === brokerDomain) {
                score += 25;
                reasons.push(`email domain (+25)`);
              }
            }
            
            // 5. Address city/state/zip overlap → +15
            if (broker.address) {
              const brokerLocation = parseAddress(broker.address);
              let locationScore = 0;
              if (extractedLocation.city && brokerLocation.city === extractedLocation.city) locationScore += 5;
              if (extractedLocation.state && brokerLocation.state === extractedLocation.state) locationScore += 5;
              if (extractedLocation.zip && brokerLocation.zip === extractedLocation.zip) locationScore += 5;
              if (locationScore > 0) {
                score += locationScore;
                reasons.push(`location overlap (+${locationScore})`);
              }
            }
            
            // 6. Address partial similarity (partial_ratio) × 0.15 → up to +15
            if (broker.address) {
              const addressSimilarity = partialRatio(
                normalizeText(extractedAddress), 
                normalizeText(broker.address)
              );
              const addressFuzzyScore = Math.round((addressSimilarity / 100) * 15);
              if (addressFuzzyScore > 0) {
                score += addressFuzzyScore;
                reasons.push(`address similarity (+${addressFuzzyScore})`);
              }
            }
            
            // 7. Phone area code overlap → +10
            if (extractedAreaCode && broker.address) {
              const brokerAreaCode = extractAreaCode(broker.address);
              if (brokerAreaCode && extractedAreaCode === brokerAreaCode) {
                score += 10;
                reasons.push(`area code (+10)`);
              }
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = { broker, reasons };
            }
            
            if (score > 0) {
              console.log(`   ${broker.name}: ${score} pts [${reasons.join(', ')}]`);
            }
          }
          
          // Determine confidence
          let confidence: 'AUTO_MATCH' | 'REVIEW' | 'NO_MATCH' = 'NO_MATCH';
          let matchedBrokerId: string | null = null;
          let matchedCompanyName = '';
          
          if (bestMatch) {
            if (bestScore >= 100) {
              confidence = 'AUTO_MATCH';
              matchedBrokerId = bestMatch.broker.id;
              matchedCompanyName = bestMatch.broker.name;
              console.log(`✅ AUTO_MATCH: ${bestMatch.broker.name} (score: ${bestScore})`);
              console.log(`   Reasons: ${bestMatch.reasons.join(', ')}`);
            } else if (bestScore >= 70) {
              confidence = 'REVIEW';
              matchedBrokerId = bestMatch.broker.id;
              matchedCompanyName = bestMatch.broker.name;
              console.log(`⚠️ REVIEW: ${bestMatch.broker.name} (score: ${bestScore})`);
              console.log(`   Reasons: ${bestMatch.reasons.join(', ')}`);
            } else {
              console.log(`❌ NO_MATCH: Best score ${bestScore} below threshold (70)`);
            }
          } else {
            console.log(`❌ NO_MATCH: No brokers scored any points`);
          }
          
          return {
            matchedBrokerId,
            matchedCompanyName,
            confidence,
            score: bestScore
          };
        };
        
        // Fetch ALL brokers with pagination to avoid 1000-row limit
        console.log('🔍 Fetching all brokers from database...');
        let allBrokers: any[] = [];
        let page = 0;
        const pageSize = 1000;
        
        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          
          const { data, error } = await supabaseAdmin
            .from('brokers')
            .select('id, name, address, mc_number')
            .order('name')
            .range(from, to);
          
          if (error) {
            console.error(`Error fetching brokers page ${page + 1}:`, error);
            break;
          }
          
          if (data && data.length > 0) {
            allBrokers = [...allBrokers, ...data];
            console.log(`   Fetched page ${page + 1}: ${data.length} brokers (total: ${allBrokers.length})`);
            
            if (data.length < pageSize) {
              break;
            }
            page++;
          } else {
            break;
          }
        }
        
        const brokers = allBrokers;
        const brokersError = null;
        
        if (brokers && brokers.length > 0) {
          console.log(`✅ Total brokers loaded: ${brokers.length}`);
          
          // Try to match using the weighted matching function
          if (extractedData.brokerName) {
            const matchResult = matchBroker(
              extractedData.brokerName,
              extractedData.brokerAddress || '',
              brokers
            );
            
            if (matchResult.matchedBrokerId) {
              extractedData.matchedBrokerId = matchResult.matchedBrokerId;
              console.log(`✅ Broker ${matchResult.confidence}: ${matchResult.matchedCompanyName}`);
              console.log(`   Score: ${matchResult.score}`);
            } else {
              console.log('⚠️ No matching broker found in database');
              if (extractedData.brokerName) console.log(`   Extracted name: "${extractedData.brokerName}"`);
              if (extractedData.brokerAddress) console.log(`   Extracted address: "${extractedData.brokerAddress}"`);
            }
          }
        }
      } catch (brokerMatchError) {
        console.error('Error matching broker:', brokerMatchError);
        // Don't fail the whole operation if broker matching fails
      }
    } else {
      console.log('⚠️ No broker name or address extracted, skipping broker matching');
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