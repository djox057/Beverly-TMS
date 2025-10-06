import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfirmationData {
  loadNumber: string;
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

    // Fill in the form fields - adjust field names based on what's in your PDF
    try {
      // Load Number
      const loadNumberField = form.getTextField('Load number');
      loadNumberField.setText(data.loadNumber);

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

      // Pickup Info
      if (data.pickupShipper) {
        const shipperField = form.getTextField('Shipper');
        shipperField.setText(data.pickupShipper);
      }

      const pickupAddressField = form.getTextField('Address_pickup');
      pickupAddressField.setText(data.pickupAddress);

      const pickupCityField = form.getTextField('City state zip_pickup');
      pickupCityField.setText(data.pickupCityStateZip);

      const pickupDateField = form.getTextField('Date_pickup');
      pickupDateField.setText(data.pickupDate);

      const pickupTimeField = form.getTextField('Time_pickup');
      pickupTimeField.setText(data.pickupTime);

      if (data.pickupPuNumber) {
        const puField = form.getTextField('PU');
        puField.setText(data.pickupPuNumber);
      }

      if (data.pickupPoNumber) {
        const poPickupField = form.getTextField('PO_pickup');
        poPickupField.setText(data.pickupPoNumber);
      }

      // Delivery Info
      if (data.deliveryReceiver) {
        const receiverField = form.getTextField('Receiver');
        receiverField.setText(data.deliveryReceiver);
      }

      const deliveryAddressField = form.getTextField('Address_delivery');
      deliveryAddressField.setText(data.deliveryAddress);

      const deliveryCityField = form.getTextField('City state zip_delivery');
      deliveryCityField.setText(data.deliveryCityStateZip);

      const deliveryDateField = form.getTextField('Date_delivery');
      deliveryDateField.setText(data.deliveryDate);

      const deliveryTimeField = form.getTextField('Time_delivery');
      deliveryTimeField.setText(data.deliveryTime);

      if (data.deliveryPoNumber) {
        const poDeliveryField = form.getTextField('PO_delivery');
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

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="load-confirmation-${data.loadNumber}.pdf"`,
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
