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
   * Parse PDF using Lovable's built-in document parser
   */
  static async parseOrderDocument(file: File): Promise<ExtractedOrderData> {
    try {
      console.log('Starting document extraction with Lovable document parser...');
      
      // Save the file temporarily so we can use Lovable's document parser
      const tempFileName = `temp-${Date.now()}-${file.name}`;
      
      // Create a temporary file in user-uploads
      const formData = new FormData();
      formData.append('file', file);
      
      // Create a temporary file path for the document parser
      const blob = new Blob([file], { type: file.type });
      const tempFile = new File([blob], tempFileName, { type: file.type });
      
      // Use Lovable's document parsing capabilities
      // Since we can't directly access the document parser from client code,
      // we'll need to create a better text extraction method
      
      console.log('Using improved PDF text extraction...');
      const extractedText = await this.extractPDFTextProperly(file);
      
      if (!extractedText || extractedText.length < 50) {
        throw new Error('Could not extract readable text from PDF - file might be image-based or heavily compressed');
      }
      
      console.log('Extracted readable text length:', extractedText.length);
      console.log('Text sample:', extractedText.substring(0, 500));
      
      // Parse the extracted text
      const extractedData = this.parseShippingText(extractedText);
      
      console.log('Final parsed data:', extractedData);
      return extractedData;
      
    } catch (error) {
      console.error('PDF parsing failed:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Properly extract text from PDF using a more reliable method
   */
  private static async extractPDFTextProperly(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);
          
          console.log('PDF file size:', bytes.length, 'bytes');
          
          // Convert to text for analysis
          const pdfText = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
          
          let extractedText = '';
          
          // Method 1: Look for text objects in PDF structure
          const textObjectRegex = /BT\s*(.*?)ET/gs;
          const textObjects = pdfText.match(textObjectRegex);
          
          if (textObjects) {
            console.log(`Found ${textObjects.length} text objects`);
            
            for (const textObj of textObjects) {
              // Extract text from Tj and TJ operators
              const tjRegex = /\((.*?)\)\s*Tj/g;
              const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
              
              let match;
              while ((match = tjRegex.exec(textObj)) !== null) {
                const text = match[1];
                if (text && this.isReadableText(text)) {
                  extractedText += this.cleanText(text) + ' ';
                }
              }
              
              while ((match = tjArrayRegex.exec(textObj)) !== null) {
                const arrayContent = match[1];
                const stringMatches = arrayContent.match(/\((.*?)\)/g);
                if (stringMatches) {
                  for (const str of stringMatches) {
                    const text = str.replace(/^\(|\)$/g, '');
                    if (text && this.isReadableText(text)) {
                      extractedText += this.cleanText(text) + ' ';
                    }
                  }
                }
              }
            }
          }
          
          // Method 2: Look for readable strings in the PDF
          const stringRegex = /\(([^)]{3,100})\)/g;
          let match;
          const foundStrings = new Set<string>();
          
          while ((match = stringRegex.exec(pdfText)) !== null) {
            const text = match[1];
            if (this.isReadableText(text) && !foundStrings.has(text)) {
              foundStrings.add(text);
              extractedText += this.cleanText(text) + ' ';
            }
          }
          
          // Method 3: Look for patterns that might be text content
          const patternRegex = /(?:^|\s)([A-Za-z0-9][A-Za-z0-9\s\.\,\-\$\#\@\(\)]{4,50})(?:\s|$)/g;
          while ((match = patternRegex.exec(pdfText)) !== null) {
            const text = match[1].trim();
            if (this.isReadableText(text) && text.length > 3) {
              extractedText += text + ' ';
            }
          }
          
          // Clean up the extracted text
          extractedText = extractedText
            .replace(/\\n/g, ' ')
            .replace(/\\r/g, ' ')
            .replace(/\\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Remove duplicates by splitting into words and using Set
          const words = extractedText.split(' ');
          const uniqueWords = [...new Set(words)].filter(word => 
            word.length > 0 && this.isReadableText(word)
          );
          
          const finalText = uniqueWords.join(' ');
          
          console.log(`Extracted ${finalText.length} characters of readable text`);
          
          if (finalText.length < 50) {
            // Last resort: try to find any readable content
            const lastResortText = this.extractLastResort(pdfText);
            if (lastResortText.length > finalText.length) {
              resolve(lastResortText);
              return;
            }
          }
          
          resolve(finalText);
          
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
   * Check if text is readable (contains normal characters)
   */
  private static isReadableText(text: string): boolean {
    if (!text || text.length < 2) return false;
    
    // Must contain at least some letters or numbers
    if (!/[A-Za-z0-9]/.test(text)) return false;
    
    // Should not be mostly special characters
    const specialCharCount = (text.match(/[^\w\s\.\,\-\$\#\@\(\)]/g) || []).length;
    if (specialCharCount > text.length * 0.5) return false;
    
    // Should not be all uppercase single characters
    if (/^[A-Z\s]+$/.test(text) && text.replace(/\s/g, '').length < 4) return false;
    
    return true;
  }

  /**
   * Clean extracted text
   */
  private static cleanText(text: string): string {
    return text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Last resort text extraction
   */
  private static extractLastResort(pdfText: string): string {
    console.log('Using last resort text extraction...');
    
    let text = '';
    
    // Look for common shipping document patterns
    const patterns = [
      /(?:LOAD|CONFIRMATION|ORDER)\s*#?\s*:?\s*([A-Z0-9\-_]{4,15})/gi,
      /(?:PICKUP|DELIVERY)\s*:?\s*([A-Za-z0-9\s,.-]{10,50})/gi,
      /\$\s*([0-9,]+\.?\d*)/g,
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
      /\b([A-Z\s]{5,30},\s*[A-Z]{2}\s+\d{5})\b/gi,
      /\b(\d{2,4})\s*(?:miles?|mi)\b/gi,
    ];
    
    for (const pattern of patterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (this.isReadableText(match)) {
            text += match + ' ';
          }
        });
      }
    }
    
    return text.trim();
  }

  /**
   * Parse shipping information from extracted text
   */
  private static parseShippingText(text: string): ExtractedOrderData {
    console.log('=== PARSING EXTRACTED TEXT ===');
    console.log('Text length:', text.length);
    console.log('Text sample:', text.substring(0, 300));
    
    const extractedData: ExtractedOrderData = {};
    
    if (!text || text.length < 10) {
      console.log('Insufficient text for parsing');
      return extractedData;
    }
    
    const normalizedText = text.toUpperCase();
    
    // Extract load number
    const loadPatterns = [
      /(?:LOAD|CONF|CONFIRMATION|ORDER|BOL)\s*#?\s*:?\s*([A-Z0-9\-_]{4,15})/i,
      /\b([A-Z]{2,4}\d{4,8})\b/,
      /\b(\d{6,10})\b/,
    ];
    
    for (const pattern of loadPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        extractedData.brokerLoadNumber = match[1];
        console.log('Found load number:', match[1]);
        break;
      }
    }
    
    // Extract broker/company
    const brokerPatterns = [
      /(?:BROKER|CARRIER|COMPANY)\s*:?\s*([A-Z\s&,\.]{5,40})/i,
      /\b([A-Z][A-Z\s&,\.]{8,35}(?:INC|LLC|CORP|LTD|CO))\b/i,
    ];
    
    for (const pattern of brokerPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim().length > 5) {
        extractedData.broker = match[1].trim();
        console.log('Found broker:', match[1].trim());
        break;
      }
    }
    
    // Extract addresses
    const addressPatterns = [
      /\b(\d+\s+[A-Za-z\s,\.]{10,50}\s+[A-Z]{2}\s+\d{5}(?:\-\d{4})?)/gi,
      /\b([A-Za-z\s,]{8,30},\s*[A-Z]{2}\s+\d{5})/gi,
      /\b([A-Za-z\s,]{10,40}\s+[A-Z]{2})\b/gi,
    ];
    
    let addresses: string[] = [];
    for (const pattern of addressPatterns) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].length > 10) {
          addresses.push(match[1].trim());
        }
      });
    }
    
    addresses = [...new Set(addresses)];
    if (addresses.length >= 1) {
      extractedData.pickupAddress = addresses[0];
      if (addresses.length >= 2) {
        extractedData.deliveryAddress = addresses[1];
      }
    }
    
    // Extract freight amount
    const moneyPatterns = [
      /\$\s*([0-9,]+\.?\d*)/g,
      /(?:RATE|FREIGHT|TOTAL)\s*:?\s*\$?\s*([0-9,]+\.?\d*)/i,
    ];
    
    for (const pattern of moneyPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (amount > 100 && amount < 50000) {
          extractedData.freightAmount = match[1];
          console.log('Found freight amount:', match[1]);
          break;
        }
      }
    }
    
    // Extract dates
    const datePatterns = [
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
      /\b((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{1,2},?\s+\d{2,4})/gi,
    ];
    
    let dates: string[] = [];
    for (const pattern of datePatterns) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) dates.push(match[1]);
      });
    }
    
    dates = [...new Set(dates)];
    if (dates.length >= 1) {
      extractedData.pickupDateTime = dates[0];
      if (dates.length >= 2) {
        extractedData.deliveryDateTime = dates[1];
      }
    }
    
    // Extract mileage
    const mileagePatterns = [
      /\b(\d{2,4})\s*(?:miles?|mi)\b/gi,
      /(?:LOADED|MILES)\s*:?\s*(\d{1,4})/i,
    ];
    
    let mileage: string[] = [];
    for (const pattern of mileagePatterns) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          const miles = parseInt(match[1]);
          if (miles > 10 && miles < 5000) {
            mileage.push(match[1]);
          }
        }
      });
    }
    
    mileage = [...new Set(mileage)];
    if (mileage.length >= 1) {
      extractedData.loadedMiles = mileage[0];
      if (mileage.length >= 2) {
        extractedData.dhMiles = mileage[1];
      }
    }
    
    console.log('=== FINAL EXTRACTED DATA ===');
    console.log(JSON.stringify(extractedData, null, 2));
    
    return extractedData;
  }
}