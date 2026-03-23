import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1"

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

// Download helper that retries by listing the folder and matching on file_name.
const downloadOrderFileWithFallback = async (
  supabase: any,
  filePath: string,
  fileName: string,
  timeoutMs = 10000
): Promise<{ data: Blob | null; error: any; resolvedPath: string }> => {
  const first = await downloadWithTimeout(supabase, filePath, timeoutMs);
  if (first.data && !first.error) {
    return { ...first, resolvedPath: filePath };
  }

  console.warn(`Primary download failed for ${filePath}, attempting fallback by folder listing...`);

  try {
    const parts = (filePath || '').split('/').filter(Boolean);
    if (parts.length < 2) {
      return { data: null, error: first.error, resolvedPath: filePath };
    }

    const folder = `${parts[0]}/${parts[1]}`;
    const { data: listed, error: listError } = await supabase.storage
      .from('order-files')
      .list(folder, { limit: 200, sortBy: { column: 'name', order: 'desc' } });

    if (listError || !listed) {
      console.error(`List error for folder ${folder}:`, listError);
      return { data: null, error: first.error ?? listError, resolvedPath: filePath };
    }

    const match = listed.find((o: any) => o?.name === fileName) 
      || listed.find((o: any) => (o?.name || '').endsWith(fileName));
    
    if (!match?.name) {
      console.error(`No storage object matched file_name=${fileName} in folder ${folder}. Available: ${listed.map((o: any) => o?.name).join(', ')}`);
      return { data: null, error: first.error, resolvedPath: filePath };
    }

    const fallbackPath = `${folder}/${match.name}`;
    console.log(`Retrying download using folder match: ${fallbackPath} (original: ${filePath})`);
    const second = await downloadWithTimeout(supabase, fallbackPath, timeoutMs);
    return { data: second.data, error: second.error, resolvedPath: fallbackPath };
  } catch (e) {
    console.error(`Fallback download failed for ${fileName}:`, e);
    return { data: null, error: first.error ?? e, resolvedPath: filePath };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invoicePdfBytes, rcFiles, bolFiles, podFiles, additionalFiles } = await req.json()
    
    if (!invoicePdfBytes) {
      return new Response(
        JSON.stringify({ error: 'Invoice PDF data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const totalFiles = (rcFiles?.length || 0) + (bolFiles?.length || 0) + (podFiles?.length || 0) + (additionalFiles?.length || 0);
    console.log(`Starting PDF merge: invoice + ${totalFiles} files (RC: ${rcFiles?.length || 0}, BOL: ${bolFiles?.length || 0}, POD: ${podFiles?.length || 0}, Additional: ${additionalFiles?.length || 0})`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mainPdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    console.log('Loaded main invoice PDF')

    const isImageFile = (fileName: string, contentType?: string) => {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
      const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
      const hasImageExtension = imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext))
      const hasImageType = contentType && imageTypes.includes(contentType.toLowerCase())
      return hasImageExtension || hasImageType
    }

    const includedFiles: Array<{ file_type: 'RC' | 'POD' | 'ADDITIONAL'; file_name: string; resolved_path: string; fallback?: boolean }> = [];
    const skippedFiles: Array<{ file_type: 'RC' | 'POD' | 'ADDITIONAL'; file_name: string; file_path: string; reason: string }> = [];

    let helveticaFont: any | null = null;
    const getHelvetica = async () => {
      if (!helveticaFont) {
        helveticaFont = await mainPdf.embedFont(StandardFonts.Helvetica);
      }
      return helveticaFont;
    };

    const addFileToPdf = async (file: any, fileType: 'RC' | 'POD' | 'ADDITIONAL'): Promise<boolean> => {
      try {
        console.log(`Processing ${fileType} file: ${file.file_name} at path: ${file.file_path}`);
        
        const { data: fileData, error, resolvedPath } = await downloadOrderFileWithFallback(
          supabase, file.file_path, file.file_name
        );

        if (error || !fileData) {
          console.error(`Error downloading ${fileType} file ${file.file_name}:`, error)
          skippedFiles.push({
            file_type: fileType,
            file_name: file.file_name,
            file_path: file.file_path,
            reason: error?.message || error?.name || 'download_failed',
          });
          return false
        }

        const fileBytes = await fileData.arrayBuffer()
        const fileBytesU8 = new Uint8Array(fileBytes)
        
        if (isImageFile(file.file_name, file.content_type)) {
          let image
          if (file.file_name.toLowerCase().includes('.png') || file.content_type?.includes('png')) {
            image = await mainPdf.embedPng(fileBytes)
          } else {
            image = await mainPdf.embedJpg(fileBytes)
          }
          
          const page = mainPdf.addPage()
          const { width, height } = image.scale(1)
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
          console.log(`Added image ${file.file_name} as PDF page`);
        } else {
          // Handle PDF files
          let filePdf: PDFDocument | null = null;
          try {
            filePdf = await PDFDocument.load(fileBytesU8, { ignoreEncryption: true })
          } catch (e) {
            console.warn(`pdf-lib load failed for ${file.file_name}; will use attachment fallback.`, e)
          }

          let pages: any[] | null = null;
          if (filePdf) {
            try {
              pages = await mainPdf.copyPages(filePdf, filePdf.getPageIndices())
            } catch (e) {
              console.warn(`pdf-lib page extraction failed for ${file.file_name}; will use attachment fallback.`, e)
              pages = null;
            }
          }

          if (pages && pages.length > 0) {
            console.log(`Added ${pages.length} page(s) from PDF ${file.file_name}`);
            pages.forEach((page) => mainPdf.addPage(page))
          } else {
            // Attachment fallback - embed the original PDF as an attachment
            // and add a notice page explaining the situation
            try {
              ;(mainPdf as any).attach(fileBytesU8, file.file_name, {
                mimeType: file.content_type || 'application/pdf',
                description: `${fileType} attachment (embedded; could not be merged as pages)`,
              });

              const noticePage = mainPdf.addPage();
              const font = await getHelvetica();
              const margin = 40;

              noticePage.drawText('Attachment Included', {
                x: margin,
                y: noticePage.getHeight() - margin - 24,
                size: 18,
                font,
                color: rgb(0.1, 0.1, 0.1),
              });
              
              noticePage.drawText(`Document Type: ${fileType}`, {
                x: margin,
                y: noticePage.getHeight() - margin - 55,
                size: 12,
                font,
                color: rgb(0.2, 0.2, 0.2),
              });
              
              noticePage.drawText(`File Name: ${file.file_name}`, {
                x: margin,
                y: noticePage.getHeight() - margin - 75,
                size: 12,
                font,
                color: rgb(0.2, 0.2, 0.2),
              });

              // Explain the situation
              const explanation = [
                'This document could not be merged inline due to its internal',
                'structure (e.g., encryption or non-standard formatting).',
                '',
                'The original file has been embedded as an attachment.',
                'To access it:',
                '  1. Open this PDF in Adobe Acrobat or a similar viewer',
                '  2. Look for the Attachments panel (paperclip icon)',
                '  3. Double-click the file to open it',
              ];
              
              let yPos = noticePage.getHeight() - margin - 110;
              for (const line of explanation) {
                noticePage.drawText(line, {
                  x: margin,
                  y: yPos,
                  size: 11,
                  font,
                  color: rgb(0.3, 0.3, 0.3),
                });
                yPos -= 16;
              }

              console.log(`Embedded PDF as attachment (fallback): ${file.file_name}`);
              
              includedFiles.push({
                file_type: fileType,
                file_name: file.file_name,
                resolved_path: resolvedPath,
                fallback: true,
              });
              return true;
            } catch (e) {
              console.error(`Attachment fallback failed for ${file.file_name}:`, e)
              throw new Error('attachment_fallback_failed')
            }
          }
        }

        includedFiles.push({
          file_type: fileType,
          file_name: file.file_name,
          resolved_path: resolvedPath,
        });
        
        return true
      } catch (error) {
        console.error(`Error processing ${fileType} file ${file.file_name}:`, error)
        skippedFiles.push({
          file_type: fileType,
          file_name: file.file_name,
          file_path: file.file_path,
          reason: error instanceof Error ? error.message : 'processing_failed',
        });
        return false
      }
    }

    let successCount = 0;

    if (rcFiles && rcFiles.length > 0) {
      console.log(`Processing ${rcFiles.length} RC file(s)...`);
      for (const rcFile of rcFiles) {
        const success = await addFileToPdf(rcFile, 'RC');
        if (success) successCount++;
      }
    }

    if (podFiles && podFiles.length > 0) {
      console.log(`Processing ${podFiles.length} POD file(s)...`);
      for (const podFile of podFiles) {
        const success = await addFileToPdf(podFile, 'POD');
        if (success) successCount++;
      }
    }

    if (additionalFiles && additionalFiles.length > 0) {
      console.log(`Processing ${additionalFiles.length} Additional file(s)...`);
      for (const additionalFile of additionalFiles) {
        const success = await addFileToPdf(additionalFile, 'ADDITIONAL');
        if (success) successCount++;
      }
    }

    const mergedPdfBytes = await mainPdf.save()
    console.log(`PDF merge completed: ${successCount}/${totalFiles} files added`)
    
    if (includedFiles.length > 0) {
      console.log(`Included files:`, includedFiles.map(f => `${f.file_type}: ${f.file_name}${f.fallback ? ' (attachment)' : ''}`));
    }
    if (skippedFiles.length > 0) {
      console.warn(`Skipped ${skippedFiles.length} attachment(s):`, skippedFiles)
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfBytes: Array.from(new Uint8Array(mergedPdfBytes)),
        includedFiles,
        skippedFiles,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in merge-pdfs function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
