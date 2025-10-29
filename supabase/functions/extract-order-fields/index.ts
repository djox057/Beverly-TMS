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

    // Optimized concise system prompt to reduce resource usage
    const systemPrompt = `Extract logistics data from PDFs with OCR. Return JSON only.

## BROKER INFO (Priority 1)
Extract from header/top:
- **brokerName**: Company issuing the load (e.g., TQL, CH Robinson)
- **brokerAddress**: Broker's office address

## LOCATION CLASSIFICATION (Priority 2)
**PICKUP indicators**: "PU", "PICKUP", "Origin", "Shipper", earlier date
**DELIVERY indicators**: "SO", "STOP", "DELIVERY", "Destination", later date

**CRITICAL**: Never use CARRIER address for pickup/delivery. Carrier = trucking company hired.

## ADDRESS CLEANING (Priority 3)

**OCR ERROR DETECTION**: If address has excessive commas, random letters, or nonsense patterns (e.g., "S W 33440 1731C S W C, W C OWE,N AVE,"), reconstruct intelligently:
1. Find street number (3-5 digits)
2. Identify street suffix (AVE, ST, RD, BLVD, DR)
3. Remove excessive punctuation
4. Use ZIP/CITY to validate

**REMOVE from addresses**:
- Everything after " - " (dash with spaces)
- Dock/door numbers: "DOCK DOORS 3", "LOADING DOCK 12"
- Instructions: "AROUND BACK", "CALL AHEAD", "USE GATE"

**KEEP in addresses**:
- Street number + name
- Suite/Building/Plant identifiers (e.g., "Suite 200", "Plant 5")

**EXPAND abbreviations**:
- Directions: N→North, S→South, E→East, W→West, NE→Northeast, etc.
- Streets: Ave→Avenue, Blvd→Boulevard, Dr→Drive, Rd→Road, St→Street, Pkwy→Parkway, Ln→Lane
- Buildings: Ste→Suite, Bldg→Building

**PARSE FORMATS**:
A) "36300 Eureka Rd Romulus MI 48174" → Parse right-to-left: zip (48174), state (MI), city (Romulus), address (36300 Eureka Rd)
B) Multi-line: Standard parsing

**REMOVE facility prefixes**: "SPRINGFIELD BLDG 19 DU 1904 N LECOMPTE" → "1904 North Lecompte"

**NO duplicate cities**: City only in "city" field, never in "address" field.

## ZIP CODES (Priority 4)
- ALWAYS extract ZIP (5 or 9 digits)
- Format: "770011234" → "77001-1234"
- If missing: Infer from city/state using AI knowledge

## DATES/TIMES
- Dates: Convert to YYYY-MM-DD, **ALWAYS use 2025** regardless of original year
- Times: HH:MM 24-hour format
- If only one time given, use for both startTime AND endTime

## NUMBERS
- Currency: Remove $ and commas, keep decimals ($1,300.50 → 1300.5)
- Weight/mileage: Extract number only

## VALIDATION
Before returning JSON:
1. Verify at least 1 pickup AND 1 delivery
2. Expand ALL abbreviations (N→North, Ave→Avenue, Ste→Suite)
3. Remove facility prefixes (start address with street number)
4. No duplicate cities (city only in city field)
5. ZIP always included (infer if missing)

## OUTPUT JSON

**Single-drop**:
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

Return ONLY valid JSON. No markdown, no explanations.`;

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
            .replace(/[.,;:!?'"()\[\]{}]/g, ' ')  // Remove common punctuation including periods
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
          
          console.log(`   Normalized extracted name: "${normalizedExtractedName}"`);
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
              console.log(`   🎯 EXACT NAME MATCH: ${broker.name}`);
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
          
          console.log(`\n🏁 Matching complete. Best match: ${bestMatch ? bestMatch.broker.name : 'none'}, score: ${bestScore}`);
          
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