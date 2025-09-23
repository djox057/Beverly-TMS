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

// Simple PDF text extraction - extracts readable text from PDF stream
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    // Convert buffer to string and look for text patterns
    const pdfString = new TextDecoder('latin1').decode(pdfBuffer);
    
    // Extract text between stream objects - basic PDF text extraction
    const textMatches = pdfString.match(/BT\s*.*?ET/gs);
    let extractedText = '';
    
    if (textMatches) {
      for (const match of textMatches) {
        // Look for text within parentheses or brackets
        const textContent = match.match(/\((.*?)\)/g) || match.match(/\[(.*?)\]/g);
        if (textContent) {
          textContent.forEach(text => {
            const cleanText = text.replace(/[()[\]]/g, '').replace(/\\[rn]/g, ' ').trim();
            if (cleanText.length > 0) {
              extractedText += cleanText + ' ';
            }
          });
        }
      }
    }
    
    // Also try to extract text using simple pattern matching
    const simpleTextMatch = pdfString.match(/Tj\s*([^T]*?)T[jJ*]/gs);
    if (simpleTextMatch) {
      simpleTextMatch.forEach(match => {
        const text = match.replace(/Tj|T[jJ*]/g, '').trim();
        if (text.length > 2 && !text.includes('<<')) {
          extractedText += text + ' ';
        }
      });
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error('Text extraction failed:', error);
    return '';
  }
}

// Convert PDF to base64 images for OpenAI Vision API
async function convertPDFToImages(pdfBuffer: Uint8Array): Promise<string[]> {
  try {
    // For now, we'll convert the entire PDF to a single base64 image representation
    // This is a simplified approach - in production you'd want to use a proper PDF to image library
    const base64PDF = btoa(String.fromCharCode(...pdfBuffer));
    
    // Return as a single "image" - OpenAI can sometimes handle PDF data this way
    return [`data:application/pdf;base64,${base64PDF}`];
  } catch (error) {
    console.error('PDF to image conversion failed:', error);
    return [];
  }
}

// Extract data using OpenAI with text content
async function extractWithTextAPI(textContent: string): Promise<ExtractedData> {
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

Extract the following information and return ONLY a valid JSON object:

{
  "brokerLoadNumber": "load/reference/confirmation number",
  "broker": "broker/carrier company name", 
  "pickupAddress": "complete pickup address",
  "deliveryAddress": "complete delivery address", 
  "pickupDateTime": "pickup date/time in YYYY-MM-DDTHH:MM format",
  "deliveryDateTime": "delivery date/time in YYYY-MM-DDTHH:MM format",
  "freightAmount": "freight amount as number only",
  "dhMiles": "deadhead miles if found",
  "loadedMiles": "loaded miles if found"
}

Set fields to null if not found. Return ONLY the JSON object, no markdown or extra text.`
        },
        {
          role: 'user', 
          content: `Extract shipping information from this document text:

${textContent}

Focus on finding load numbers, company names, addresses, dates, times, and dollar amounts.`
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Text API failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content.trim();
  
  // Clean JSON response
  let cleanContent = content;
  if (content.startsWith('```json')) {
    cleanContent = content.replace(/^```json\s*/g, '').replace(/```\s*$/g, '');
  } else if (content.startsWith('```')) {
    cleanContent = content.replace(/^```\s*/g, '').replace(/```\s*$/g, '');
  }
  
  return JSON.parse(cleanContent);
}

// Extract data using OpenAI Vision API
async function extractWithVisionAPI(images: string[]): Promise<ExtractedData> {
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
          content: `You are an expert at reading transportation documents and extracting shipping information.

Extract this information and return ONLY a JSON object:

{
  "brokerLoadNumber": "load/confirmation number",
  "broker": "carrier/broker company name",
  "pickupAddress": "pickup location address", 
  "deliveryAddress": "delivery location address",
  "pickupDateTime": "pickup date/time in YYYY-MM-DDTHH:MM",
  "deliveryDateTime": "delivery date/time in YYYY-MM-DDTHH:MM",
  "freightAmount": "freight amount as number only",
  "dhMiles": "deadhead miles",
  "loadedMiles": "loaded miles"
}

Set fields to null if not found. Return ONLY JSON, no markdown.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract shipping information from this carrier rate confirmation document:'
            },
            {
              type: 'image_url',
              image_url: {
                url: images[0],
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Vision API failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content.trim();
  
  // Clean JSON response  
  let cleanContent = content;
  if (content.startsWith('```json')) {
    cleanContent = content.replace(/^```json\s*/g, '').replace(/```\s*$/g, '');
  } else if (content.startsWith('```')) {
    cleanContent = content.replace(/^```\s*/g, '').replace(/```\s*$/g, '');
  }
  
  return JSON.parse(cleanContent);
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
    
    let extractedData: ExtractedData | null = null;
    let method = '';

    // Method 1: Try text extraction first
    console.log('Attempting text extraction from PDF...');
    try {
      const textContent = await extractTextFromPDF(pdfBuffer);
      console.log('Extracted text length:', textContent.length);
      
      if (textContent.length > 50) {
        console.log('Text sample:', textContent.substring(0, 200));
        extractedData = await extractWithTextAPI(textContent);
        method = 'text_extraction';
        console.log('Text extraction successful:', extractedData);
      } else {
        throw new Error('Insufficient text extracted');
      }
    } catch (textError) {
      console.log('Text extraction failed:', textError.message);
      
      // Method 2: Try vision API as fallback
      console.log('Attempting Vision API extraction...');
      try {
        const images = await convertPDFToImages(pdfBuffer);
        if (images.length > 0) {
          extractedData = await extractWithVisionAPI(images);
          method = 'vision_api';
          console.log('Vision API extraction successful:', extractedData);
        } else {
          throw new Error('No images generated from PDF');
        }
      } catch (visionError) {
        console.log('Vision API extraction failed:', visionError.message);
        throw new Error('Both text and vision extraction failed');
      }
    }

    // Validate that we got meaningful data
    if (!extractedData) {
      throw new Error('No data extracted from PDF');
    }

    const hasData = Object.values(extractedData).some(value => 
      value !== null && value !== undefined && value !== ''
    );

    if (!hasData) {
      throw new Error('No meaningful data found in PDF');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData,
        method: method,
        message: `Data extracted successfully using ${method}`
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
        error: error.message,
        message: 'Failed to extract data from PDF'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});