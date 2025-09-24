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

    // For multiple invoices, return them as separate downloads with instructions
    console.log('Multiple invoices detected, returning array for sequential download');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        multipleFiles: {
          folderName: folderName || 'folder',
          files: invoices
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