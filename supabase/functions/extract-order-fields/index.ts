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

// Upload PDF to OpenAI and extract structured data using chat completions API
async function extractWithFileAPI(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not found');
  }

  console.log('Using chat completions API for PDF extraction...');
  
  // Create base64 encoded PDF for direct processing
  const base64Pdf = btoa(String.fromCharCode(...pdfBuffer));

  // Define the schema for structured extraction
  const schema = {
    name: "ShippingDocument",
    schema: {
      type: "object",
      properties: {
        brokerLoadNumber: { type: "string", description: "Load/reference/confirmation number" },
        broker: { type: "string", description: "Broker/carrier company name" },
        pickupAddress: { type: "string", description: "Complete pickup address" },
        deliveryAddress: { type: "string", description: "Complete delivery address" },
        pickupDateTime: { type: "string", description: "Pickup date/time in YYYY-MM-DDTHH:MM format" },
        deliveryDateTime: { type: "string", description: "Delivery date/time in YYYY-MM-DDTHH:MM format" },
        freightAmount: { type: "string", description: "Freight amount as number only" },
        dhMiles: { type: "string", description: "Deadhead miles if found" },
        loadedMiles: { type: "string", description: "Loaded miles if found" }
      },
      additionalProperties: false
    },
    strict: true
  };

  // Extract data using chat completions API with vision
  console.log('Extracting data with chat completions API...');
  const extractResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract shipping information from this transportation document. Return structured JSON with brokerLoadNumber, broker, pickupAddress, deliveryAddress, pickupDateTime, deliveryDateTime, freightAmount, dhMiles, and loadedMiles. Look for load numbers, broker names, addresses, dates/times, freight amounts, and mileage information. Set null for missing fields.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64Pdf}`
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: schema
      },
      max_tokens: 1000
    }),
  });

  if (!extractResponse.ok) {
    const error = await extractResponse.text();
    console.error('Chat completions extraction failed:', error);
    throw new Error(`Chat completions extraction failed: ${extractResponse.status} - ${error}`);
  }

  const extractResult = await extractResponse.json();
  console.log('Raw extraction result:', extractResult);
  
  // Parse the response
  const content = extractResult?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in chat completion response');
  }
  
  console.log('Extracted content:', content);
  return JSON.parse(content);
}

// Improved PDF text extraction as fallback
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    console.log('Starting improved PDF text extraction...');
    const pdfString = new TextDecoder('latin1').decode(pdfBuffer);
    let extractedText = '';
    
    // Method 1: Extract text between BT/ET (Begin Text/End Text) operators
    const textMatches = pdfString.match(/BT\s*.*?ET/gs);
    if (textMatches) {
      for (const match of textMatches) {
        // Look for text in parentheses followed by Tj operator
        const textContent = match.match(/\((.*?)\)\s*Tj/g);
        if (textContent) {
          textContent.forEach(text => {
            const cleanText = text.replace(/^\(|\)\s*Tj$/g, '').replace(/\\[rn]/g, ' ').trim();
            if (cleanText.length > 0) {
              extractedText += cleanText + ' ';
            }
          });
        }
        
        // Also look for text with TJ operator (array of strings)
        const arrayTextMatches = match.match(/\[(.*?)\]\s*TJ/g);
        if (arrayTextMatches) {
          arrayTextMatches.forEach(arrayText => {
            const strings = arrayText.match(/\((.*?)\)/g);
            if (strings) {
              strings.forEach(str => {
                const cleanStr = str.replace(/^\(|\)$/g, '').trim();
                if (cleanStr.length > 0) {
                  extractedText += cleanStr + ' ';
                }
              });
            }
          });
        }
      }
    }
    
    // Method 2: Look for stream objects containing text
    const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs);
    if (streamMatches) {
      for (const stream of streamMatches) {
        // Look for readable text patterns in streams
        const readableText = stream.match(/[A-Za-z0-9\s\$\.\,\-\#\@\(\)]{10,}/g);
        if (readableText) {
          readableText.forEach(text => {
            const cleanText = text.trim();
            if (cleanText.length > 10 && !cleanText.includes('obj') && !cleanText.includes('endobj')) {
              extractedText += cleanText + ' ';
            }
          });
        }
      }
    }
    
    // Method 3: Look for string literals in the PDF
    const stringMatches = pdfString.match(/\([^)]{5,100}\)/g);
    if (stringMatches) {
      stringMatches.forEach(str => {
        const cleanStr = str.replace(/^\(|\)$/g, '').trim();
        if (cleanStr.length > 3 && /[A-Za-z]/.test(cleanStr)) {
          extractedText += cleanStr + ' ';
        }
      });
    }
    
    // Clean up extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E]/g, ' ')
      .trim();
    
    console.log(`Total extracted text length: ${extractedText.length}`);
    if (extractedText.length > 100) {
      console.log('Text sample:', extractedText.substring(0, 500));
    }
    
    return extractedText;
  } catch (error) {
    console.error('Text extraction failed:', error);
    return '';
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

    // Method 1: Try OpenAI File API for structured extraction
    console.log('Attempting OpenAI File API extraction...');
    try {
      extractedData = await extractWithFileAPI(pdfBuffer, file.name);
      method = 'file_api';
      console.log('File API extraction successful:', extractedData);
    } catch (fileError) {
      console.log('File API extraction failed:', fileError.message);
      
      // Method 2: Fallback to text extraction
      console.log('Attempting text extraction fallback...');
      try {
        const textContent = await extractTextFromPDF(pdfBuffer);
        console.log('Extracted text length:', textContent.length);
        
        if (textContent.length > 50) {
          console.log('Text sample:', textContent.substring(0, 300));
          extractedData = await extractWithTextAPI(textContent);
          method = 'text_extraction';
          console.log('Text extraction successful:', extractedData);
        } else {
          throw new Error('Insufficient text extracted from PDF');
        }
      } catch (textError) {
        console.log('Text extraction also failed:', textError.message);
        throw new Error(`All extraction methods failed. File API: ${fileError.message}, Text: ${textError.message}`);
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