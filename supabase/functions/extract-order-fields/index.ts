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

// Upload PDF to OpenAI and extract structured data using file API
async function extractWithFileAPI(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not found');
  }

  console.log('Uploading PDF to OpenAI files API...');
  
  // Step 1: Upload the PDF file to OpenAI
  const formData = new FormData();
  const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('file', pdfBlob, fileName);
  formData.append('purpose', 'assistants');

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    console.error('File upload failed:', error);
    throw new Error(`File upload failed: ${uploadResponse.status} - ${error}`);
  }

  const uploadResult = await uploadResponse.json();
  console.log('File uploaded successfully:', uploadResult.id);

  // Step 2: Create structured extraction request
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

  // Step 3: Extract data using responses API
  console.log('Extracting data with structured schema...');
  const requestBody = {
    model: 'gpt-4o',
    input: [{
      role: 'user',
      content: [
        { 
          type: 'input_text', 
          text: 'Extract shipping information from this transportation document. Return structured JSON with brokerLoadNumber, broker, pickupAddress, deliveryAddress, pickupDateTime, deliveryDateTime, freightAmount, dhMiles, and loadedMiles. Set null for missing fields.' 
        },
        { 
          type: 'input_file', 
          file_id: uploadResult.id 
        }
      ]
    }],
    // Try text_format first (newer API), fallback to response_format
    text_format: { 
      type: 'json_schema', 
      json_schema: schema 
    }
  };

  const extractResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // If text_format fails, try with response_format as fallback
  if (!extractResponse.ok) {
    console.log('Trying fallback with response_format...');
    const fallbackBody = {
      ...requestBody,
      response_format: requestBody.text_format
    };
    delete fallbackBody.text_format;

    const fallbackResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fallbackBody),
    });

    if (!fallbackResponse.ok) {
      const error = await fallbackResponse.text();
      console.error('Data extraction failed with both formats:', error);
      throw new Error(`Data extraction failed: ${fallbackResponse.status} - ${error}`);
    }

    const extractResult = await fallbackResponse.json();
    console.log('Raw extraction result (fallback):', extractResult);
    
    // Parse fallback response
    const text = extractResult?.output?.[0]?.content?.[0]?.text ?? extractResult?.output_text;
    if (!text) {
      throw new Error('No text content in fallback model response');
    }
    
    console.log('Extracted text (fallback):', text);
    return JSON.parse(text);
  }

  const extractResult = await extractResponse.json();
  console.log('Raw extraction result:', extractResult);

  // Step 4: Clean up uploaded file
  try {
    await fetch(`https://api.openai.com/v1/files/${uploadResult.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    console.log('Uploaded file cleaned up');
  } catch (cleanupError) {
    console.warn('Failed to cleanup uploaded file:', cleanupError);
  }

  // Step 5: Parse response
  const text = extractResult?.output?.[0]?.content?.[0]?.text ?? extractResult?.output_text;
  if (!text) {
    throw new Error('No text content in model response');
  }

  console.log('Extracted text:', text);
  return JSON.parse(text);
}

// Simple PDF text extraction as fallback
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');
    const pdfString = new TextDecoder('latin1').decode(pdfBuffer);
    let extractedText = '';
    
    // Extract text between BT/ET (Begin Text/End Text) operators
    const textMatches = pdfString.match(/BT\s*.*?ET/gs);
    if (textMatches) {
      for (const match of textMatches) {
        const textContent = match.match(/\((.*?)\)\s*Tj/g);
        if (textContent) {
          textContent.forEach(text => {
            const cleanText = text.replace(/^\(|\)\s*Tj$/g, '').replace(/\\[rn]/g, ' ').trim();
            if (cleanText.length > 0) {
              extractedText += cleanText + ' ';
            }
          });
        }
      }
    }
    
    console.log(`Total extracted text length: ${extractedText.length}`);
    return extractedText.trim();
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