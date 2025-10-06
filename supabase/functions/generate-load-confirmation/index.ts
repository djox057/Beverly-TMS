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

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size: 8.5" x 11"
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 10;
    const { height, width } = page.getSize();

    // Helper function to draw text
    const drawText = (text: string, x: number, y: number, options = {}) => {
      page.drawText(text, {
        x,
        y: height - y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        ...options
      });
    };

    // Draw header
    page.drawRectangle({
      x: 50,
      y: height - 80,
      width: width - 100,
      height: 30,
      color: rgb(0.2, 0.4, 0.8),
    });
    drawText('LOAD ORDER CONFIRMATION', width / 2 - 100, 65, { font: fontBold, size: 16, color: rgb(1, 1, 1) });

    // Draw load number section
    drawText('Load number:', 60, 100, { font: fontBold });
    drawText(data.loadNumber, 200, 100);

    // Draw driver/truck info section
    let yPos = 140;
    drawText('Driver:', 60, yPos, { font: fontBold });
    drawText(data.driverName, 200, yPos);
    drawText('Commodity:', 340, yPos, { font: fontBold });
    drawText(data.commodity || '', 450, yPos);

    yPos += 20;
    drawText('Truck #:', 60, yPos, { font: fontBold });
    drawText(data.truckNumber, 200, yPos);
    drawText('Weight:', 340, yPos, { font: fontBold });
    drawText(data.weight || '', 450, yPos);

    yPos += 20;
    drawText('Trailer #:', 60, yPos, { font: fontBold });
    drawText(data.trailerNumber, 200, yPos);
    drawText('Miles:', 340, yPos, { font: fontBold });
    drawText(data.miles, 450, yPos);

    yPos += 20;
    drawText('Phone #:', 60, yPos, { font: fontBold });
    drawText(data.phoneNumber, 200, yPos);
    drawText('Rate:', 340, yPos, { font: fontBold });
    drawText('$' + data.rate, 450, yPos);

    // Draw PICK UP INFO section
    yPos += 40;
    drawText('PICK UP INFO:', 60, yPos, { font: fontBold, size: 12 });

    yPos += 25;
    if (data.pickupShipper) {
      drawText('Shipper:', 60, yPos, { font: fontBold });
      drawText(data.pickupShipper, 200, yPos);
      yPos += 20;
    }
    drawText('Address:', 60, yPos, { font: fontBold });
    drawText(data.pickupAddress, 200, yPos);

    yPos += 20;
    drawText('City, state, zip:', 60, yPos, { font: fontBold });
    drawText(data.pickupCityStateZip, 200, yPos);

    yPos += 20;
    drawText('Date:', 60, yPos, { font: fontBold });
    drawText(data.pickupDate, 200, yPos);

    yPos += 20;
    drawText('Time:', 60, yPos, { font: fontBold });
    drawText(data.pickupTime, 200, yPos);

    if (data.pickupPuNumber) {
      yPos += 20;
      drawText('PU #:', 60, yPos, { font: fontBold });
      drawText(data.pickupPuNumber, 200, yPos);
    }

    if (data.pickupPoNumber) {
      yPos += 20;
      drawText('PO #:', 60, yPos, { font: fontBold });
      drawText(data.pickupPoNumber, 200, yPos);
    }

    // Draw DELIVERY INFO section
    yPos += 40;
    drawText('DELIVERY INFO:', 60, yPos, { font: fontBold, size: 12 });

    yPos += 25;
    if (data.deliveryReceiver) {
      drawText('Receiver:', 60, yPos, { font: fontBold });
      drawText(data.deliveryReceiver, 200, yPos);
      yPos += 20;
    }
    drawText('Address:', 60, yPos, { font: fontBold });
    drawText(data.deliveryAddress, 200, yPos);

    yPos += 20;
    drawText('City, state, zip:', 60, yPos, { font: fontBold });
    drawText(data.deliveryCityStateZip, 200, yPos);

    yPos += 20;
    drawText('Date:', 60, yPos, { font: fontBold });
    drawText(data.deliveryDate, 200, yPos);

    yPos += 20;
    drawText('Time:', 60, yPos, { font: fontBold });
    drawText(data.deliveryTime, 200, yPos);

    if (data.deliveryPoNumber) {
      yPos += 20;
      drawText('PO #:', 60, yPos, { font: fontBold });
      drawText(data.deliveryPoNumber, 200, yPos);
    }

    // Add page 2 with additional info
    const page2 = pdfDoc.addPage([612, 792]);
    let y2Pos = 100;
    
    page2.drawText('Additional Info', {
      x: 60,
      y: height - 60,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const additionalInfo = [
      '• Charges may apply for late pick-ups and deliveries.',
      '• It is the driver\'s responsibility to ensure that the load is safe, secure and legal for transport.',
      '• Driver is required to check call daily by 10:00AM.',
      '• Any deviation from dispatch instructions must be called in immediately.',
      '• All products SHORTAGES must be reported at time of PICKUP. Failure to report will result in',
      '  additional charges.',
      '• BOL must be sent to your dispatcher after pick up immediately for check up.',
      '• The POD (signed BOL) must be emailed to dispatch immediately after unloading.',
      '• Scale tickets must be submitted with POD.',
      '• Penalty for no call/no show missed delivery appointments. This will be deducted from your rate.',
      '• Driver agrees to leave all sealed loads sealed until broken by the consignee or designated party.',
    ];

    additionalInfo.forEach((line) => {
      page2.drawText(line, {
        x: 60,
        y: height - y2Pos,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
      y2Pos += 20;
    });

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
