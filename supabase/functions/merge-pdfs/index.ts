import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to download with timeout
const downloadWithTimeout = async (
  supabase: any,
  filePath: string,
  timeoutMs = 10000
): Promise<{ data: Blob | null; error: any }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const { data, error } = await supabase.storage
      .from('order-files')
      .download(filePath);
    clearTimeout(timeout);
    return { data, error };
  } catch (e) {
    clearTimeout(timeout);
    console.error(`Download timeout or error for ${filePath}:`, e);
    return { data: null, error: e };
  }
};

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

    const totalFiles = (rcFiles?.length || 0) + (podFiles?.length || 0);
    console.log(`Starting PDF merge: invoice + ${totalFiles} files`)

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
    console.log('Loaded main invoice PDF')

    // Helper function to check if file is an image
    const isImageFile = (fileName: string, contentType?: string) => {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
      const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
      
      const hasImageExtension = imageExtensions.some(ext => 
        fileName.toLowerCase().endsWith(ext)
      )
      const hasImageType = contentType && imageTypes.includes(contentType.toLowerCase())
      
      return hasImageExtension || hasImageType
    }

    // Helper function to add file to PDF (handles both PDFs and images)
    const addFileToPdf = async (file: any, fileType: string): Promise<boolean> => {
      try {
        const { data: fileData, error } = await downloadWithTimeout(supabase, file.file_path);

        if (error || !fileData) {
          console.error(`Error downloading ${fileType} file ${file.file_name}:`, error)
          return false
        }

        const fileBytes = await fileData.arrayBuffer()
        
        if (isImageFile(file.file_name, file.content_type)) {
          // Handle image files - convert to PDF page
          let image
          if (file.file_name.toLowerCase().includes('.png') || file.content_type?.includes('png')) {
            image = await mainPdf.embedPng(fileBytes)
          } else {
            // Default to JPEG for all other image types
            image = await mainPdf.embedJpg(fileBytes)
          }
          
          const page = mainPdf.addPage()
          const { width, height } = image.scale(1)
          
          // Scale image to fit page while maintaining aspect ratio
          const pageWidth = page.getWidth()
          const pageHeight = page.getHeight()
          const scaleFactor = Math.min(pageWidth / width, pageHeight / height, 1)
          
          const scaledWidth = width * scaleFactor
          const scaledHeight = height * scaleFactor
          
          page.drawImage(image, {
            x: (pageWidth - scaledWidth) / 2,
            y: (pageHeight - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight,
          })
        } else {
          // Handle PDF files
          const filePdf = await PDFDocument.load(fileBytes)
          const pages = await mainPdf.copyPages(filePdf, filePdf.getPageIndices())
          
          pages.forEach((page) => mainPdf.addPage(page))
        }
        
        return true
      } catch (error) {
        console.error(`Error processing ${fileType} file ${file.file_name}:`, error)
        return false
      }
    }

    // Process files with concurrency limit
    let successCount = 0;

    // Add RC files
    if (rcFiles && rcFiles.length > 0) {
      for (const rcFile of rcFiles) {
        const success = await addFileToPdf(rcFile, 'RC');
        if (success) successCount++;
      }
    }

    // Add POD files
    if (podFiles && podFiles.length > 0) {
      for (const podFile of podFiles) {
        const success = await addFileToPdf(podFile, 'POD');
        if (success) successCount++;
      }
    }

    // Generate final PDF
    const mergedPdfBytes = await mainPdf.save()
    console.log(`PDF merge completed: ${successCount}/${totalFiles} files added`)
    
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
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})