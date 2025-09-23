import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ExtractedOrderData {
  brokerLoadNumber?: string;
  internalLoadNumber?: string;
  broker?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryDate?: string;
  freightAmount?: number;
  mileage?: number;
  commodity?: string;
  weight?: number;
  trailer?: string;
  equipment?: string;
  temperature?: string;
  notes?: string;
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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
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

    // Convert file to array buffer then Uint8Array
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);
    
    console.log('PDF buffer size:', pdfBuffer.length);

    // Step 1: Upload PDF to OpenAI Files API
    const fileFormData = new FormData();
    fileFormData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), pdfFile.name);
    fileFormData.append('purpose', 'assistants');

    console.log('Uploading PDF to OpenAI Files API...');
    
    const fileUploadResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: fileFormData,
    });

    if (!fileUploadResponse.ok) {
      const errorText = await fileUploadResponse.text();
      console.error('File upload failed:', fileUploadResponse.status, errorText);
      throw new Error(`Failed to upload PDF to OpenAI: ${fileUploadResponse.status}`);
    }

    const uploadedFile = await fileUploadResponse.json();
    console.log('File uploaded successfully, ID:', uploadedFile.id);

    // Step 2: Use Chat Completions with file attachment to extract data
    console.log('Extracting data from PDF using OpenAI...');
    
    const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting shipping/logistics data from PDF documents. Extract ALL available information and return ONLY a valid JSON object with the exact field names specified. Do not include any markdown formatting or explanations.

Return JSON with these exact fields (only include fields you can find):
{
  "brokerLoadNumber": "string - load/order/confirmation/BOL/reference number",
  "internalLoadNumber": "string - internal tracking number",
  "broker": "string - broker/carrier/company name",
  "pickupAddress": "string - complete pickup street address",
  "pickupCity": "string - pickup city name",
  "pickupState": "string - pickup state (2-letter code like TX, CA)",
  "pickupDate": "string - pickup date in YYYY-MM-DD format",
  "deliveryAddress": "string - complete delivery street address",
  "deliveryCity": "string - delivery city name", 
  "deliveryState": "string - delivery state (2-letter code)",
  "deliveryDate": "string - delivery date in YYYY-MM-DD format",
  "freightAmount": number - freight cost as number (no $ or commas),
  "mileage": number - total miles as number,
  "commodity": "string - type of goods/freight being shipped",
  "weight": number - weight in pounds as number,
  "trailer": "string - trailer type or equipment number",
  "equipment": "string - equipment requirements/specifications",
  "temperature": "string - temperature requirements if refrigerated",
  "notes": "string - special instructions or additional information"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please analyze this shipping/logistics PDF document and extract ALL available order information. Return ONLY the JSON object with the data you can find.'
              },
              {
                type: 'text',
                text: `file_id:${uploadedFile.id}`
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error('OpenAI extraction failed:', extractionResponse.status, errorText);
      throw new Error(`OpenAI extraction failed: ${extractionResponse.status}`);
    }

    const extractionResult = await extractionResponse.json();
    const extractedContent = extractionResult.choices[0].message.content.trim();
    
    console.log('OpenAI raw response:', extractedContent);

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
      throw new Error(`Failed to parse extraction result: ${parseError.message}`);
    }

    // Step 3: Clean up - delete the uploaded file
    try {
      await fetch(`https://api.openai.com/v1/files/${uploadedFile.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
      });
      console.log('Uploaded file cleaned up successfully');
    } catch (cleanupError) {
      console.warn('Failed to cleanup uploaded file:', cleanupError);
      // Don't fail the request if cleanup fails
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