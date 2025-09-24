import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'https://cdn.skypack.dev/pdf-lib@^1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invoicePdfBytes, rcFiles, podFiles } = await req.json()
    
    if (!invoicePdfBytes) {
      return new Response(
        JSON.stringify({ error: 'Invoice PDF data is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Starting PDF merge process...')
    console.log('Invoice PDF bytes type:', typeof invoicePdfBytes)
    console.log('Invoice PDF bytes length:', invoicePdfBytes?.length)

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Convert array back to Uint8Array if needed
    let pdfBytes: Uint8Array
    if (Array.isArray(invoicePdfBytes)) {
      pdfBytes = new Uint8Array(invoicePdfBytes)
    } else if (invoicePdfBytes instanceof Uint8Array) {
      pdfBytes = invoicePdfBytes
    } else if (invoicePdfBytes instanceof ArrayBuffer) {
      pdfBytes = new Uint8Array(invoicePdfBytes)
    } else {
      console.error('Invalid PDF bytes format:', typeof invoicePdfBytes)
      return new Response(
        JSON.stringify({ error: 'Invalid PDF data format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create main PDF document from invoice
    const mainPdf = await PDFDocument.load(pdfBytes)
    console.log('Loaded main invoice PDF successfully')

    // Add RC files
    if (rcFiles && rcFiles.length > 0) {
      console.log(`Processing ${rcFiles.length} RC files`)
      for (const rcFile of rcFiles) {
        try {
          const { data: fileData, error } = await supabase.storage
            .from('order-files')
            .download(rcFile.file_path)

          if (error) {
            console.error('Error downloading RC file:', error)
            continue
          }

          const fileBytes = await fileData.arrayBuffer()
          const rcPdf = await PDFDocument.load(fileBytes)
          const pages = await mainPdf.copyPages(rcPdf, rcPdf.getPageIndices())
          
          pages.forEach((page) => mainPdf.addPage(page))
          console.log(`Added RC file: ${rcFile.file_name}`)
        } catch (error) {
          console.error(`Error processing RC file ${rcFile.file_name}:`, error)
        }
      }
    }

    // Add POD files
    if (podFiles && podFiles.length > 0) {
      console.log(`Processing ${podFiles.length} POD files`)
      for (const podFile of podFiles) {
        try {
          const { data: fileData, error } = await supabase.storage
            .from('order-files')
            .download(podFile.file_path)

          if (error) {
            console.error('Error downloading POD file:', error)
            continue
          }

          const fileBytes = await fileData.arrayBuffer()
          const podPdf = await PDFDocument.load(fileBytes)
          const pages = await mainPdf.copyPages(podPdf, podPdf.getPageIndices())
          
          pages.forEach((page) => mainPdf.addPage(page))
          console.log(`Added POD file: ${podFile.file_name}`)
        } catch (error) {
          console.error(`Error processing POD file ${podFile.file_name}:`, error)
        }
      }
    }

    // Generate final PDF
    const mergedPdfBytes = await mainPdf.save()
    console.log('PDF merge completed successfully')
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfBytes: Array.from(new Uint8Array(mergedPdfBytes))
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in merge-pdfs function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})