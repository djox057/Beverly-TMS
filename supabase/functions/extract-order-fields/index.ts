import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EDGE_BUDGET = {
  maxFileSizeBytes: 500_000, // 500KB
  maxEstimatedCpuMs: 1500,
  maxTextChars: 200_000,
  chunkSize: 10_000
};

// Text normalization
function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // de-hyphenate line breaks
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex-based extraction (fast path)
function extractWithRegex(text: string) {
  const normalized = normalizeText(text);
  
  const loadNumMatch = normalized.match(/(?:load\s*#?\s*[:\-]?\s*|ref(?:erence)?\s*[:\-]?\s*|#)(\d{6,})/i);
  const brokerMatch = normalized.match(/(?:from|broker|shipper)[\s:]+([A-Z][A-Za-z\s&.,-]+?)(?=\n|$)/i);
  const dateMatches = [...normalized.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)];
  const amountMatch = normalized.match(/(?:rate|amount|total)[\s:$]*?([\d,]+\.?\d*)/i);
  
  return {
    brokerLoadNumber: loadNumMatch?.[1] || '',
    brokerNameCandidates: brokerMatch ? [brokerMatch[1].trim()] : [],
    brokerAddressCandidates: [],
    pickups: dateMatches.length > 0 ? [{
      address: '', city: '', state: '', zip: '',
      date: dateMatches[0][1], startTime: '', endTime: '', shipper: '', pickupNumber: ''
    }] : [],
    deliveries: dateMatches.length > 1 ? [{
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

// LLM extraction for complex PDFs (sync, fallback)
async function extractWithLLM(base64: string): Promise<any> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('No API key');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { 
            text: `Extract data from this multi-page PDF. IMPORTANT INSTRUCTIONS:

1. CONCATENATE TEXT FROM ALL PAGES before parsing - do NOT assume page 1 has everything
2. NORMALIZE the text first:
   - Decode UTF-8 properly
   - Apply Unicode NFKC normalization
   - Replace smart quotes ("")with straight quotes
   - Collapse and trim whitespace
   - Remove zero-width characters
   - De-hyphenate line breaks (e.g., "ship-\\nper" → "shipper")
3. Use TOLERANT, CROSS-LINE regex patterns (case-insensitive, DOTALL mode):
   - Load number: (?is)load\\s*#?\\s*[:\\-]?\\s*(\\d+)|\\bref(?:erence)?\\b\\s*[:\\-]?\\s*(\\d+)|#(\\d{8,})
   - Broker name: Look for common patterns like "C.H. Robinson", "MoLo Solutions", etc.
   - Dates: Match MM/DD/YYYY or MM/DD/YY formats
   - Addresses: Parse full address with street, city, state, zip
4. FALLBACK to nearby key-value pairs if primary patterns fail
5. Extract these fields as JSON:
   - brokerNameCandidates: string[] (multiple possible matches)
   - brokerAddressCandidates: string[] (multiple possible matches)
   - brokerLoadNumber: string (the main load/reference number)
   - pickups: array of {address, city, state, zip, date, startTime, endTime, shipper, pickupNumber}
   - deliveries: array of {address, city, state, zip, date, startTime, endTime, shipper, deliveryNumber}
   - freightAmount: number (total amount from Rate Details)
   - mileage: number (if present)
   - commodity: string
   - weight: number (total estimated weight)
   - equipment: string

Return ONLY valid JSON, no markdown formatting.` 
          },
          { inline_data: { mime_type: 'application/pdf', data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 3048 }
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

  return JSON.parse(cleanText);
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
    
    if (!pdfFile) throw new Error('No file');
    
    const fileSize = pdfFile.size;
    const estimatedTokens = Math.ceil(fileSize / 4); // rough estimate
    const estimatedCpuMs = estimatedTokens * 0.5; // very rough
    
    console.log(`📊 Budget check: size=${fileSize}B, est_tokens=${estimatedTokens}, est_cpu=${estimatedCpuMs}ms`);

    // Budget enforcement - reject files that are too large for Edge
    if (fileSize > EDGE_BUDGET.maxFileSizeBytes || estimatedCpuMs > EDGE_BUDGET.maxEstimatedCpuMs) {
      console.log(`⚠️ Over budget - rejecting (size=${fileSize > EDGE_BUDGET.maxFileSizeBytes}, cpu=${estimatedCpuMs > EDGE_BUDGET.maxEstimatedCpuMs})`);
      const elapsed = Date.now() - startTime;
      
      // Return partial extraction with regex only
      const bytes = new Uint8Array(await pdfFile.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      const normalized = normalizeText(text);
      const extracted = extractWithRegex(normalized);
      
      console.log(`⚠️ File too large, returning regex-only extraction in ${elapsed}ms`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: extracted, 
          path: 'edge-partial',
          warning: 'Large file - used basic extraction only',
          elapsed 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fast path: regex extraction
    console.log('🚀 Using fast path - regex extraction');
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const normalized = normalizeText(text);
    
    console.log(`📝 Normalized: ${normalized.length} chars, removed ${text.length - normalized.length} chars`);
    
    const extracted = extractWithRegex(normalized);
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ Fast extraction completed in ${elapsed}ms`);
    
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
