import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PickupDeliveryStop {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  puNumber?: string;
  poNumber?: string;
  shipper?: string;
}

interface ExtractedOrderData {
  brokerLoadNumber?: string;
  internalLoadNumber?: string;
  broker?: string;
  brokerName?: string;
  brokerAddress?: string;
  brokerNameCandidates?: string[];
  brokerAddressCandidates?: string[];
  matchedBrokerId?: string;
  pickups?: PickupDeliveryStop[];
  deliveries?: PickupDeliveryStop[];
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupDate?: string;
  pickupStartDate?: string;
  pickupEndDate?: string;
  pickupStartTime?: string;
  pickupEndTime?: string;
  pickupPuNumber?: string;
  pickupPoNumber?: string;
  pickupShipper?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryDate?: string;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
  deliveryStartTime?: string;
  deliveryEndTime?: string;
  deliveryPoNumber?: string;
  deliveryShipper?: string;
  freightAmount?: number;
  mileage?: number;
  commodity?: string;
  weight?: number;
  trailer?: string;
  equipment?: string;
  temperature?: string;
}

serve(async (req) => {
  console.log('🚀 [STEP 0] Function invoked');
  console.log('🚀 [STEP 1] Method:', req.method);
  console.log('🚀 [STEP 2] Headers:', Object.fromEntries(req.headers.entries()));
  
  // Log memory usage
  if (typeof Deno !== 'undefined' && Deno.memoryUsage) {
    const mem = Deno.memoryUsage();
    console.log('🚀 [MEMORY] Initial:', {
      rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`
    });
  }

  if (req.method === 'OPTIONS') {
    console.log('🚀 [STEP 3] Handling OPTIONS');
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    console.log('🚀 [STEP 4] Method not allowed');
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('🚀 [STEP 5] POST request confirmed');
  let fileUri: string | null = null;
  
  try {
    console.log('🚀 [STEP 6] Entering try block');
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    console.log('🚀 [STEP 7] API key exists:', !!geminiApiKey);
    
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    console.log('🚀 [STEP 8] Getting content-type');
    const contentType = req.headers.get('content-type') || '';
    console.log('🚀 [STEP 9] Content-Type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      throw new Error('Request must be multipart/form-data');
    }

    console.log('🚀 [STEP 10] Preparing upload stream');
    const geminiBoundary = `----WebKitFormBoundary${Date.now()}`;
    const metadata = JSON.stringify({ file: { display_name: 'rate-confirmation.pdf' } });
    const encoder = new TextEncoder();
    
    console.log('🚀 [STEP 11] Creating headers');
    const geminiHeaders = encoder.encode(
      `--${geminiBoundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${geminiBoundary}\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    );
    
    const geminiFooter = encoder.encode(`\r\n--${geminiBoundary}--`);
    console.log('🚀 [STEP 12] Headers and footer created');
    console.log('🚀 [STEP 13] Creating upload stream');
    // Create stream that combines headers + original PDF stream + footer
    const uploadStream = new ReadableStream({
      async start(controller) {
        console.log('🚀 [STEP 14] Stream started');
        
        // Send Gemini headers
        controller.enqueue(geminiHeaders);
        console.log('🚀 [STEP 15] Headers enqueued');
        
        // Stream the original request body (but extract only PDF part)
        console.log('🚀 [STEP 16] Getting body reader');
        const bodyReader = req.body?.getReader();
        if (!bodyReader) {
          console.error('❌ No request body');
          controller.error(new Error('No request body'));
          return;
        }
        
        console.log('🚀 [STEP 17] Starting to read body chunks');
        let chunkCount = 0;
        
        try {
          let foundPdfStart = false;
          let buffer = new Uint8Array();
          const pdfMarker = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
          
          while (true) {
            const { done, value } = await bodyReader.read();
            chunkCount++;
            
            if (chunkCount % 10 === 0) {
              console.log(`🚀 [STEP 18] Read ${chunkCount} chunks, buffer size: ${buffer.length} bytes`);
            }
            
            if (done) {
              console.log(`🚀 [STEP 19] Stream complete after ${chunkCount} chunks`);
              break;
            }
            
            if (!foundPdfStart) {
              // Concatenate to buffer to search for PDF marker
              const newBuffer = new Uint8Array(buffer.length + value.length);
              newBuffer.set(buffer);
              newBuffer.set(value, buffer.length);
              buffer = newBuffer;
              
              // Log memory usage periodically
              if (chunkCount % 5 === 0 && typeof Deno !== 'undefined' && Deno.memoryUsage) {
                const mem = Deno.memoryUsage();
                console.log(`🧠 [MEMORY] After ${chunkCount} chunks:`, {
                  heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                  bufferSize: `${(buffer.length / 1024 / 1024).toFixed(2)} MB`
                });
              }
              
              // Find %PDF marker
              for (let i = 0; i < buffer.length - 3; i++) {
                if (buffer[i] === 0x25 && buffer[i+1] === 0x50 && 
                    buffer[i+2] === 0x44 && buffer[i+3] === 0x46) {
                  // Found PDF start, send from here
                  console.log(`🚀 [STEP 20] Found PDF marker at buffer position ${i}`);
                  controller.enqueue(buffer.slice(i));
                  foundPdfStart = true;
                  buffer = new Uint8Array(); // Clear buffer
                  break;
                }
              }
            } else {
              // Already found PDF, just forward chunks
              controller.enqueue(value);
            }
          }
        } finally {
          bodyReader.releaseLock();
        }
        
        // Send footer
        controller.enqueue(geminiFooter);
        controller.close();
      }
    });
    
    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 30000);
    
    let uploadResponse;
    try {
      uploadResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${geminiBoundary}` },
          body: uploadStream,
          signal: uploadController.signal
        }
      );
      clearTimeout(uploadTimeout);
    } catch (uploadError: unknown) {
      clearTimeout(uploadTimeout);
      if (uploadError instanceof Error && uploadError.name === 'AbortError') {
        console.error('❌ Upload timed out');
        throw new Error('File upload timed out');
      }
      console.error('❌ Upload error:', uploadError);
      throw uploadError;
    }

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error('❌ Gemini upload failed:', uploadResponse.status, errText);
      throw new Error(`File upload failed: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    fileUri = uploadData.file.uri;
    console.log('✅ PDF uploaded to Gemini, URI:', fileUri);

    // Optimized prompt - balanced between size and clarity (200-300 tokens)
    const systemPrompt = `Extract shipping data from PDF rate confirmation. Use OCR if needed.

**BROKER INFO (required):**
brokerNameCandidates: Array of broker names from top of document
brokerAddressCandidates: Array of broker addresses
brokerLoadNumber: Load/reference number

**STOPS:**
Extract pickups[] and deliveries[] arrays with: address, city, state, zip, date (YYYY-MM-DD), startTime, endTime, shipper
Clean addresses: remove dock/gate info after "-", expand abbreviations (N→North, Ave→Avenue)
ZIP: 5 or 9 digits (format: 12345-6789)

**OTHER FIELDS:**
freightAmount (number), mileage (number), commodity (max 4 words), weight (number), equipment, temperature

**OUTPUT:**
{
  "brokerNameCandidates": ["NAME"],
  "brokerAddressCandidates": ["ADDRESS"],
  "brokerLoadNumber": "string",
  "pickups": [{"address":"","city":"","state":"","zip":"","date":"","startTime":"","endTime":"","shipper":""}],
  "deliveries": [{"address":"","city":"","state":"","zip":"","date":"","startTime":"","endTime":"","shipper":""}],
  "freightAmount": 0,
  "mileage": 0,
  "commodity": "",
  "weight": 0,
  "equipment": "",
  "temperature": ""
}

Return ONLY JSON. Use null for missing fields.`;

    console.log('Calling Gemini 2.0 Flash Lite (optimized for speed and memory)...');
    
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Gemini API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`Failed to analyze PDF with Gemini: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('Gemini response received');
    console.log('Full Gemini response:', JSON.stringify(aiData, null, 2));
    
    if (aiData.promptFeedback?.blockReason) {
      console.error('Prompt was blocked:', aiData.promptFeedback);
      throw new Error(`Gemini blocked the request: ${aiData.promptFeedback.blockReason}`);
    }
    
    if (!aiData.candidates || aiData.candidates.length === 0) {
      console.error('No candidates in response:', aiData);
      throw new Error('Gemini returned no candidates. The PDF might be too complex or the content triggered safety filters.');
    }
    
    const candidate = aiData.candidates[0];
    
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Unusual finish reason:', candidate.finishReason);
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Content generation was blocked by safety filters');
      }
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('PDF is too complex and exceeded token limit. Try uploading a simpler or shorter PDF.');
      }
    }
    
    const extractedContent = candidate.content?.parts?.[0]?.text?.trim();
    
    if (!extractedContent) {
      console.error('No text content found in candidate:', JSON.stringify(candidate, null, 2));
      throw new Error('No content in AI response. The PDF might be unreadable or contain no extractable data.');
    }
    
    console.log('Gemini response content:', extractedContent);

    let extractedData: ExtractedOrderData;
    try {
      let cleanContent = extractedContent;
      if (extractedContent.includes('```json')) {
        const match = extractedContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      } else if (extractedContent.includes('```')) {
        const match = extractedContent.match(/```\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      }
      
      extractedData = JSON.parse(cleanContent);
      console.log('Successfully parsed extracted data:', extractedData);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Content that failed to parse:', extractedContent);
      throw new Error(`Failed to parse extraction result: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }

    // Auto-convert legacy single-stop format to array format
    if (!extractedData.pickups && !extractedData.deliveries) {
      console.log('🔄 Detected legacy single-stop format, converting to array format...');
      
      if (extractedData.pickupCity || extractedData.pickupAddress) {
        extractedData.pickups = [{
          address: extractedData.pickupAddress,
          city: extractedData.pickupCity,
          state: extractedData.pickupState,
          zip: extractedData.pickupZip,
          date: extractedData.pickupDate || extractedData.pickupStartDate,
          startTime: extractedData.pickupStartTime,
          endTime: extractedData.pickupEndTime,
          puNumber: extractedData.pickupPuNumber,
          poNumber: extractedData.pickupPoNumber,
          shipper: extractedData.pickupShipper
        }];
      }
      
      if (extractedData.deliveryCity || extractedData.deliveryAddress) {
        extractedData.deliveries = [{
          address: extractedData.deliveryAddress,
          city: extractedData.deliveryCity,
          state: extractedData.deliveryState,
          zip: extractedData.deliveryZip,
          date: extractedData.deliveryDate || extractedData.deliveryStartDate,
          startTime: extractedData.deliveryStartTime,
          endTime: extractedData.deliveryEndTime,
          puNumber: undefined,
          poNumber: extractedData.deliveryPoNumber,
          shipper: extractedData.deliveryShipper
        }];
      }
    }

    // Sort stops by datetime
    if (extractedData.pickups && extractedData.pickups.length > 1) {
      extractedData.pickups.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
    }
    
    if (extractedData.deliveries && extractedData.deliveries.length > 1) {
      extractedData.deliveries.sort((a: PickupDeliveryStop, b: PickupDeliveryStop) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
    }

    // Validate pickups and deliveries
    const pickupCount = extractedData.pickups?.length || 0;
    const deliveryCount = extractedData.deliveries?.length || 0;
    
    console.log('=== EXTRACTION VALIDATION ===');
    console.log(`Found ${pickupCount} pickup(s) and ${deliveryCount} delivery(ies)`);
    
    // Auto-correction if validation fails
    if (pickupCount === 0 || deliveryCount === 0) {
      console.warn('⚠️ VALIDATION FAILED: Missing pickups or deliveries. Attempting auto-correction...');
      
      const allStops = [
        ...(extractedData.pickups || []).map(s => ({ ...s, type: 'pickup' })),
        ...(extractedData.deliveries || []).map(s => ({ ...s, type: 'delivery' }))
      ].sort((a, b) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || '';
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || '';
        return dateA.localeCompare(dateB);
      });
      
      if (allStops.length >= 2) {
        const { type: _, ...firstStop } = allStops[0];
        const remainingStops = allStops.slice(1).map(({ type: _, ...stop }) => stop);
        
        extractedData.pickups = [firstStop];
        extractedData.deliveries = remainingStops;
        
        console.log(`✅ Auto-corrected: ${extractedData.pickups.length} pickup(s), ${extractedData.deliveries.length} delivery(ies)`);
      } else if (allStops.length === 1) {
        throw new Error('Document contains only 1 location. A valid load requires at least 1 pickup and 1 delivery location.');
      } else {
        throw new Error('No pickup or delivery locations could be found in the document.');
      }
    }

    console.log('✅ Extraction complete');

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        message: 'Successfully extracted PDF data'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in extract-order-fields function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } finally {
    // CRITICAL: Delete uploaded file from Gemini to free memory
    if (fileUri) {
      try {
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiApiKey) {
          console.log('🧹 Cleaning up uploaded file:', fileUri);
          const fileName = fileUri.split('/').pop();
          await fetch(
            `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${geminiApiKey}`,
            { method: 'DELETE' }
          );
          console.log('✅ File deleted from Gemini');
        }
      } catch (cleanupError) {
        console.error('⚠️ Failed to cleanup file:', cleanupError);
      }
    }
  }
});
