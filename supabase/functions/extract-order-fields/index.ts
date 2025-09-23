import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedData {
  brokerLoadNumber?: string;
  broker?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupDateTime?: string;
  deliveryDateTime?: string;
  freightAmount?: string;
  dhMiles?: string;
  loadedMiles?: string;
  additionalPickups?: Array<{
    type: 'pickup' | 'delivery';
    address: string;
    datetime?: string;
  }>;
}

// Extract text from PDF and use OpenAI text API
async function extractDataFromPDF(pdfBuffer: Uint8Array): Promise<ExtractedData> {
  try {
    // Convert PDF to base64 for text extraction
    const base64PDF = Array.from(pdfBuffer)
      .map(byte => String.fromCharCode(byte))
      .join('');
    const base64 = btoa(base64PDF);
    
    console.log('Sending PDF to OpenAI for text extraction...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting shipping information from transportation documents.

Please extract the following information from the document and return ONLY a valid JSON object with these exact field names:

{
  "brokerLoadNumber": "the load/reference number",
  "broker": "broker/company name", 
  "pickupAddress": "complete pickup address with city, state, zip",
  "deliveryAddress": "complete delivery address with city, state, zip",
  "pickupDateTime": "pickup date and time in YYYY-MM-DDTHH:MM format",
  "deliveryDateTime": "delivery date and time in YYYY-MM-DDTHH:MM format",
  "freightAmount": "freight amount as a number (no dollar sign)",
  "dhMiles": "deadhead miles if mentioned",
  "loadedMiles": "loaded miles if mentioned"
}

If a field is not found, set it to null. Return ONLY the JSON object, no other text or formatting.`
          },
          {
            role: 'user',
            content: `Please extract shipping information from this PDF document (base64 encoded): ${base64.substring(0, 1000)}...

Focus on finding:
- Load number or confirmation number
- Broker/carrier company name
- Pickup and delivery addresses
- Pickup and delivery dates/times
- Freight rate or amount
- Any mileage information`
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('OpenAI response:', result);
    
    const content = result.choices[0].message.content;
    console.log('Raw content from OpenAI:', content);
    
    // Clean and parse JSON - handle potential markdown formatting
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/g, '').replace(/```\s*$/g, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/g, '').replace(/```\s*$/g, '');
    }
    
    const extractedData = JSON.parse(cleanContent);
    console.log('Parsed extracted data:', extractedData);
    
    return extractedData;
    
  } catch (error) {
    console.error('PDF extraction failed:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Extract order fields function called');
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.type !== 'application/pdf') {
      throw new Error('Only PDF files are supported');
    }

    console.log('Processing PDF file:', file.name, 'Size:', file.size);

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);
    
    // Try PDF extraction
    console.log('Attempting PDF extraction...');
    const extractedData = await extractDataFromPDF(pdfBuffer);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData,
        method: 'text_extraction'
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
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});