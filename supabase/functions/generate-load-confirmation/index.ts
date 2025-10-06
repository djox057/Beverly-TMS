import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://cdn.skypack.dev/pdf-lib@1.17.1";

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

    // Load the template PDF
    const templateUrl = 'https://wjkbtagwgjniilmgwutb.supabase.co/storage/v1/object/public/order-files/load-confirmation-template.pdf';
    const templateResponse = await fetch(templateUrl);
    
    if (!templateResponse.ok) {
      throw new Error('Failed to load template PDF');
    }

    const templateBytes = await templateResponse.arrayBuffer();
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;

    // Get page dimensions
    const { height } = firstPage.getSize();

    // Helper function to draw text
    const drawText = (text: string, x: number, y: number, options = {}) => {
      firstPage.drawText(text, {
        x,
        y: height - y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        ...options
      });
    };

    // Fill in the form fields (coordinates are approximate and may need adjustment)
    // Load number
    drawText(data.loadNumber, 360, 146);

    // Driver info section
    drawText(data.driverName, 360, 217);
    drawText(data.truckNumber, 360, 242);
    drawText(data.trailerNumber, 360, 267);
    drawText(data.phoneNumber, 360, 292);

    // Right column
    drawText(data.commodity || '', 660, 217);
    drawText(data.weight || '', 660, 242);
    drawText(data.miles, 660, 267);
    drawText(data.rate, 660, 292);

    // Pickup info
    if (data.pickupShipper) {
      drawText(data.pickupShipper, 280, 393);
    }
    drawText(data.pickupAddress, 280, 418);
    drawText(data.pickupCityStateZip, 280, 443);
    drawText(data.pickupDate, 280, 468);
    drawText(data.pickupTime, 280, 493);
    if (data.pickupPuNumber) {
      drawText(data.pickupPuNumber, 280, 518);
    }
    if (data.pickupPoNumber) {
      drawText(data.pickupPoNumber, 280, 543);
    }

    // Delivery info
    if (data.deliveryReceiver) {
      drawText(data.deliveryReceiver, 280, 642);
    }
    drawText(data.deliveryAddress, 280, 667);
    drawText(data.deliveryCityStateZip, 280, 692);
    drawText(data.deliveryDate, 280, 717);
    drawText(data.deliveryTime, 280, 742);
    if (data.deliveryPoNumber) {
      drawText(data.deliveryPoNumber, 280, 792);
    }

    // Save the PDF
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
