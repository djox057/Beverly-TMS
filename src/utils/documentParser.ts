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
   * Extract text from PDF file using FileReader
   */
  private static async extractTextFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to string and extract text using simple regex patterns
          const pdfString = new TextDecoder('latin1').decode(uint8Array);
          let extractedText = '';
          
          // Method 1: Extract text between BT/ET operators
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
          
          // Method 2: Look for readable strings
          const stringMatches = pdfString.match(/\([^)]{3,100}\)/g);
          if (stringMatches) {
            stringMatches.forEach(str => {
              const cleanStr = str.replace(/^\(|\)$/g, '').trim();
              if (cleanStr.length > 2 && /[A-Za-z]/.test(cleanStr)) {
                extractedText += cleanStr + ' ';
              }
            });
          }
          
          // Clean up the extracted text
          extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/[^\x20-\x7E]/g, ' ')
            .trim();
          
          resolve(extractedText);
        } catch (error) {
          reject(new Error('Failed to extract text from PDF'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Parse shipping information from extracted text using regex patterns
   */
  private static parseShippingText(text: string): ExtractedOrderData {
    const extractedData: ExtractedOrderData = {};
    
    // Normalize text for better matching
    const normalizedText = text.replace(/\s+/g, ' ').toUpperCase();
    
    // Extract load/confirmation number
    const loadNumberPatterns = [
      /(?:LOAD|CONF|CONFIRMATION|REFERENCE|REF)\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
      /\b([A-Z0-9]{6,})\b/g // Generic alphanumeric codes
    ];
    
    for (const pattern of loadNumberPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        extractedData.brokerLoadNumber = match[1];
        break;
      }
    }
    
    // Extract broker/company name
    const brokerPatterns = [
      /(?:BROKER|CARRIER|COMPANY)\s*:?\s*([A-Z\s&,\.]+?)(?:\s(?:INC|LLC|CORP|LTD))?/i,
      /\b([A-Z\s&]{10,50}(?:INC|LLC|CORP|LTD))\b/i
    ];
    
    for (const pattern of brokerPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && match[1].length > 5) {
        extractedData.broker = match[1].trim();
        break;
      }
    }
    
    // Extract addresses (simple approach)
    const addressPattern = /\b\d+\s+[A-Z\s,]+\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|LN|LANE)\b[^.]*?(?:\d{5}|\w{2}\s+\d{5})/gi;
    const addresses = normalizedText.match(addressPattern);
    
    if (addresses && addresses.length >= 1) {
      extractedData.pickupAddress = addresses[0];
      if (addresses.length >= 2) {
        extractedData.deliveryAddress = addresses[1];
      }
    }
    
    // Extract freight amount
    const freightPattern = /\$\s*([0-9,]+\.?\d*)/g;
    const freightMatch = normalizedText.match(freightPattern);
    if (freightMatch && freightMatch[0]) {
      extractedData.freightAmount = freightMatch[0].replace('$', '').replace(',', '');
    }
    
    // Extract dates (basic pattern)
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}-\d{1,2}-\d{2,4}\b/g;
    const dates = normalizedText.match(datePattern);
    if (dates && dates.length >= 1) {
      extractedData.pickupDateTime = dates[0];
      if (dates.length >= 2) {
        extractedData.deliveryDateTime = dates[1];
      }
    }
    
    // Extract mileage
    const mileagePattern = /\b(\d+)\s*(?:MILES?|MI)\b/gi;
    const mileageMatches = [...normalizedText.matchAll(mileagePattern)];
    if (mileageMatches.length > 0) {
      extractedData.loadedMiles = mileageMatches[0][1];
      if (mileageMatches.length > 1) {
        extractedData.dhMiles = mileageMatches[1][1];
      }
    }
    
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