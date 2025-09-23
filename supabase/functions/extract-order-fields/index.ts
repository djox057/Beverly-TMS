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
  pickupStartDate?: string;
  pickupEndDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryDate?: string;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
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

    // Step 2: Create Assistant and Thread for PDF analysis
    console.log('Creating OpenAI Assistant for PDF analysis...');
    
    // Create an assistant
    const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({
        name: 'PDF Data Extractor',
        instructions: `You are an expert at extracting shipping/logistics data from PDF documents. Extract ALL available information and return ONLY a valid JSON object with the exact field names specified. Do not include any markdown formatting or explanations.

IMPORTANT: When extracting dates, convert them to YYYY-MM-DD format correctly. For example:
- 09/24/25 becomes 2025-09-24
- 9/24/2025 becomes 2025-09-24  
- Sep 24, 2025 becomes 2025-09-24

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
}`,
        model: 'gpt-4o',
        tools: [{ type: 'file_search' }],
      }),
    });

    if (!assistantResponse.ok) {
      const errorText = await assistantResponse.text();
      console.error('Failed to create assistant:', assistantResponse.status, errorText);
      throw new Error(`Failed to create assistant: ${assistantResponse.status}`);
    }

    const assistant = await assistantResponse.json();
    console.log('Assistant created:', assistant.id);

    // Create a thread
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({}),
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      console.error('Failed to create thread:', threadResponse.status, errorText);
      throw new Error(`Failed to create thread: ${threadResponse.status}`);
    }

    const thread = await threadResponse.json();
    console.log('Thread created:', thread.id);

    // Create a message with file attachment
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({
        role: 'user',
        content: 'Please analyze this shipping/logistics PDF document and extract ALL available order information. Return ONLY the JSON object with the data you can find.',
        attachments: [
          {
            file_id: uploadedFile.id,
            tools: [{ type: 'file_search' }],
          },
        ],
      }),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error('Failed to create message:', messageResponse.status, errorText);
      throw new Error(`Failed to create message: ${messageResponse.status}`);
    }

    const message = await messageResponse.json();
    console.log('Message created:', message.id);

    // Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({
        assistant_id: assistant.id,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Failed to start run:', runResponse.status, errorText);
      throw new Error(`Failed to start run: ${runResponse.status}`);
    }

    const run = await runResponse.json();
    console.log('Run started:', run.id);

    // Poll for completion
    let runStatus = run;
    const maxAttempts = 30;
    let attempts = 0;

    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      if (attempts >= maxAttempts) {
        throw new Error('Assistant run timed out');
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check run status');
      }

      runStatus = await statusResponse.json();
      console.log('Run status:', runStatus.status);
      attempts++;
    }

    if (runStatus.status !== 'completed') {
      console.error('Run failed with status:', runStatus.status);
      throw new Error(`Assistant run failed: ${runStatus.status}`);
    }

    // Get the messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'OpenAI-Beta': 'assistants=v2',
      },
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error('Failed to get messages:', messagesResponse.status, errorText);
      throw new Error(`Failed to get messages: ${messagesResponse.status}`);
    }

    const messagesResult = await messagesResponse.json();
    const assistantMessages = messagesResult.data.filter(msg => msg.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      throw new Error('No assistant response found');
    }

    const extractedContent = assistantMessages[0].content[0].text.value.trim();
    console.log('OpenAI Assistant response:', extractedContent);

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

    // Step 3: Clean up resources
    try {
      // Delete the thread and assistant
      await fetch(`https://api.openai.com/v1/threads/${thread.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      });

      await fetch(`https://api.openai.com/v1/assistants/${assistant.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      });

      // Delete the uploaded file
      await fetch(`https://api.openai.com/v1/files/${uploadedFile.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
      });
      
      console.log('Resources cleaned up successfully');
    } catch (cleanupError) {
      console.warn('Failed to cleanup resources:', cleanupError);
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