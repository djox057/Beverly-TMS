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

// Improved PDF text extraction for Deno
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
    let text = '';
    
    // Convert to string for processing
    const pdfString = textDecoder.decode(pdfBuffer);
    console.log('PDF size:', pdfBuffer.length, 'bytes');
    
    // Method 1: Extract text between parentheses (common in PDF text objects)
    const textRegex = /\(([^)]+)\)/g;
    let match;
    const extractedTexts = [];
    
    while ((match = textRegex.exec(pdfString)) !== null) {
      const cleanText = match[1]
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\/g, '')
        .trim();
      
      if (cleanText.length > 2) { // Only add meaningful text
        extractedTexts.push(cleanText);
      }
    }
    
    text = extractedTexts.join(' ');
    console.log('Method 1 extracted text length:', text.length);
    
    // Method 2: Look for text between BT and ET markers
    if (text.length < 100) {
      const btEtRegex = /BT\s+(.*?)\s+ET/gs;
      let btEtMatch;
      const btTexts = [];
      
      while ((btEtMatch = btEtRegex.exec(pdfString)) !== null) {
        btTexts.push(btEtMatch[1].replace(/\s+/g, ' ').trim());
      }
      
      if (btTexts.length > 0) {
        text = btTexts.join(' ');
        console.log('Method 2 extracted text length:', text.length);
      }
    }
    
    // Method 3: Look for readable ASCII text in the PDF
    if (text.length < 100) {
      const readableTextRegex = /[A-Za-z0-9\s\.,\-#:@$%&\(\)\/]{10,}/g;
      const readableTexts = pdfString.match(readableTextRegex) || [];
      
      // Filter out obvious binary content and keep meaningful text
      const meaningfulTexts = readableTexts.filter(t => 
        t.length > 10 && 
        /[A-Za-z]/.test(t) && 
        (t.includes('Load') || t.includes('pickup') || t.includes('delivery') || t.includes('$') || /\d{4}/.test(t))
      );
      
      if (meaningfulTexts.length > 0) {
        text = meaningfulTexts.join(' ').slice(0, 5000);
        console.log('Method 3 extracted text length:', text.length);
      }
    }
    
    // Final fallback: Extract any visible text patterns
    if (text.length < 50) {
      console.log('All methods failed, using fallback');
      // Look for common shipping/logistics terms in the raw data
      const fallbackRegex = /(load|pickup|delivery|freight|rate|broker|truck|driver|miles|address|date|time|amount|\$\d+|\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
      const fallbackMatches = pdfString.match(fallbackRegex) || [];
      text = fallbackMatches.slice(0, 100).join(' ');
    }
    
    console.log('Final extracted text preview:', text.slice(0, 500));
    return text.trim();
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
      let content = openAIResult.choices[0].message.content;
      console.log('Raw OpenAI content:', content);
      
      // Remove markdown code block formatting if present
      content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      console.log('Cleaned content:', content);
      
      extractedData = JSON.parse(content);
      console.log('Extracted data:', extractedData);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Content that failed to parse:', openAIResult.choices[0].message.content);
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