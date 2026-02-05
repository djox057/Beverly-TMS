import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceFile {
  filename: string;
  pdfBytes: number[];
}

interface XlsxRow {
  'ClientNo': string;
  'Invoice#': string;
  'Debtor Debtor Name': string;
  'Pono': string;
  'InvDate': string;
  'InvAmt': string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting invoice folder creation process...');
    
    const { invoices, xlsxData, folderName } = await req.json();
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No invoices provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing ${invoices.length} invoices for folder: ${folderName || 'invoices'}`);

    // Always create a ZIP file
    console.log('Creating ZIP file with invoices and XLSX');
    
    const zip = new JSZip();
    
    // Add each invoice PDF to the ZIP
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      console.log(`Processing invoice ${i + 1}/${invoices.length}: ${invoice.filename}, bytes: ${invoice.pdfBytes.length}`);
      
      try {
        const pdfBuffer = new Uint8Array(invoice.pdfBytes);
        
        // Check if PDF bytes are valid
        if (pdfBuffer.length === 0) {
          console.error(`Invoice ${invoice.filename} has empty PDF bytes, skipping`);
          continue;
        }
        
        // Check for duplicate filenames and make unique if needed
        let finalFilename = invoice.filename;
        let counter = 1;
        while (zip.file(finalFilename)) {
          const nameParts = invoice.filename.split('.');
          const extension = nameParts.pop();
          const baseName = nameParts.join('.');
          finalFilename = `${baseName}_${counter}.${extension}`;
          counter++;
        }
        
        if (finalFilename !== invoice.filename) {
          console.log(`Renamed ${invoice.filename} to ${finalFilename} to avoid duplicate`);
        }
        
        zip.file(finalFilename, pdfBuffer);
        console.log(`Successfully added ${finalFilename} to ZIP`);
      } catch (error) {
        console.error(`Error processing invoice ${invoice.filename}:`, error);
        // Continue with other invoices instead of failing completely
      }
    }
    
    // Add XLSX file if data provided
    if (xlsxData && Array.isArray(xlsxData) && xlsxData.length > 0) {
      console.log(`Adding XLSX with ${xlsxData.length} rows`);
      
      // Create CSV content (Excel can open CSV files)
      const headers = ['ClientNo', 'Invoice#', 'Debtor Debtor Name', 'Pono', 'InvDate', 'InvAmt'];
      const csvRows = [
        headers.join('\t'),
        ...xlsxData.map((row: XlsxRow) => 
          headers.map(h => row[h as keyof XlsxRow] || '').join('\t')
        )
      ];
      const csvContent = csvRows.join('\n');
      const csvBytes = new TextEncoder().encode(csvContent);
      
      zip.file('invoice_data.xls', csvBytes);
      console.log('Successfully added XLSX to ZIP');
    }
    
    // Generate the ZIP file
    const zipBytes = await zip.generateAsync({ 
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    
    console.log(`Created ZIP file with ${invoices.length} invoices and XLSX`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        zipFile: {
          filename: `${folderName || 'invoices'}.zip`,
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