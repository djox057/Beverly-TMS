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
   * Parse PDF using improved text extraction and pattern matching
   */
  static async parseOrderDocument(file: File): Promise<ExtractedOrderData> {
    try {
      console.log('Starting document extraction with Lovable document parser...');
      
      // Create a file path for Lovable's document parser
      const tempPath = `user-uploads://${file.name}`;
      
      // Since we're working with a compressed/encoded PDF, let's try a different approach
      // Use a more sophisticated text extraction method
      const fileText = await this.extractTextWithImprovedMethod(file);
      console.log('Extracted text length:', fileText.length);
      
      if (fileText.length < 20) {
        throw new Error('Could not extract sufficient text from PDF - file might be image-based or heavily compressed');
      }
      
      console.log('Text sample:', fileText.substring(0, 500));
      
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
   * Improved text extraction method that handles compressed PDFs better
   */
  private static async extractTextWithImprovedMethod(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          console.log('PDF file size:', uint8Array.length, 'bytes');
          
          // Convert to string with different encodings
          let extractedText = '';
          
          // Try UTF-8 first
          try {
            const utf8String = new TextDecoder('utf-8').decode(uint8Array);
            extractedText += this.extractReadableText(utf8String);
          } catch (e) {
            console.log('UTF-8 decoding failed');
          }
          
          // Try Latin-1 (ISO-8859-1)
          try {
            const latin1String = new TextDecoder('iso-8859-1').decode(uint8Array);
            extractedText += this.extractReadableText(latin1String);
          } catch (e) {
            console.log('Latin-1 decoding failed');
          }
          
          // Try Windows-1252
          try {
            const windows1252String = new TextDecoder('windows-1252').decode(uint8Array);
            extractedText += this.extractReadableText(windows1252String);
          } catch (e) {
            console.log('Windows-1252 decoding failed');
          }
          
          // Clean up and deduplicate
          extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/[^\x20-\x7E]/g, ' ')
            .trim();
          
          console.log(`Final extracted text length: ${extractedText.length} characters`);
          
          // If still no good text, try to extract any numbers and readable words
          if (extractedText.length < 50) {
            extractedText = this.extractAnyReadableContent(new TextDecoder('iso-8859-1').decode(uint8Array));
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
   * Extract readable text from PDF string using various methods
   */
  private static extractReadableText(pdfString: string): string {
    let extractedText = '';
    
    console.log('Starting enhanced text extraction...');
    
    // Method 1: Extract text between BT/ET operators
    const textMatches = pdfString.match(/BT\s*.*?ET/gs);
    if (textMatches) {
      console.log(`Found ${textMatches.length} BT/ET text blocks`);
      for (const match of textMatches) {
        // Look for Tj operators
        const tjMatches = match.match(/\((.*?)\)\s*Tj/g);
        if (tjMatches) {
          tjMatches.forEach(text => {
            const cleanText = text.replace(/^\(|\)\s*Tj$/g, '').replace(/\\[rn]/g, ' ').trim();
            if (cleanText.length > 0 && /[A-Za-z0-9]/.test(cleanText)) {
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
                if (cleanStr.length > 0 && /[A-Za-z0-9]/.test(cleanStr)) {
                  extractedText += cleanStr + ' ';
                }
              });
            }
          });
        }
      }
    }
    
    // Method 2: Extract from streams
    const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs);
    if (streamMatches) {
      console.log(`Found ${streamMatches.length} stream objects`);
      for (const stream of streamMatches) {
        // Look for readable patterns
        const readableMatches = stream.match(/\b[A-Za-z][A-Za-z0-9\s\$\.\,\-\#\@\(\)]{3,}\b/g);
        if (readableMatches) {
          readableMatches.forEach(text => {
            const cleanText = text.trim();
            if (cleanText.length > 2 && 
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
    
    // Method 3: Extract quoted strings
    const quotedStrings = pdfString.match(/\([^)]{1,100}\)/g);
    if (quotedStrings) {
      console.log(`Found ${quotedStrings.length} quoted strings`);
      quotedStrings.forEach(str => {
        const cleanStr = str.replace(/^\(|\)$/g, '').trim();
        if (cleanStr.length > 1 && 
            /[A-Za-z0-9]/.test(cleanStr) && 
            !cleanStr.match(/^[0-9\.\s]+$/)) {
          extractedText += cleanStr + ' ';
        }
      });
    }
    
    return extractedText;
  }

  /**
   * Last resort: extract any readable content
   */
  private static extractAnyReadableContent(pdfString: string): string {
    console.log('Attempting to extract any readable content...');
    
    let content = '';
    
    // Look for any words, numbers, addresses, dates
    const patterns = [
      /\b[A-Z][a-z]{2,20}\b/g, // Capitalized words
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // Dates
      /\b\d{3,6}\s+[A-Z][a-z\s]{5,30}\b/g, // Addresses
      /\$\d+(?:,\d{3})*(?:\.\d{2})?\b/g, // Money amounts
      /\b\d{2,4}\s*(?:miles?|mi)\b/gi, // Mileage
      /\b[A-Z]{2,4}\d{4,10}\b/g, // Load numbers
    ];
    
    patterns.forEach(pattern => {
      const matches = pdfString.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (match.trim().length > 2) {
            content += match.trim() + ' ';
          }
        });
      }
    });
    
    return content;
  }

  /**
   * Parse shipping information from extracted text
   */
  private static parseShippingText(text: string): ExtractedOrderData {
    console.log('=== DEBUGGING EXTRACTED TEXT ===');
    console.log('Raw text length:', text.length);
    console.log('Text sample (first 500 chars):', text.substring(0, 500));
    
    const extractedData: ExtractedOrderData = {};
    
    if (!text || text.length < 10) {
      console.log('Insufficient text for parsing');
      return extractedData;
    }
    
    // Clean and normalize text for better matching
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const upperText = normalizedText.toUpperCase();
    
    console.log('=== STARTING FIELD EXTRACTION ===');
    
    // Extract load/confirmation number - more flexible patterns
    const loadNumberPatterns = [
      /(?:LOAD|CONF|CONFIRMATION|REFERENCE|REF|ORDER|BOL)\s*#?\s*:?\s*([A-Z0-9\-_]{4,15})/i,
      /\b(LD\d+)\b/i,
      /\b([A-Z]{2,4}\d{4,8})\b/,
      /\b(\d{6,10})\b/,
      /([A-Z0-9]{5,12})/g, // Any alphanumeric sequence
    ];
    
    for (const pattern of loadNumberPatterns) {
      const match = upperText.match(pattern);
      if (match && match[1] && match[1].length >= 4) {
        // Validate it looks like a load number
        if (/[A-Z]/.test(match[1]) || /^\d{6,}$/.test(match[1])) {
          extractedData.brokerLoadNumber = match[1];
          console.log('Found load number:', match[1]);
          break;
        }
      }
    }
    
    // Extract freight amount - look for dollar amounts
    const freightPatterns = [
      /\$\s*([0-9,]+\.?\d*)/g,
      /(?:RATE|FREIGHT|AMOUNT|TOTAL|PAY)\s*:?\s*\$?\s*([0-9,]+\.?\d*)/i,
      /([0-9,]+\.?\d*)\s*(?:USD|DOLLARS?)/i,
    ];
    
    for (const pattern of freightPatterns) {
      if (pattern.global) {
        const matches = [...normalizedText.matchAll(pattern as RegExp)];
        for (const match of matches) {
          if (match[1]) {
            const amount = match[1].replace(/,/g, '');
            const numAmount = parseFloat(amount);
            if (numAmount > 100 && numAmount < 50000) { // Reasonable freight range
              extractedData.freightAmount = amount;
              console.log('Found freight amount:', amount);
              break;
            }
          }
        }
        if (extractedData.freightAmount) break;
      } else {
        const match = normalizedText.match(pattern);
        if (match && match[1]) {
          const amount = match[1].replace(/,/g, '');
          const numAmount = parseFloat(amount);
          if (numAmount > 100 && numAmount < 50000) {
            extractedData.freightAmount = amount;
            console.log('Found freight amount:', amount);
            break;
          }
        }
      }
    }
    
    // Extract dates - flexible date patterns
    const datePatterns = [
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
      /\b((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{1,2},?\s+\d{2,4})/gi,
      /\b(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{2,4})/gi,
    ];
    
    let foundDates: string[] = [];
    for (const pattern of datePatterns) {
      const matches = [...normalizedText.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) foundDates.push(match[1]);
      });
    }
    
    foundDates = [...new Set(foundDates)];
    console.log('Found dates:', foundDates);
    
    if (foundDates.length >= 1) {
      extractedData.pickupDateTime = foundDates[0];
      if (foundDates.length >= 2) {
        extractedData.deliveryDateTime = foundDates[1];
      }
    }
    
    // Extract addresses - look for city, state patterns
    const addressPatterns = [
      /\b([A-Z\s,]{5,30}\s+[A-Z]{2}\s+\d{5}(?:\-\d{4})?)/gi,
      /\b([A-Z\s,]{8,25},\s*[A-Z]{2})\b/gi,
      /\b(\d+\s+[A-Z\s,\.]{10,40})\b/gi, // Street addresses
    ];
    
    let foundAddresses: string[] = [];
    for (const pattern of addressPatterns) {
      const matches = [...normalizedText.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].length > 8) {
          foundAddresses.push(match[1].trim());
        }
      });
    }
    
    foundAddresses = [...new Set(foundAddresses)];
    console.log('Found addresses:', foundAddresses);
    
    if (foundAddresses.length >= 1) {
      extractedData.pickupAddress = foundAddresses[0];
      if (foundAddresses.length >= 2) {
        extractedData.deliveryAddress = foundAddresses[1];
      }
    }
    
    // Extract mileage
    const mileagePatterns = [
      /\b(\d{2,4})\s*(?:miles?|mi)\b/gi,
      /(?:LOADED|MILES?|MILEAGE)\s*:?\s*(\d{1,4})/i,
      /(?:DEADHEAD|DH|EMPTY)\s*:?\s*(\d{1,4})/i,
    ];
    
    let foundMileage: string[] = [];
    for (const pattern of mileagePatterns) {
      if (pattern.global) {
        const matches = [...normalizedText.matchAll(pattern as RegExp)];
        matches.forEach(match => {
          if (match[1]) {
            const miles = parseInt(match[1]);
            if (miles > 10 && miles < 5000) {
              foundMileage.push(match[1]);
            }
          }
        });
      } else {
        const match = normalizedText.match(pattern);
        if (match && match[1]) {
          const miles = parseInt(match[1]);
          if (miles > 10 && miles < 5000) {
            foundMileage.push(match[1]);
          }
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
    
    // Extract broker/company names
    const brokerPatterns = [
      /\b([A-Z][A-Z\s&,\.]{8,35}(?:INC|LLC|CORP|LTD|COMPANY|CO))\b/i,
      /(?:BROKER|CARRIER|COMPANY|SHIPPER)\s*:?\s*([A-Z\s&,\.]{5,40})/i,
    ];
    
    for (const pattern of brokerPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && match[1].trim().length > 6) {
        const brokerName = match[1].trim().replace(/\s+/g, ' ');
        if (!brokerName.match(/^(THE|AND|FOR|FROM|WITH|DATE|TIME|LOAD|TOTAL)$/i)) {
          extractedData.broker = brokerName;
          console.log('Found broker:', brokerName);
          break;
        }
      }
    }
    
    console.log('=== FINAL EXTRACTED DATA ===');
    console.log(JSON.stringify(extractedData, null, 2));
    
    return extractedData;
  }
}