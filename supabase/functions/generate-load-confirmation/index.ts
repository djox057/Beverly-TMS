import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfirmationData {
  brokerLoadNumber: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  phoneNumber: string;
  commodity?: string;
  weight?: string;
  miles: string;
  rate: string;
  pickupShipper?: string;
  pickupAddress: string;
  pickupCityStateZip: string;
  pickupDate: string;
  pickupTime: string;
  pickupPuNumber?: string;
  pickupPoNumber?: string;
  deliveryReceiver?: string;
  deliveryAddress: string;
  deliveryCityStateZip: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryPoNumber?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: LoadConfirmationData = await req.json();
    console.log('Generating load confirmation with data:', data);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load the template PDF from storage
    const { data: templateData, error: downloadError } = await supabase.storage
      .from('order-files')
      .download('load-confirmation-template.pdf');

    if (downloadError) {
      console.error('Error loading template:', downloadError);
      throw new Error('Failed to load template PDF');
    }

    // Convert blob to array buffer
    const templateBytes = await templateData.arrayBuffer();
    
    // Load the PDF template
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    
    // Get all form fields to see what's available
    const fields = form.getFields();
    console.log('Available form fields:', fields.map(f => f.getName()));

    // Fill in the form fields - using actual field names from PDF
    try {
      // Broker Load Number in LOAD ORDER CONFIRAMTION field (note: typo in PDF)
      const loadConfirmationField = form.getTextField('LOAD ORDER CONFIRAMTION');
      loadConfirmationField.setText(data.brokerLoadNumber);

      // Driver Info
      const driverField = form.getTextField('Driver');
      driverField.setText(data.driverName);

      const truckField = form.getTextField('Truck');
      truckField.setText(data.truckNumber);

      const trailerField = form.getTextField('Trailer');
      trailerField.setText(data.trailerNumber);

      const phoneField = form.getTextField('Phone');
      phoneField.setText(data.phoneNumber);

      // Optional fields
      if (data.commodity) {
        const commodityField = form.getTextField('Commodity');
        commodityField.setText(data.commodity);
      }

      if (data.weight) {
        const weightField = form.getTextField('Weight');
        weightField.setText(data.weight);
      }

      const milesField = form.getTextField('Miles');
      milesField.setText(data.miles);

      const rateField = form.getTextField('Rate');
      rateField.setText('$' + data.rate);

      // Pickup Info (first location)
      if (data.pickupShipper) {
        const shipperField = form.getTextField('Shipper');
        shipperField.setText(data.pickupShipper);
      }

      const pickupAddressField = form.getTextField('Address');
      pickupAddressField.setText(data.pickupAddress);

      const pickupCityField = form.getTextField('City state zip');
      pickupCityField.setText(data.pickupCityStateZip);

      const pickupDateField = form.getTextField('Date');
      pickupDateField.setText(data.pickupDate);

      const pickupTimeField = form.getTextField('Time');
      pickupTimeField.setText(data.pickupTime);

      if (data.pickupPuNumber) {
        const puField = form.getTextField('PU');
        puField.setText(data.pickupPuNumber);
      }

      if (data.pickupPoNumber) {
        const poPickupField = form.getTextField('PO');
        poPickupField.setText(data.pickupPoNumber);
      }

      // Delivery Info (second location - _2 suffix)
      if (data.deliveryReceiver) {
        const receiverField = form.getTextField('Shipper_2');
        receiverField.setText(data.deliveryReceiver);
      }

      const deliveryAddressField = form.getTextField('Address_2');
      deliveryAddressField.setText(data.deliveryAddress);

      const deliveryCityField = form.getTextField('City state zip_2');
      deliveryCityField.setText(data.deliveryCityStateZip);

      const deliveryDateField = form.getTextField('Date_2');
      deliveryDateField.setText(data.deliveryDate);

      const deliveryTimeField = form.getTextField('Time_2');
      deliveryTimeField.setText(data.deliveryTime);

      if (data.deliveryPoNumber) {
        const poDeliveryField = form.getTextField('PO_2');
        poDeliveryField.setText(data.deliveryPoNumber);
      }

    } catch (fieldError) {
      console.error('Error filling form fields:', fieldError);
      console.log('Attempting to fill with available fields...');
    }

    // Flatten the form (make fields non-editable)
    form.flatten();

    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();

    // Extract state from city/state/zip format (e.g., "Saint Cloud, MN 56303" -> "MN")
    const extractState = (cityStateZip: string): string => {
      const match = cityStateZip.match(/,\s*([A-Z]{2})\s+\d{5}/);
      return match ? match[1] : '';
    };

    const pickupState = extractState(data.pickupCityStateZip);
    const deliveryState = extractState(data.deliveryCityStateZip);
    
    // Format today's date as m/d/y
    const today = new Date();
    const todayFormatted = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    
    // Extract first name from driver name (e.g., "Jimmie Taylor" -> "Jimmie")
    const driverFirstName = data.driverName.split(' ')[0];
    
    // Format: #3869 Samuel // 9/25/2025 // Load#2002255693 // MO - LA
    const filename = `#${data.truckNumber} ${driverFirstName} // ${todayFormatted} // Load#${data.brokerLoadNumber} // ${pickupState} - ${deliveryState}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error generating load confirmation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
