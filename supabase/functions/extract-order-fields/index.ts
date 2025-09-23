import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedData {
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

// Method 1: Try Claude for direct PDF analysis (best option)
async function extractWithClaudeDocument(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  console.log('Attempting Claude direct PDF analysis...');
  return await extractWithClaudeAPI(pdfBuffer);
}

// Method 2: Extract text and use OpenAI
async function extractWithTextExtraction(pdfBuffer: Uint8Array, fileName: string): Promise<ExtractedData> {
  console.log('Attempting text extraction + OpenAI...');
  
  const textContent = await extractTextFromPDF(pdfBuffer);
  
  if (textContent.length < 20) {
    throw new Error('Insufficient text extracted from PDF');
  }
  
  console.log(`Extracted ${textContent.length} characters of text`);
  console.log('Text sample:', textContent.substring(0, 500));
  
  return await extractWithOpenAI(textContent);
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

// Extract data using Claude (Anthropic) for better document analysis
async function extractWithClaudeAPI(pdfBuffer: Uint8Array): Promise<ExtractedData> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    console.log('Anthropic API key not found, falling back to OpenAI');
    throw new Error('Anthropic API key not configured');
  }

  console.log('Using Claude for PDF analysis...');
  
  // Convert PDF to base64 for Claude
  const base64Pdf = btoa(String.fromCharCode(...pdfBuffer));
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf
                }
              },
              {
                type: 'text',
                text: `Analyze this shipping/logistics PDF document and extract ALL available information. Return ONLY a JSON object with these fields (omit fields if not found):

{
  "brokerLoadNumber": "load/order/confirmation/BOL number",
  "internalLoadNumber": "internal reference number",
  "broker": "broker/carrier company name",
  "pickupAddress": "complete pickup street address",
  "pickupCity": "pickup city",
  "pickupState": "pickup state (2-letter code)",
  "pickupDate": "pickup date in YYYY-MM-DD format",
  "deliveryAddress": "complete delivery street address", 
  "deliveryCity": "delivery city",
  "deliveryState": "delivery state (2-letter code)",
  "deliveryDate": "delivery date in YYYY-MM-DD format",
  "freightAmount": "freight cost as number (no $ or commas)",
  "mileage": "total miles as number",
  "commodity": "type of goods being shipped",
  "weight": "weight in pounds as number",
  "trailer": "trailer type or number",
  "equipment": "equipment requirements",
  "temperature": "temperature requirements",
  "notes": "special instructions or notes"
}

Look for: load numbers, confirmation numbers, BOL numbers, company names, addresses, dates, dollar amounts, mileage, commodity descriptions, weight, and any special instructions. Return ONLY the JSON object.`
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const content = result.content[0].text.trim();
    
    console.log('Claude raw response:', content);
    
    // Parse Claude's response
    let cleanContent = content;
    if (content.includes('```json')) {
      cleanContent = content.match(/```json\s*(.*?)\s*```/s)?.[1] || content;
    } else if (content.includes('```')) {
      cleanContent = content.match(/```\s*(.*?)\s*```/s)?.[1] || content;
    }
    
    try {
      const parsed = JSON.parse(cleanContent);
      console.log('Successfully parsed Claude response:', parsed);
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError);
      console.error('Content to parse:', cleanContent);
      throw new Error(`Failed to parse Claude response: ${parseError.message}`);
    }
    
  } catch (error) {
    console.error('Claude extraction failed:', error);
    throw error;
  }
}

// Improved OpenAI text extraction with better prompting
async function extractWithOpenAI(textContent: string): Promise<ExtractedData> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('Using OpenAI for text analysis, length:', textContent.length);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert logistics document parser. Extract shipping information from PDF text content and return ONLY a valid JSON object.

IMPORTANT: The text may be garbled or contain PDF artifacts. Use pattern recognition to identify:
- Numbers that could be load/confirmation numbers (usually 6+ characters)
- Company names (often contain keywords like "TRANSPORT", "LOGISTICS", "FREIGHT", "INC", "LLC")
- Addresses (street + city + state pattern)
- Dollar amounts ($X,XXX.XX format)
- Dates (MM/DD/YYYY, MM-DD-YYYY formats)
- Mileage numbers (usually 100-3000 range followed by "miles" or "mi")

Return JSON with only found fields (omit if not found):
{
  "brokerLoadNumber": "string",
  "broker": "string", 
  "pickupAddress": "string",
  "pickupCity": "string",
  "pickupState": "string",
  "pickupDate": "string (YYYY-MM-DD)",
  "deliveryAddress": "string",
  "deliveryCity": "string", 
  "deliveryState": "string",
  "deliveryDate": "string (YYYY-MM-DD)",
  "freightAmount": "number",
  "mileage": "number",
  "commodity": "string",
  "weight": "number"
}`
        },
        {
          role: 'user', 
          content: `Extract shipping information from this PDF text (may contain artifacts):

${textContent.substring(0, 4000)}`
        }
      ],
      max_tokens: 800,
      temperature: 0.0
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content.trim();
  
  console.log('OpenAI raw response:', content);
  
  let cleanContent = content;
  if (content.includes('```json')) {
    cleanContent = content.match(/```json\s*(.*?)\s*```/s)?.[1] || content;
  } else if (content.includes('```')) {
    cleanContent = content.match(/```\s*(.*?)\s*```/s)?.[1] || content;
  }
  
  try {
    const parsed = JSON.parse(cleanContent);
    console.log('Successfully parsed OpenAI response:', parsed);
    return parsed;
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', parseError);
    throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
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
    
    let extractedData: ExtractedData | null = null;
    let method = '';

    // Method 1: Try Claude for direct PDF analysis (best results)
    console.log('Attempting Claude PDF analysis...');
    try {
      extractedData = await extractWithClaudeDocument(pdfBuffer, file.name);
      method = 'claude_pdf';
      console.log('Claude PDF analysis successful:', extractedData);
    } catch (claudeError) {
      console.log('Claude PDF analysis failed:', claudeError.message);
      
      // Method 2: Try text extraction + OpenAI
      console.log('Attempting text extraction + OpenAI...');
      try {
        extractedData = await extractWithTextExtraction(pdfBuffer, file.name);
        method = 'text_openai';
        console.log('Text + OpenAI extraction successful:', extractedData);
      } catch (textError) {
        console.log('Text + OpenAI extraction failed:', textError.message);
        
        // Method 3: Final fallback with basic text patterns
        console.log('Attempting basic pattern matching...');
        try {
          const textContent = await extractTextFromPDF(pdfBuffer);
          console.log('Extracted raw text length:', textContent.length);
          
          if (textContent.length > 50) {
            // Try basic pattern matching for load numbers, dates, amounts
            const patterns = {
              loadNumber: textContent.match(/[A-Z0-9]{6,20}/g)?.[0],
              amount: textContent.match(/\$?\s*([0-9,]+\.?\d{0,2})/g)?.[0],
              date: textContent.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g)?.[0]
            };
            
            extractedData = {};
            if (patterns.loadNumber) extractedData.brokerLoadNumber = patterns.loadNumber;
            if (patterns.amount) extractedData.freightAmount = parseFloat(patterns.amount.replace(/[$,]/g, ''));
            if (patterns.date) extractedData.pickupDate = patterns.date;
            
            method = 'pattern_matching';
            console.log('Pattern matching results:', extractedData);
          } else {
            throw new Error('Could not extract any readable content from PDF');
          }
        } catch (patternError) {
          console.log('All extraction methods failed completely');
          throw new Error(`All methods failed: Claude: ${claudeError.message}, Text: ${textError.message}, Pattern: ${patternError.message}`);
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