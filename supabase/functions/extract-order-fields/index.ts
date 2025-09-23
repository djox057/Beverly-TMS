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

// Enhanced PDF text extraction with better pattern matching
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');
    const pdfString = new TextDecoder('latin1').decode(pdfBuffer);
    let extractedText = '';
    
    // Method 1: Extract text between BT/ET (Begin Text/End Text) operators
    const textMatches = pdfString.match(/BT\s*.*?ET/gs);
    if (textMatches) {
      console.log(`Found ${textMatches.length} text blocks`);
      for (const match of textMatches) {
        // Look for text within parentheses (Tj operator)
        const parenthesesText = match.match(/\((.*?)\)\s*Tj/g);
        if (parenthesesText) {
          parenthesesText.forEach(text => {
            const cleanText = text.replace(/^\(|\)\s*Tj$/g, '')
              .replace(/\\[rn]/g, ' ')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .trim();
            if (cleanText.length > 0) {
              extractedText += cleanText + ' ';
            }
          });
        }
        
        // Look for text within brackets [text] TJ
        const bracketText = match.match(/\[(.*?)\]\s*TJ/g);
        if (bracketText) {
          bracketText.forEach(text => {
            const cleanText = text.replace(/^\[|\]\s*TJ$/g, '')
              .replace(/[()]/g, '')
              .replace(/\\[rn]/g, ' ')
              .trim();
            if (cleanText.length > 0) {
              extractedText += cleanText + ' ';
            }
          });
        }
      }
    }
    
    // Method 2: Look for direct text patterns with Tj operators
    const tjMatches = pdfString.match(/\(([^)]+)\)\s*Tj/g);
    if (tjMatches) {
      console.log(`Found ${tjMatches.length} Tj text patterns`);
      tjMatches.forEach(match => {
        const text = match.replace(/^\(|\)\s*Tj$/g, '').trim();
        if (text.length > 1 && !extractedText.includes(text)) {
          extractedText += text + ' ';
        }
      });
    }
    
    // Method 3: Look for plain text patterns (fallback)
    if (extractedText.length < 50) {
      console.log('Using fallback text extraction...');
      const patterns = [
        /\/F\d+\s+\d+\s+Tf\s*\((.*?)\)/g,
        /q\s+\d+\s+\d+\s+\d+\s+rg\s*\((.*?)\)/g,
        /BT[^E]*?Tf[^E]*?\((.*?)\)[^E]*?ET/g
      ];
      
      patterns.forEach(pattern => {
        const matches = pdfString.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const textMatch = match.match(/\((.*?)\)/);
            if (textMatch && textMatch[1]) {
              const cleanText = textMatch[1].trim();
              if (cleanText.length > 1 && !extractedText.includes(cleanText)) {
                extractedText += cleanText + ' ';
              }
            }
          });
        }
      });
    }
    
    console.log(`Total extracted text length: ${extractedText.length}`);
    return extractedText.trim();
  } catch (error) {
    console.error('Text extraction failed:', error);
    return '';
  }
}

// Send PDF as base64 to OpenAI for document analysis
async function extractWithPDFAPI(pdfBuffer: Uint8Array): Promise<ExtractedData> {
  const base64PDF = btoa(String.fromCharCode(...pdfBuffer));
  
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
          content: [
            {
              type: 'text',
              text: 'Analyze this PDF document and extract shipping information. The document is a carrier rate confirmation or load sheet.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64PDF}`,
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
    const errorText = await response.text();
    console.error('OpenAI PDF API error:', errorText);
    throw new Error(`OpenAI PDF API failed: ${response.status} - ${errorText}`);
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
        console.log('Text sample:', textContent.substring(0, 300));
        extractedData = await extractWithTextAPI(textContent);
        method = 'text_extraction';
        console.log('Text extraction successful:', extractedData);
      } else {
        throw new Error('Insufficient text extracted from PDF');
      }
    } catch (textError) {
      console.log('Text extraction failed:', textError.message);
      
      // Method 2: Try direct PDF analysis with OpenAI
      console.log('Attempting direct PDF analysis with OpenAI...');
      try {
        extractedData = await extractWithPDFAPI(pdfBuffer);
        method = 'pdf_analysis';
        console.log('PDF analysis successful:', extractedData);
      } catch (pdfError) {
        console.log('PDF analysis failed:', pdfError.message);
        throw new Error(`All extraction methods failed. Text: ${textError.message}, PDF: ${pdfError.message}`);
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