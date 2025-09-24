import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceFile {
  filename: string;
  pdfBytes: number[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting invoice folder creation process...');
    
    const { invoices, folderName } = await req.json();
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No invoices provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing ${invoices.length} invoices for folder: ${folderName || 'single'}`);

    // If only one invoice, return it directly
    if (invoices.length === 1) {
      console.log('Single invoice, returning directly');
      return new Response(
        JSON.stringify({ 
          success: true, 
          singleFile: {
            filename: invoices[0].filename,
            pdfBytes: invoices[0].pdfBytes
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // For multiple invoices, create a ZIP file
    console.log('Multiple invoices detected, creating ZIP file');
    
    const zip = new JSZip();
    
    // Add each invoice PDF to the ZIP
    for (const invoice of invoices) {
      const pdfBuffer = new Uint8Array(invoice.pdfBytes);
      zip.addFile(invoice.filename, pdfBuffer);
    }
    
    // Generate the ZIP file
    const zipBytes = await zip.generateAsync({ 
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    
    console.log(`Created ZIP file with ${invoices.length} invoices`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        zipFile: {
          filename: `${folderName || 'folder'}.zip`,
          zipBytes: Array.from(zipBytes)
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in invoice folder creation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});