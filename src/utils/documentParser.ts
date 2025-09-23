import { supabase } from "@/integrations/supabase/client";

export interface ExtractedOrderData {
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

export class DocumentParser {
  /**
   * Parse PDF using Lovable's built-in document parsing
   */
  static async parsePDFWithLovable(file: File): Promise<ExtractedOrderData> {
    try {
      console.log('Starting PDF parsing with Lovable document parser...');
      
      // For now, we'll use a simple approach that extracts text and processes it
      // This is more reliable than trying to send PDFs to external APIs
      
      const fileText = await this.extractTextFromFile(file);
      console.log('Extracted text length:', fileText.length);
      
      if (fileText.length < 50) {
        throw new Error('Could not extract sufficient text from PDF');
      }
      
      // Process the extracted text to find shipping information
      const extractedData = this.parseShippingText(fileText);
      
      console.log('Parsed shipping data:', extractedData);
      return extractedData;
      
    } catch (error) {
      console.error('PDF parsing failed:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from PDF file using multiple extraction methods
   */
  private static async extractTextFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          console.log('PDF file size:', uint8Array.length, 'bytes');
          
          // Convert to string for text extraction
          const pdfString = new TextDecoder('latin1').decode(uint8Array);
          let extractedText = '';
          
          console.log('Starting multi-method text extraction...');
          
          // Method 1: Extract text between BT/ET operators (most reliable)
          const textMatches = pdfString.match(/BT\s*.*?ET/gs);
          if (textMatches) {
            console.log(`Found ${textMatches.length} BT/ET text blocks`);
            for (const match of textMatches) {
              // Look for standard Tj operators
              const tjMatches = match.match(/\((.*?)\)\s*Tj/g);
              if (tjMatches) {
                tjMatches.forEach(text => {
                  const cleanText = text.replace(/^\(|\)\s*Tj$/g, '').replace(/\\[rn]/g, ' ').trim();
                  if (cleanText.length > 0) {
                    extractedText += cleanText + ' ';
                  }
                });
              }
              
              // Look for TJ operators (text arrays)
              const tjArrayMatches = match.match(/\[(.*?)\]\s*TJ/g);
              if (tjArrayMatches) {
                tjArrayMatches.forEach(arrayText => {
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
          
          // Method 2: Extract from PDF streams
          const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs);
          if (streamMatches) {
            console.log(`Found ${streamMatches.length} stream objects`);
            for (const stream of streamMatches) {
              // Look for readable text patterns
              const readableMatches = stream.match(/\b[A-Za-z][A-Za-z0-9\s\$\.\,\-\#\@\(\)]{5,}\b/g);
              if (readableMatches) {
                readableMatches.forEach(text => {
                  const cleanText = text.trim();
                  if (cleanText.length > 3 && 
                      !cleanText.includes('obj') && 
                      !cleanText.includes('endobj') &&
                      !cleanText.includes('stream') &&
                      /[A-Za-z]/.test(cleanText)) {
                    extractedText += cleanText + ' ';
                  }
                });
              }
            }
          }
          
          // Method 3: Extract quoted strings throughout the PDF
          const quotedStrings = pdfString.match(/\([^)]{2,80}\)/g);
          if (quotedStrings) {
            console.log(`Found ${quotedStrings.length} quoted strings`);
            quotedStrings.forEach(str => {
              const cleanStr = str.replace(/^\(|\)$/g, '').trim();
              if (cleanStr.length > 2 && 
                  /[A-Za-z]/.test(cleanStr) && 
                  !cleanStr.match(/^[0-9\.\s]+$/)) {
                extractedText += cleanStr + ' ';
              }
            });
          }
          
          // Method 4: Look for common shipping document keywords and extract surrounding text
          const keywords = ['LOAD', 'PICKUP', 'DELIVERY', 'BROKER', 'CARRIER', 'FREIGHT', 'RATE', 'MILES'];
          keywords.forEach(keyword => {
            const keywordRegex = new RegExp(`([^\\n]{0,50}${keyword}[^\\n]{0,50})`, 'gi');
            const keywordMatches = pdfString.match(keywordRegex);
            if (keywordMatches) {
              keywordMatches.forEach(match => {
                // Clean up the match
                const cleanMatch = match.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleanMatch.length > keyword.length + 5) {
                  extractedText += cleanMatch + ' ';
                }
              });
            }
          });
          
          // Clean up the final extracted text
          extractedText = extractedText
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^\x20-\x7E]/g, ' ') // Remove non-printable chars
            .replace(/\b\w{1}\b/g, ' ') // Remove single characters
            .replace(/\s+/g, ' ') // Normalize whitespace again
            .trim();
          
          console.log(`Final extracted text length: ${extractedText.length} characters`);
          
          if (extractedText.length < 50) {
            console.warn('Very little text extracted. PDF might be image-based or encrypted.');
          }
          
          resolve(extractedText);
        } catch (error) {
          console.error('Text extraction error:', error);
          reject(new Error('Failed to extract text from PDF'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Parse shipping information from extracted text using improved regex patterns
   */
  private static parseShippingText(text: string): ExtractedOrderData {
    console.log('=== DEBUGGING EXTRACTED TEXT ===');
    console.log('Raw text length:', text.length);
    console.log('Text sample (first 500 chars):', text.substring(0, 500));
    console.log('Text sample (last 500 chars):', text.substring(Math.max(0, text.length - 500)));
    
    const extractedData: ExtractedOrderData = {};
    
    // Clean and normalize text for better matching
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const upperText = normalizedText.toUpperCase();
    
    console.log('=== STARTING FIELD EXTRACTION ===');
    
    // Extract load/confirmation number with improved patterns
    const loadNumberPatterns = [
      /(?:LOAD|CONF|CONFIRMATION|REFERENCE|REF|ORDER)\s*#?\s*:?\s*([A-Z0-9\-_]{4,15})/i,
      /\b(LD\d+)\b/i, // Load numbers starting with LD
      /\b([A-Z]{2,4}\d{4,8})\b/g, // Letter-number combinations
      /\b(\d{6,10})\b/g, // Pure numeric codes
      /BOL\s*:?\s*([A-Z0-9\-_]+)/i, // Bill of lading
    ];
    
    for (const pattern of loadNumberPatterns) {
      const match = upperText.match(pattern);
      if (match && match[1] && match[1].length >= 4) {
        extractedData.brokerLoadNumber = match[1];
        console.log('Found load number:', match[1], 'using pattern:', pattern.source);
        break;
      }
    }
    
    // Extract broker/company name with context-aware patterns
    const brokerPatterns = [
      /(?:BROKER|CARRIER|COMPANY|SHIPPER|CUSTOMER)\s*:?\s*([A-Z\s&,\.]{5,40}?)(?:\s+(?:INC|LLC|CORP|LTD|CO))?/i,
      /(?:FROM|TO|SHIP\s+TO|DELIVER\s+TO)\s*:?\s*([A-Z\s&,\.]{8,40}?)(?:\n|\s{3,})/i,
      /\b([A-Z][A-Z\s&,\.]{10,35}(?:INC|LLC|CORP|LTD|COMPANY|CO))\b/i,
    ];
    
    for (const pattern of brokerPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && match[1].trim().length > 6) {
        const brokerName = match[1].trim().replace(/\s+/g, ' ');
        // Filter out common false positives
        if (!brokerName.match(/^(THE|AND|FOR|FROM|WITH|DATE|TIME|LOAD|TOTAL)$/i)) {
          extractedData.broker = brokerName;
          console.log('Found broker:', brokerName, 'using pattern:', pattern.source);
          break;
        }
      }
    }
    
    // Extract addresses with improved patterns
    const addressPatterns = [
      // Street address with city, state, zip
      /\b(\d+\s+[A-Z\s,\.]{3,40}\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|CT|COURT|CIR|CIRCLE)\b[^.]*?[A-Z]{2}\s+\d{5}(?:\-\d{4})?)/gi,
      // Address with zip code
      /\b([A-Z\s,\.]{10,50}\s+[A-Z]{2}\s+\d{5}(?:\-\d{4})?)/gi,
      // City, State format
      /\b([A-Z\s,]{5,30},\s*[A-Z]{2})\b/gi,
    ];
    
    let foundAddresses: string[] = [];
    for (const pattern of addressPatterns) {
      const matches = [...normalizedText.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].length > 10) {
          foundAddresses.push(match[1].trim());
        }
      });
    }
    
    // Remove duplicates and assign pickup/delivery
    foundAddresses = [...new Set(foundAddresses)];
    console.log('Found addresses:', foundAddresses);
    
    if (foundAddresses.length >= 1) {
      extractedData.pickupAddress = foundAddresses[0];
      if (foundAddresses.length >= 2) {
        extractedData.deliveryAddress = foundAddresses[1];
      }
    }
    
    // Extract freight amount with currency patterns
    const freightPatterns = [
      /(?:RATE|FREIGHT|AMOUNT|TOTAL|PAY)\s*:?\s*\$\s*([0-9,]+\.?\d*)/i,
      /\$\s*([0-9,]+\.?\d*)/g,
      /(?:USD|DOLLARS?)\s*([0-9,]+\.?\d*)/i,
    ];
    
    for (const pattern of freightPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        const amount = match[1].replace(/,/g, '');
        if (parseFloat(amount) > 50) { // Reasonable freight minimum
          extractedData.freightAmount = amount;
          console.log('Found freight amount:', amount, 'using pattern:', pattern.source);
          break;
        }
      }
    }
    
    // Extract dates with multiple formats
    const datePatterns = [
      /(?:PICKUP|PICK\s*UP|DELIVER|DELIVERY|DATE)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
      /\b((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{1,2},?\s+\d{2,4})/gi,
    ];
    
    let foundDates: string[] = [];
    for (const pattern of datePatterns) {
      if (pattern.global) {
        const matches = [...upperText.matchAll(pattern as RegExp)];
        matches.forEach(match => {
          if (match[1]) foundDates.push(match[1]);
        });
      } else {
        const match = upperText.match(pattern);
        if (match && match[1]) foundDates.push(match[1]);
      }
    }
    
    foundDates = [...new Set(foundDates)];
    console.log('Found dates:', foundDates);
    
    if (foundDates.length >= 1) {
      extractedData.pickupDateTime = foundDates[0];
      if (foundDates.length >= 2) {
        extractedData.deliveryDateTime = foundDates[1];
      }
    }
    
    // Extract mileage with better context
    const mileagePatterns = [
      /(?:LOADED|MILES?|MILEAGE)\s*:?\s*(\d{1,4})/i,
      /(?:DEADHEAD|DH|EMPTY)\s*:?\s*(\d{1,4})/i,
      /\b(\d{2,4})\s*(?:MILES?|MI)\b/gi,
    ];
    
    let foundMileage: string[] = [];
    for (const pattern of mileagePatterns) {
      if (pattern.global) {
        const matches = [...upperText.matchAll(pattern as RegExp)];
        matches.forEach(match => {
          if (match[1] && parseInt(match[1]) > 10 && parseInt(match[1]) < 5000) {
            foundMileage.push(match[1]);
          }
        });
      } else {
        const match = upperText.match(pattern);
        if (match && match[1] && parseInt(match[1]) > 10 && parseInt(match[1]) < 5000) {
          foundMileage.push(match[1]);
        }
      }
    }
    
    foundMileage = [...new Set(foundMileage)];
    console.log('Found mileage:', foundMileage);
    
    if (foundMileage.length >= 1) {
      extractedData.loadedMiles = foundMileage[0];
      if (foundMileage.length >= 2) {
        extractedData.dhMiles = foundMileage[1];
      }
    }
    
    console.log('=== FINAL EXTRACTED DATA ===');
    console.log(JSON.stringify(extractedData, null, 2));
    
    return extractedData;
  }

  /**
   * Fallback: Try using the existing Supabase edge function
   */
  static async parseWithEdgeFunction(file: File): Promise<ExtractedOrderData> {
    try {
      console.log('Attempting edge function parsing...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const { data, error } = await supabase.functions.invoke('extract-order-fields', {
        body: formData,
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Edge function failed');
      }
      
      return data.data;
    } catch (error) {
      console.error('Edge function parsing failed:', error);
      throw error;
    }
  }

  /**
   * Main parsing method - tries multiple approaches
   */
  static async parseOrderDocument(file: File): Promise<ExtractedOrderData> {
    // Try client-side parsing first (more reliable)
    try {
      return await this.parsePDFWithLovable(file);
    } catch (lovableError) {
      console.log('Client-side parsing failed:', lovableError.message);
      
      // Fallback to edge function
      try {
        return await this.parseWithEdgeFunction(file);
      } catch (edgeError) {
        console.log('Edge function parsing failed:', edgeError.message);
        throw new Error(`All parsing methods failed. Client-side: ${lovableError.message}, Edge function: ${edgeError.message}`);
      }
    }
  }
}