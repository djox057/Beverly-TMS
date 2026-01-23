import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import createQpdfModule from 'https://esm.sh/@neslinesli93/qpdf-wasm@0.0.9'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Lazily-loaded QPDF WASM module (used only when pdf-lib cannot parse a PDF)
let qpdfModulePromise: Promise<any> | null = null;
const getQpdf = async (): Promise<any> => {
  if (!qpdfModulePromise) {
    qpdfModulePromise = createQpdfModule({
      // Ensure the wasm file can be resolved when running in Supabase Edge Runtime.
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) {
          return `https://esm.sh/@neslinesli93/qpdf-wasm@0.0.9/dist/${file}`;
        }
        return file;
      },
    });
  }
  return await qpdfModulePromise;
};

// Attempt to decrypt/repair PDFs that pdf-lib can't parse (encrypted flags, odd structure, etc.)
const repairPdfWithQpdf = async (input: Uint8Array): Promise<Uint8Array | null> => {
  try {
    const qpdf = await getQpdf();
    const id = crypto.randomUUID();
    const inPath = `/in-${id}.pdf`;
    const outPath = `/out-${id}.pdf`;
    qpdf.FS.writeFile(inPath, input);

    // qpdf CLI argument order differs across examples; try both.
    try {
      qpdf.callMain([inPath, '--decrypt', outPath]);
    } catch (_e1) {
      qpdf.callMain(['--decrypt', inPath, outPath]);
    }

    const out = qpdf.FS.readFile(outPath);
    try {
      qpdf.FS.unlink(inPath);
      qpdf.FS.unlink(outPath);
    } catch {
      // ignore cleanup errors
    }

    return out instanceof Uint8Array ? out : new Uint8Array(out);
  } catch (e) {
    console.error('QPDF repair failed:', e);
    return null;
  }
};

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
// This makes the merge more resilient when a stale/incorrect file_path is sent.
const downloadOrderFileWithFallback = async (
  supabase: any,
  filePath: string,
  fileName: string,
  timeoutMs = 10000
): Promise<{ data: Blob | null; error: any; resolvedPath: string }> => {
  // 1) First attempt: use provided path
  const first = await downloadWithTimeout(supabase, filePath, timeoutMs);
  if (first.data && !first.error) {
    return { ...first, resolvedPath: filePath };
  }

  console.warn(`Primary download failed for ${filePath}, attempting fallback by folder listing...`);

  // 2) Fallback attempt: list folder and find by file name suffix
  try {
    const parts = (filePath || '').split('/').filter(Boolean);
    if (parts.length < 2) {
      return { data: null, error: first.error, resolvedPath: filePath };
    }

    const folder = `${parts[0]}/${parts[1]}`; // e.g. <orderId>/RC
    const { data: listed, error: listError } = await supabase.storage
      .from('order-files')
      .list(folder, { limit: 200, sortBy: { column: 'name', order: 'desc' } });

    if (listError || !listed) {
      console.error(`List error for folder ${folder}:`, listError);
      return { data: null, error: first.error ?? listError, resolvedPath: filePath };
    }

    // Try exact match first, then suffix match
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
    console.log(`Starting PDF merge: invoice + ${totalFiles} files (RC: ${rcFiles?.length || 0}, POD: ${podFiles?.length || 0})`)

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
    // Some PDFs (especially from scanners/portals) are flagged as encrypted.
    // We still want to merge them when possible.
    const mainPdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
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

    // Track exactly what was included vs skipped
    const includedFiles: Array<{ file_type: 'RC' | 'POD'; file_name: string; resolved_path: string }> = [];
    const skippedFiles: Array<{ file_type: 'RC' | 'POD'; file_name: string; file_path: string; reason: string }> = [];

    // Helper function to add file to PDF (handles both PDFs and images)
    const addFileToPdf = async (file: any, fileType: 'RC' | 'POD'): Promise<boolean> => {
      try {
        console.log(`Processing ${fileType} file: ${file.file_name} at path: ${file.file_path}`);
        
        const { data: fileData, error, resolvedPath } = await downloadOrderFileWithFallback(
          supabase,
          file.file_path,
          file.file_name
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
          console.log(`Added image ${file.file_name} as PDF page`);
        } else {
          // Handle PDF files
          // Some PDFs are flagged as encrypted or have structures pdf-lib can't parse.
          // Try pdf-lib first; if it fails (or page tree is invalid), repair with QPDF and retry.
          let filePdf: PDFDocument | null = null;
          try {
            filePdf = await PDFDocument.load(fileBytesU8, { ignoreEncryption: true })
          } catch (e) {
            console.warn(`pdf-lib load failed for ${file.file_name}, attempting QPDF repair...`, e)
          }

          let pages: any[] | null = null;
          if (filePdf) {
            try {
              pages = await mainPdf.copyPages(filePdf, filePdf.getPageIndices())
            } catch (e) {
              console.warn(`pdf-lib page extraction failed for ${file.file_name}, attempting QPDF repair...`, e)
              pages = null;
            }
          }

          if (!pages) {
            const repaired = await repairPdfWithQpdf(fileBytesU8)
            if (!repaired) {
              throw new Error('qpdf_repair_failed')
            }
            const repairedPdf = await PDFDocument.load(repaired, { ignoreEncryption: true })
            pages = await mainPdf.copyPages(repairedPdf, repairedPdf.getPageIndices())
            console.log(`Added ${pages.length} page(s) from repaired PDF ${file.file_name}`);
          } else {
            console.log(`Added ${pages.length} page(s) from PDF ${file.file_name}`);
          }

          pages.forEach((page) => mainPdf.addPage(page))
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

    // Process files
    let successCount = 0;

    // Add RC files
    if (rcFiles && rcFiles.length > 0) {
      console.log(`Processing ${rcFiles.length} RC file(s)...`);
      for (const rcFile of rcFiles) {
        const success = await addFileToPdf(rcFile, 'RC');
        if (success) successCount++;
      }
    }

    // Add POD files
    if (podFiles && podFiles.length > 0) {
      console.log(`Processing ${podFiles.length} POD file(s)...`);
      for (const podFile of podFiles) {
        const success = await addFileToPdf(podFile, 'POD');
        if (success) successCount++;
      }
    }

    // Generate final PDF
    const mergedPdfBytes = await mainPdf.save()
    console.log(`PDF merge completed: ${successCount}/${totalFiles} files added`)
    
    if (includedFiles.length > 0) {
      console.log(`Included files:`, includedFiles.map(f => `${f.file_type}: ${f.file_name}`));
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
