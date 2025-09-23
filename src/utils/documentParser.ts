import { supabase } from "@/integrations/supabase/client";

export interface ExtractedOrderData {
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
  // Legacy fields for backward compatibility
  pickupDateTime?: string;
  deliveryDateTime?: string;
  dhMiles?: string;
  loadedMiles?: string;
  additionalPickups?: Array<{
    type: 'pickup' | 'delivery';
    address: string;
    datetime?: string;
  }>;
}

/**
 * Main function to parse shipping documents using Supabase edge function with OpenAI
 */
export const parseShippingDocument = async (file: File): Promise<ExtractedOrderData> => {
  console.log('Starting document extraction with Supabase edge function...');
  
  try {
    // Use the Supabase edge function for PDF extraction
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Calling extract-order-fields edge function...');
    
    const response = await supabase.functions.invoke('extract-order-fields', {
      body: formData,
    });

    console.log('Edge function response:', response);

    if (response.error) {
      console.error('Edge function error:', response.error);
      throw new Error(response.error.message || 'Edge function failed');
    }

    if (!response.data?.success) {
      console.error('Extraction failed:', response.data?.error);
      throw new Error(response.data?.error || 'Failed to extract data');
    }

    const extractedData = response.data.data;
    console.log('Successfully extracted data:', extractedData);
    
    // Add legacy compatibility fields
    if (extractedData) {
      if (extractedData.pickupDate && !extractedData.pickupDateTime) {
        extractedData.pickupDateTime = extractedData.pickupDate;
      }
      if (extractedData.deliveryDate && !extractedData.deliveryDateTime) {
        extractedData.deliveryDateTime = extractedData.deliveryDate;
      }
      if (extractedData.mileage && !extractedData.loadedMiles) {
        extractedData.loadedMiles = extractedData.mileage.toString();
      }
    }
    
    return extractedData || {};
    
  } catch (error) {
    console.error('Document extraction failed:', error);
    throw new Error(`Failed to extract document data: ${error.message}`);
  }
};

export class DocumentParser {
  /**
   * Legacy method - use parseShippingDocument instead
   */
  static async parseOrderDocument(file: File): Promise<ExtractedOrderData> {
    return parseShippingDocument(file);
  }
}