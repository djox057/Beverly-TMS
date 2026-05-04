import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfirmationData {
  templateType?: string; // "1p1d", "1p2d", "1p3d", "1p4d", "1p5d", "2p1d", "2p2d", "3p1d"
  brokerLoadNumber: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  phoneNumber: string;
  commodity?: string;
  weight?: string;
  miles: string;
  rate: string;
  // First pickup (always present)
  pickupShipper?: string;
  pickupAddress: string;
  pickupCityStateZip: string;
  pickupDate: string;
  pickupTime: string;
  pickupPuNumber?: string;
  pickupPoNumber?: string;
  pickupPoNumber2?: string;
  // Second pickup (for multi-pickup)
  pickup2Shipper?: string;
  pickup2Address?: string;
  pickup2CityStateZip?: string;
  pickup2Date?: string;
  pickup2Time?: string;
  pickup2PoNumber?: string;
  pickup2PoNumber2?: string;
  // Third pickup (for 3p1d)
  pickup3Shipper?: string;
  pickup3Address?: string;
  pickup3CityStateZip?: string;
  pickup3Date?: string;
  pickup3Time?: string;
  pickup3PoNumber?: string;
  pickup3PoNumber2?: string;
  // First delivery (always present)
  deliveryReceiver?: string;
  deliveryAddress: string;
  deliveryCityStateZip: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryPoNumber?: string;
  deliveryPoNumber2?: string;
  // Second delivery (for multi-delivery)
  delivery2Receiver?: string;
  delivery2Address?: string;
  delivery2CityStateZip?: string;
  delivery2Date?: string;
  delivery2Time?: string;
  delivery2PoNumber?: string;
  delivery2PoNumber2?: string;
  // Third delivery (for 1p3d+)
  delivery3Receiver?: string;
  delivery3Address?: string;
  delivery3CityStateZip?: string;
  delivery3Date?: string;
  delivery3Time?: string;
  delivery3PoNumber?: string;
  delivery3PoNumber2?: string;
  // Fourth delivery (for 1p4d+)
  delivery4Receiver?: string;
  delivery4Address?: string;
  delivery4CityStateZip?: string;
  delivery4Date?: string;
  delivery4Time?: string;
  delivery4PoNumber?: string;
  delivery4PoNumber2?: string;
  // Fifth delivery (for 1p5d)
  delivery5Receiver?: string;
  delivery5Address?: string;
  delivery5CityStateZip?: string;
  delivery5Date?: string;
  delivery5Time?: string;
  delivery5PoNumber?: string;
  delivery5PoNumber2?: string;
}

// Sanitize text to remove characters that can't be encoded in WinAnsi (PDF standard encoding)
function sanitizeText(text: string): string {
  if (!text) return '';
  // Replace common problematic characters and remove any non-ASCII characters
  return text
    .replace(/[^\x00-\x7F]/g, '') // Remove all non-ASCII characters
    .replace(/\u2018|\u2019/g, "'") // Smart single quotes to regular
    .replace(/\u201C|\u201D/g, '"') // Smart double quotes to regular
    .replace(/\u2013|\u2014/g, '-') // En/em dashes to hyphen
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data: LoadConfirmationData = await req.json();
    console.log('Generating load confirmation with data:', data);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auto-detect template type based on number of pickups and deliveries if not provided
    let templateType = data.templateType;
    
    if (!templateType) {
      // Count pickups
      let pickupCount = 1; // First pickup is always present
      if (data.pickup2Address) pickupCount++;
      if (data.pickup3Address) pickupCount++;
      
      // Count deliveries
      let deliveryCount = 1; // First delivery is always present
      if (data.delivery2Address) deliveryCount++;
      if (data.delivery3Address) deliveryCount++;
      if (data.delivery4Address) deliveryCount++;
      if (data.delivery5Address) deliveryCount++;
      
      // Build template type string (e.g., "1p2d", "2p1d", "3p1d")
      templateType = `${pickupCount}p${deliveryCount}d`;
      console.log(`🎯 Auto-detected template type: ${templateType} (${pickupCount} pickups, ${deliveryCount} deliveries)`);
    }
    
    let bucketName = 'order-files';
    let templateFileName = 'load-confirmation-template.pdf';
    
    // Map template types to their files
    const templateMap: { [key: string]: { bucket: string; file: string } } = {
      '1p1d': { bucket: 'order-files', file: 'load-confirmation-template.pdf' },
      '1p2d': { bucket: 'Profilne', file: 'load_sheet 1p2d (2).pdf' },
      '1p3d': { bucket: 'Profilne', file: 'load_sheet 1p3d (1).pdf' },
      '1p4d': { bucket: 'Profilne', file: 'load_sheet 1p4d_1.pdf' },
      '1p5d': { bucket: 'Profilne', file: 'load_sheet 1p5d_1.pdf' },
      '2p1d': { bucket: 'Profilne', file: 'load_sheet 2p1d (1).pdf' },
      '2p2d': { bucket: 'Profilne', file: 'load_sheet 2p2d (1).pdf' },
      '3p1d': { bucket: 'Profilne', file: 'load_sheet 3p1d (1).pdf' },
      '3p3d': { bucket: 'Profilne', file: '3p_3_d_sheet_1.pdf' },
    };
    
    if (templateMap[templateType]) {
      bucketName = templateMap[templateType].bucket;
      templateFileName = templateMap[templateType].file;
    }

    console.log(`Using template: ${templateFileName} from bucket: ${bucketName}`);

    // Load the template PDF from storage
    const { data: templateData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(templateFileName);

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

    // Helper function to safely set text field
    const setTextField = (fieldName: string, value: string | undefined) => {
      if (!value) return;
      try {
        const field = form.getTextField(fieldName);
        field.setText(sanitizeText(value));
      } catch (e) {
        console.log(`Field "${fieldName}" not found or error setting it`);
      }
    };

    // Helper to format time: if start and end are the same (e.g. "18:00 - 18:00"), show "18:00 APPOINTMENT"
    const formatTimeValue = (timeStr: string | undefined): string | undefined => {
      if (!timeStr) return timeStr;
      const parts = timeStr.split('-').map(p => p.trim());
      if (parts.length === 2 && parts[0] === parts[1]) {
        return `${parts[0]} APPOINTMENT`;
      }
      return timeStr;
    };

    // Wrapper to set time fields with appointment formatting
    const setTimeField = (fieldName: string, value: string | undefined) => {
      setTextField(fieldName, formatTimeValue(value));
    };

    // Fill in the form fields based on template type
    try {
      // Fill common header fields (present in all templates)
      setTextField('LOAD ORDER CONFIRAMTION', data.brokerLoadNumber);
      setTextField('Driver', data.driverName);
      setTextField('Truck', data.truckNumber);
      setTextField('Trailer', data.trailerNumber);
      setTextField('Phone', data.phoneNumber);
      setTextField('Commodity', data.commodity);
      setTextField('Weight', data.weight);
      setTextField('Miles', data.miles);
      
      // Format rate with 2 decimal places
      let formattedRate = '';
      if (data.rate) {
        const rateNum = parseFloat(data.rate.replace(/[^0-9.-]/g, ''));
        if (!isNaN(rateNum)) {
          formattedRate = '$' + rateNum.toFixed(2);
        } else {
          formattedRate = '$' + sanitizeText(data.rate);
        }
      }
      setTextField('Rate', formattedRate);

      // Fill based on template type
      if (templateType === '2p1d') {
        // Fill 2 Pickups + 1 Delivery template
        console.log('Filling 2p1d template');
        
        // First Pickup
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);
        setTextField('PO_2', data.pickupPoNumber2);

        // Second Pickup
        setTextField('Shipper_2', data.pickup2Shipper);
        setTextField('Address_2', data.pickup2Address);
        setTextField('City state zip_2', data.pickup2CityStateZip);
        setTextField('Date_2', data.pickup2Date);
        setTimeField('Time_2', data.pickup2Time);
        setTextField('Delivery', data.pickup2PoNumber);
        setTextField('PO_3', data.pickup2PoNumber2);

        // Delivery
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Address_3', data.deliveryAddress);
        setTextField('City state zip_3', data.deliveryCityStateZip);
        setTextField('Date_3', data.deliveryDate);
        setTimeField('Time_3', data.deliveryTime);
        setTextField('Delivery_2', data.deliveryPoNumber);
        setTextField('PO_5', data.deliveryPoNumber2);

      } else if (templateType === '1p2d') {
        console.log('Filling 1p2d template');
        
        // Pickup
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        // First Delivery
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Shipper_2', data.deliveryReceiver);
        setTextField('Address_2', data.deliveryAddress);
        setTextField('City state zip_2', data.deliveryCityStateZip);
        setTextField('Date_2', data.deliveryDate);
        setTimeField('Time_2', data.deliveryTime);
        setTextField('PO_2', data.deliveryPoNumber);
        setTextField('Delivery', data.deliveryPoNumber);

        // Second Delivery
        setTextField('Receiver_2', data.delivery2Receiver);
        setTextField('Shipper_3', data.delivery2Receiver);
        setTextField('Address_3', data.delivery2Address);
        setTextField('City state zip_3', data.delivery2CityStateZip);
        setTextField('Date_3', data.delivery2Date);
        setTimeField('Time_3', data.delivery2Time);
        setTextField('PO_3', data.delivery2PoNumber);
        setTextField('Delivery_2', data.delivery2PoNumber);

      } else if (templateType === '1p3d') {
        console.log('Filling 1p3d template');
        
        // Pickup
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        // Deliveries 1-3
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Shipper_2', data.deliveryReceiver);
        setTextField('Address_2', data.deliveryAddress);
        setTextField('City state zip_2', data.deliveryCityStateZip);
        setTextField('Date_2', data.deliveryDate);
        setTimeField('Time_2', data.deliveryTime);
        setTextField('PO_2', data.deliveryPoNumber);

        setTextField('Receiver_2', data.delivery2Receiver);
        setTextField('Shipper_3', data.delivery2Receiver);
        setTextField('Address_3', data.delivery2Address);
        setTextField('City state zip_3', data.delivery2CityStateZip);
        setTextField('Date_3', data.delivery2Date);
        setTimeField('Time_3', data.delivery2Time);
        setTextField('PO_3', data.delivery2PoNumber);

        setTextField('Receiver_3', data.delivery3Receiver);
        setTextField('Shipper_4', data.delivery3Receiver);
        setTextField('Address_4', data.delivery3Address);
        setTextField('City state zip_4', data.delivery3CityStateZip);
        setTextField('Date_4', data.delivery3Date);
        setTimeField('Time_4', data.delivery3Time);
        setTextField('PO_4', data.delivery3PoNumber);

      } else if (templateType === '1p4d') {
        console.log('Filling 1p4d template');
        
        // Pickup
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        // Deliveries 1-4
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Shipper_2', data.deliveryReceiver);
        setTextField('Address_2', data.deliveryAddress);
        setTextField('City state zip_2', data.deliveryCityStateZip);
        setTextField('Date_2', data.deliveryDate);
        setTimeField('Time_2', data.deliveryTime);
        setTextField('PO_2', data.deliveryPoNumber);

        setTextField('Receiver_2', data.delivery2Receiver);
        setTextField('Shipper_3', data.delivery2Receiver);
        setTextField('Address_3', data.delivery2Address);
        setTextField('City state zip_3', data.delivery2CityStateZip);
        setTextField('Date_3', data.delivery2Date);
        setTimeField('Time_3', data.delivery2Time);
        setTextField('PO_3', data.delivery2PoNumber);

        setTextField('Receiver_3', data.delivery3Receiver);
        setTextField('Shipper_4', data.delivery3Receiver);
        setTextField('Address_4', data.delivery3Address);
        setTextField('City state zip_4', data.delivery3CityStateZip);
        setTextField('Date_4', data.delivery3Date);
        setTimeField('Time_4', data.delivery3Time);
        setTextField('PO_4', data.delivery3PoNumber);

        setTextField('Receiver_4', data.delivery4Receiver);
        setTextField('Shipper_5', data.delivery4Receiver);
        setTextField('Address_5', data.delivery4Address);
        setTextField('City state zip_5', data.delivery4CityStateZip);
        setTextField('Date_5', data.delivery4Date);
        setTimeField('Time_5', data.delivery4Time);
        setTextField('PO_5', data.delivery4PoNumber);

      } else if (templateType === '1p5d') {
        console.log('Filling 1p5d template');
        
        // Pickup
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        // Deliveries 1-5
        const deliveries = [
          { receiver: data.deliveryReceiver, address: data.deliveryAddress, cityStateZip: data.deliveryCityStateZip, 
            date: data.deliveryDate, time: data.deliveryTime, poNumber: data.deliveryPoNumber },
          { receiver: data.delivery2Receiver, address: data.delivery2Address, cityStateZip: data.delivery2CityStateZip,
            date: data.delivery2Date, time: data.delivery2Time, poNumber: data.delivery2PoNumber },
          { receiver: data.delivery3Receiver, address: data.delivery3Address, cityStateZip: data.delivery3CityStateZip,
            date: data.delivery3Date, time: data.delivery3Time, poNumber: data.delivery3PoNumber },
          { receiver: data.delivery4Receiver, address: data.delivery4Address, cityStateZip: data.delivery4CityStateZip,
            date: data.delivery4Date, time: data.delivery4Time, poNumber: data.delivery4PoNumber },
          { receiver: data.delivery5Receiver, address: data.delivery5Address, cityStateZip: data.delivery5CityStateZip,
            date: data.delivery5Date, time: data.delivery5Time, poNumber: data.delivery5PoNumber }
        ];

        deliveries.forEach((delivery, i) => {
          const suffix = i === 0 ? '' : `_${i}`;
          const shipperSuffix = i === 0 ? '_2' : `_${i + 1}`;
          
          setTextField(`Receiver${suffix}`, delivery.receiver);
          setTextField(`Shipper${shipperSuffix}`, delivery.receiver);
          setTextField(`Address${shipperSuffix}`, delivery.address);
          setTextField(`City state zip${shipperSuffix}`, delivery.cityStateZip);
          setTextField(`Date${shipperSuffix}`, delivery.date);
          setTimeField(`Time${shipperSuffix}`, delivery.time);
          setTextField(`PO${shipperSuffix}`, delivery.poNumber);
        });

      } else if (templateType === '2p2d') {
        console.log('Filling 2p2d template');
        
        // Pickups
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        setTextField('Shipper_2', data.pickup2Shipper);
        setTextField('Address_2', data.pickup2Address);
        setTextField('City state zip_2', data.pickup2CityStateZip);
        setTextField('Date_2', data.pickup2Date);
        setTimeField('Time_2', data.pickup2Time);
        setTextField('PO_2', data.pickup2PoNumber);

        // Deliveries
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Shipper_3', data.deliveryReceiver);
        setTextField('Address_3', data.deliveryAddress);
        setTextField('City state zip_3', data.deliveryCityStateZip);
        setTextField('Date_3', data.deliveryDate);
        setTimeField('Time_3', data.deliveryTime);
        setTextField('PO_3', data.deliveryPoNumber);

        setTextField('Receiver_2', data.delivery2Receiver);
        setTextField('Shipper_4', data.delivery2Receiver);
        setTextField('Address_4', data.delivery2Address);
        setTextField('City state zip_4', data.delivery2CityStateZip);
        setTextField('Date_4', data.delivery2Date);
        setTimeField('Time_4', data.delivery2Time);
        setTextField('PO_4', data.delivery2PoNumber);

      } else if (templateType === '3p1d') {
        console.log('Filling 3p1d template');
        
        // Pickups
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        setTextField('Shipper_2', data.pickup2Shipper);
        setTextField('Address_2', data.pickup2Address);
        setTextField('City state zip_2', data.pickup2CityStateZip);
        setTextField('Date_2', data.pickup2Date);
        setTimeField('Time_2', data.pickup2Time);
        setTextField('PO_2', data.pickup2PoNumber);

        setTextField('Shipper_3', data.pickup3Shipper);
        setTextField('Address_3', data.pickup3Address);
        setTextField('City state zip_3', data.pickup3CityStateZip);
        setTextField('Date_3', data.pickup3Date);
        setTimeField('Time_3', data.pickup3Time);
        setTextField('PO_3', data.pickup3PoNumber);

        // Delivery
        setTextField('Receiver', data.deliveryReceiver);
        setTextField('Shipper_4', data.deliveryReceiver);
        setTextField('Address_4', data.deliveryAddress);
        setTextField('City state zip_4', data.deliveryCityStateZip);
        setTextField('Date_4', data.deliveryDate);
        setTimeField('Time_4', data.deliveryTime);
        setTextField('PO_4', data.deliveryPoNumber);

      } else if (templateType === '3p3d') {
        console.log('Filling 3p3d template');
        
        // Pickups
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        setTextField('Receiver', data.pickup2Shipper);
        setTextField('Address_2', data.pickup2Address);
        setTextField('City state zip_2', data.pickup2CityStateZip);
        setTextField('Date_2', data.pickup2Date);
        setTimeField('Time_2', data.pickup2Time);
        setTextField('Delivery', data.pickup2PoNumber);
        setTextField('PO_2', data.pickup2PoNumber);

        setTextField('Receiver_2', data.pickup3Shipper);
        setTextField('Address_3', data.pickup3Address);
        setTextField('City state zip_3', data.pickup3CityStateZip);
        setTextField('Date_3', data.pickup3Date);
        setTimeField('Time_3', data.pickup3Time);
        setTextField('Delivery_2', data.pickup3PoNumber);
        setTextField('PO_3', data.pickup3PoNumber);

        // Deliveries
        setTextField('Receiver_3', data.deliveryReceiver);
        setTextField('Address_4', data.deliveryAddress);
        setTextField('City state zip_4', data.deliveryCityStateZip);
        setTextField('Date_4', data.deliveryDate);
        setTimeField('Time_4', data.deliveryTime);
        setTextField('Delivery_3', data.deliveryPoNumber);
        setTextField('PO_4', data.deliveryPoNumber);

        setTextField('Receiver_4', data.delivery2Receiver);
        setTextField('Address_5', data.delivery2Address);
        setTextField('City state zip_5', data.delivery2CityStateZip);
        setTextField('Date_5', data.delivery2Date);
        setTimeField('Time_5', data.delivery2Time);
        setTextField('Delivery_4', data.delivery2PoNumber);
        setTextField('PO_5', data.delivery2PoNumber);

        setTextField('Receiver_5', data.delivery3Receiver);
        setTextField('Address_6', data.delivery3Address);
        setTextField('City state zip_6', data.delivery3CityStateZip);
        setTextField('Date_6', data.delivery3Date);
        setTimeField('Time_6', data.delivery3Time);
        setTextField('Delivery_5', data.delivery3PoNumber);
        setTextField('PO_6', data.delivery3PoNumber);

      } else {
        // Fill 1 Pickup + 1 Delivery template (original 1p1d)
        console.log('Filling 1p1d template');

        // Pickup Info
        setTextField('Shipper', data.pickupShipper);
        setTextField('Address', data.pickupAddress);
        setTextField('City state zip', data.pickupCityStateZip);
        setTextField('Date', data.pickupDate);
        setTimeField('Time', data.pickupTime);
        setTextField('PU', data.pickupPuNumber);
        setTextField('PO', data.pickupPoNumber);

        // Delivery Info (second location - _2 suffix)
        setTextField('Shipper_2', data.deliveryReceiver);
        setTextField('Address_2', data.deliveryAddress);
        setTextField('City state zip_2', data.deliveryCityStateZip);
        setTextField('Date_2', data.deliveryDate);
        setTimeField('Time_2', data.deliveryTime);
        setTextField('PO_2', data.deliveryPoNumber);
      }

    } catch (fieldError) {
      console.error('Error filling form fields:', fieldError);
      console.log('Attempting to fill with available fields...');
    }

    // Don't flatten the form - keep it fillable/editable
    // form.flatten();

    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();

    // Extract state from city/state/zip format (e.g., "Saint Cloud, MN 56303" -> "MN")
    const extractState = (cityStateZip: string): string => {
      const match = cityStateZip.match(/,\s*([A-Z]{2})\s+\d{5}/);
      return match ? match[1] : '';
    };

    const pickupState = extractState(data.pickupCityStateZip);
    const deliveryState = extractState(data.deliveryCityStateZip);
    
    // Format today's date as m-d-y (using dashes instead of slashes for valid filename)
    const today = new Date();
    const todayFormatted = `${today.getMonth() + 1}-${today.getDate()}-${today.getFullYear()}`;
    
    // Extract first name from driver name (e.g., "Jimmie Taylor" -> "Jimmie")
    const driverFirstName = data.driverName.split(' ')[0];
    
    // Format: #3869 Samuel // 9-25-2025 // Load#2002255693 // MO - LA
    const filename = `#${data.truckNumber} ${driverFirstName} // ${todayFormatted} // Load#${data.brokerLoadNumber} // ${pickupState} - ${deliveryState}.pdf`;

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error generating load confirmation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
