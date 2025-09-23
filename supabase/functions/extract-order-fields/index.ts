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

// Simple PDF text extraction for Deno
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    // Convert PDF buffer to base64 for processing
    const base64 = btoa(String.fromCharCode(...pdfBuffer));
    
    // Use a simple text extraction approach
    // In a real implementation, you might want to use a more sophisticated PDF parser
    const textDecoder = new TextDecoder();
    let text = '';
    
    // Look for text objects in PDF
    const pdfString = textDecoder.decode(pdfBuffer);
    const textRegex = /\(([^)]+)\)/g;
    let match;
    
    while ((match = textRegex.exec(pdfString)) !== null) {
      text += match[1] + ' ';
    }
    
    // Also try to extract text between BT and ET markers
    const btEtRegex = /BT\s+(.*?)\s+ET/gs;
    let btEtMatch;
    
    while ((btEtMatch = btEtRegex.exec(pdfString)) !== null) {
      text += btEtMatch[1] + ' ';
    }
    
    return text.trim() || pdfString.slice(0, 2000); // Fallback to first 2000 chars
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
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
    
    // Extract text from PDF
    console.log('Extracting text from PDF...');
    const extractedText = await extractTextFromPDF(pdfBuffer);
    console.log('Extracted text length:', extractedText.length);

    // Send to OpenAI for structured extraction
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `You are an expert at extracting shipping and logistics information from rate confirmation documents (rate cons). 

Extract the following information from the provided text and return it as a JSON object with these exact field names:
- brokerLoadNumber: The broker's load number or confirmation number
- broker: The broker/company name issuing the rate con
- pickupAddress: The pickup location address
- deliveryAddress: The delivery location address  
- pickupDateTime: Pickup date and time (in ISO format if possible, e.g., 2024-01-15T10:00)
- deliveryDateTime: Delivery date and time (in ISO format if possible)
- freightAmount: The total freight amount/rate (numeric value only)
- dhMiles: Deadhead miles (numeric value only)
- loadedMiles: Loaded miles (numeric value only)
- additionalPickups: Array of any additional pickup/delivery stops beyond the first pickup and final delivery

Only return the JSON object, no additional text. If a field cannot be found, omit it from the response or set it to null.`
          },
          {
            role: 'user',
            content: `Extract shipping information from this rate confirmation document:\n\n${extractedText}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIResult = await openAIResponse.json();
    console.log('OpenAI response:', openAIResult);

    let extractedData: ExtractedData = {};
    
    try {
      // Parse the JSON response from OpenAI
      const content = openAIResult.choices[0].message.content;
      extractedData = JSON.parse(content);
      console.log('Extracted data:', extractedData);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      // Return partial data if parsing fails
      extractedData = { brokerLoadNumber: 'Failed to parse response' };
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData,
        rawText: extractedText.slice(0, 500) // First 500 chars for debugging
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