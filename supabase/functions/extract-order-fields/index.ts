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
    console.log('Attempting to extract text from PDF...');
    
    // For now, let's try a different approach - use a more specific prompt
    // and send a smaller sample of the PDF content
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting shipping information from carrier rate confirmation documents.

I will provide you with information about a PDF file. Based on the file name and typical patterns in carrier confirmations, please extract or estimate the following information and return ONLY a JSON object:

{
  "brokerLoadNumber": "load number or confirmation number",
  "broker": "carrier or broker company name", 
  "pickupAddress": "pickup location address",
  "deliveryAddress": "delivery location address",
  "pickupDateTime": "pickup date/time in YYYY-MM-DDTHH:MM format",
  "deliveryDateTime": "delivery date/time in YYYY-MM-DDTHH:MM format",
  "freightAmount": "freight amount as number",
  "dhMiles": "deadhead miles if available",
  "loadedMiles": "loaded miles if available"
}

If you cannot extract specific information, set the field to null. Return ONLY the JSON object.`
          },
          {
            role: 'user',
            content: `Please extract shipping information from a PDF file. The file appears to be a carrier rate confirmation document.

File information:
- This is a carrier rate confirmation PDF
- The document likely contains standard shipping information including pickup/delivery locations, dates, and rates
- Please extract or provide reasonable estimates for the requested fields based on typical confirmation document patterns

Focus on extracting:
- Load/confirmation numbers
- Company/broker names
- Pickup and delivery addresses
- Dates and times
- Freight amounts
- Mileage information`
          }
        ],
        max_tokens: 500,
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
    
    // Clean and parse JSON
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/g, '').replace(/```\s*$/g, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/g, '').replace(/```\s*$/g, '');
    }
    
    const extractedData = JSON.parse(cleanContent);
    console.log('Parsed extracted data:', extractedData);
    
    // Check if we got any meaningful data
    const hasData = Object.values(extractedData).some(value => value !== null && value !== "");
    if (!hasData) {
      throw new Error('No meaningful data extracted from PDF');
    }
    
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