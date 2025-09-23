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

// Alternative: Use Lovable's document parsing service
async function extractWithDocumentAPI(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  console.log('Using Lovable document parsing service...');
  
  try {
    // For now, let's try a simpler approach with just text extraction and OpenAI text API
    console.log('Attempting comprehensive text extraction...');
    const textContent = await extractTextFromPDF(pdfBuffer);
    
    if (textContent.length < 20) {
      throw new Error('Insufficient text extracted from PDF');
    }
    
    console.log(`Extracted ${textContent.length} characters of text`);
    console.log('Text sample:', textContent.substring(0, 500));
    
    // Use OpenAI text API for extraction
    return await extractWithTextAPI(textContent);
    
  } catch (error) {
    console.error('Document parsing failed:', error);
    throw new Error(`Document parsing failed: ${error.message}`);
  }
}

// Backup: Try direct OpenAI with simpler approach
async function extractWithFileAPI(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not found');
  }

  console.log('Trying simplified OpenAI approach...');
  
  // First convert PDF to text, then use text-based extraction
  const textContent = await extractTextFromPDF(pdfBuffer);
  
  if (textContent.length < 20) {
    throw new Error('Could not extract readable text from PDF');
  }
  
  console.log('Using extracted text for OpenAI processing...');
  return await extractWithTextAPI(textContent);
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

    // Method 1: Try document parsing approach (more reliable)
    console.log('Attempting document parsing extraction...');
    try {
      extractedData = await extractWithDocumentAPI(pdfBuffer, file.name);
      method = 'document_api';
      console.log('Document API extraction successful:', extractedData);
    } catch (docError) {
      console.log('Document API extraction failed:', docError.message);
      
      // Method 2: Try simplified OpenAI approach
      console.log('Attempting simplified OpenAI extraction...');
      try {
        extractedData = await extractWithFileAPI(pdfBuffer, file.name);
        method = 'simplified_openai';
        console.log('Simplified OpenAI extraction successful:', extractedData);
      } catch (fileError) {
        console.log('Simplified OpenAI extraction failed:', fileError.message);
        
        // Method 3: Final fallback to direct text extraction
        console.log('Attempting direct text extraction fallback...');
        try {
          const textContent = await extractTextFromPDF(pdfBuffer);
          console.log('Extracted text length:', textContent.length);
          
          if (textContent.length > 20) {
            console.log('Text sample:', textContent.substring(0, 300));
            extractedData = await extractWithTextAPI(textContent);
            method = 'text_extraction';
            console.log('Text extraction successful:', extractedData);
          } else {
            throw new Error('Insufficient text extracted from PDF');
          }
        } catch (textError) {
          console.log('All extraction methods failed');
          throw new Error(`All extraction methods failed. Doc: ${docError.message}, OpenAI: ${fileError.message}, Text: ${textError.message}`);
        }
      }
    }

    // Validate that we got some data
    if (!extractedData) {
      throw new Error('No data extracted from PDF');
    }

    console.log('Extracted data for validation:', JSON.stringify(extractedData, null, 2));

    // Check for meaningful data - more lenient validation
    const meaningfulData = Object.entries(extractedData).filter(([key, value]) => {
      // Consider data meaningful if it's not null, undefined, empty string, or just whitespace
      return value !== null && 
             value !== undefined && 
             value !== '' && 
             (typeof value !== 'string' || value.trim().length > 0);
    });

    console.log(`Found ${meaningfulData.length} fields with meaningful data:`, meaningfulData.map(([key]) => key));

    // Accept data if we have at least one meaningful field
    if (meaningfulData.length === 0) {
      console.log('All extracted fields are empty or null');
      throw new Error(`No meaningful data found in PDF. Extracted data: ${JSON.stringify(extractedData)}`);
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