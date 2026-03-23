import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDateNoTimezone } from '@/lib/utils';
import ExcelJS from 'exceljs';
import { formatInternalLoadNumber } from '@/utils/formatInternalLoadNumber';
// Helper function to load file from Supabase storage
const loadFileAsBase64 = async (filePath: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from('order-files')
      .download(filePath);
    
    if (error) {
      console.error('Error loading file:', error);
      return null;
    }
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // Remove data URL prefix
      };
      reader.readAsDataURL(data);
    });
  } catch (error) {
    console.error('Error loading file:', error);
    return null;
  }
};

interface OrderFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  file_category: string;
}

interface PickupDrop {
  type: 'pickup' | 'delivery';
  city: string;
  state: string;
  datetime: string;
}

interface Order {
  id: string;
  truckNumber: string;
  internalLoadNumber: string;
  pickupDate: string;
  pickupCity: string;
  pickupState: string;
  deliveryDate: string;
  deliveryCity: string;
  deliveryState: string;
  brokerName: string;
  brokerAddress?: string;
  brokerCity?: string;
  brokerState?: string;
  brokerZipCode?: string;
  brokerLoadNumber: string;
  freightAmount: number;
  totalFreightAmount: number;
  detention?: number;
  layover?: number;
  extraStop?: number;
  lumper?: number;
  tonu?: number;
  otherCharges?: number;
  otherChargesReason?: string;
  otherAdditionals?: number;
  otherAdditionalsReason?: string;
  lateFee?: number;
  companyName: string;
  bookedByCompanyName?: string;
  driverName: string;
  mileage: number;
  rcFiles?: OrderFile[];
  bolFiles?: OrderFile[];
  podFiles?: OrderFile[];
  additionalFiles?: OrderFile[];
  pickup_drops?: PickupDrop[];
}

// Helper to add timeout to promises - returns null on timeout
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>(resolve => setTimeout(() => resolve(null), ms))
  ]);
};

// Process a single invoice merge
interface MergeTask {
  invoicePdfBytes: ArrayBuffer;
  rcFiles: OrderFile[];
  bolFiles: OrderFile[];
  podFiles: OrderFile[];
  additionalFiles: OrderFile[];
  baseFilename: string;
  companyFolder: string;
}

interface SkippedFile {
  file_type: 'RC' | 'POD' | 'ADDITIONAL';
  file_name: string;
  file_path: string;
  reason: string;
}

interface IncludedFile {
  file_type: 'RC' | 'POD' | 'ADDITIONAL';
  file_name: string;
  resolved_path: string;
  fallback?: boolean;
}

interface MergeTaskResult {
  filename: string;
  pdfBytes: number[];
  skippedFiles?: SkippedFile[];
  fallbackFiles?: IncludedFile[];
}

// Download a file from Supabase storage and return its bytes
const downloadFileFromStorage = async (filePath: string): Promise<{ data: Uint8Array | null; error: string | null }> => {
  try {
    const { data, error } = await supabase.storage
      .from('order-files')
      .download(filePath);
    
    if (error || !data) {
      console.error(`Download failed for ${filePath}:`, error);
      return { data: null, error: error?.message || 'download_failed' };
    }
    
    const arrayBuffer = await data.arrayBuffer();
    return { data: new Uint8Array(arrayBuffer), error: null };
  } catch (e) {
    console.error(`Download exception for ${filePath}:`, e);
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
};

const isImageFile = (fileName: string, contentType?: string) => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  const hasImageExtension = imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  const hasImageType = contentType && imageTypes.includes(contentType.toLowerCase());
  return hasImageExtension || hasImageType;
};

const processMergeTask = async (task: MergeTask): Promise<MergeTaskResult> => {
  const { invoicePdfBytes, rcFiles, podFiles, additionalFiles, baseFilename } = task;
  
  const allFiles: Array<{ file: OrderFile; type: 'RC' | 'POD' | 'ADDITIONAL' }> = [
    ...rcFiles.map(f => ({ file: f, type: 'RC' as const })),
    ...podFiles.map(f => ({ file: f, type: 'POD' as const })),
    ...additionalFiles.map(f => ({ file: f, type: 'ADDITIONAL' as const })),
  ];

  if (allFiles.length === 0) {
    return { filename: baseFilename, pdfBytes: Array.from(new Uint8Array(invoicePdfBytes)), skippedFiles: [], fallbackFiles: [] };
  }

  const skippedFiles: SkippedFile[] = [];
  const includedFiles: IncludedFile[] = [];

  try {
    const mainPdf = await PDFDocument.load(invoicePdfBytes, { ignoreEncryption: true });

    for (const { file, type } of allFiles) {
      try {
        console.log(`[merge] Downloading ${type}: ${file.file_name}`);
        const { data: fileBytes, error } = await downloadFileFromStorage(file.file_path);
        
        if (!fileBytes || error) {
          console.warn(`[merge] Failed to download ${file.file_name}: ${error}`);
          skippedFiles.push({ file_type: type, file_name: file.file_name, file_path: file.file_path, reason: error || 'download_failed' });
          continue;
        }

        if (isImageFile(file.file_name, file.content_type)) {
          // Embed image as a PDF page
          let image;
          if (file.file_name.toLowerCase().includes('.png') || file.content_type?.includes('png')) {
            image = await mainPdf.embedPng(fileBytes);
          } else {
            image = await mainPdf.embedJpg(fileBytes);
          }
          
          const page = mainPdf.addPage();
          const { width, height } = image.scale(1);
          const pageWidth = page.getWidth();
          const pageHeight = page.getHeight();
          const scaleFactor = Math.min(pageWidth / width, pageHeight / height, 1);
          
          page.drawImage(image, {
            x: (pageWidth - width * scaleFactor) / 2,
            y: (pageHeight - height * scaleFactor) / 2,
            width: width * scaleFactor,
            height: height * scaleFactor,
          });
          
          console.log(`[merge] Added image ${file.file_name} as PDF page`);
          includedFiles.push({ file_type: type, file_name: file.file_name, resolved_path: file.file_path });
        } else {
          // Handle PDF files
          try {
            const filePdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
            const pages = await mainPdf.copyPages(filePdf, filePdf.getPageIndices());
            pages.forEach(page => mainPdf.addPage(page));
            console.log(`[merge] Added ${pages.length} page(s) from PDF ${file.file_name}`);
            includedFiles.push({ file_type: type, file_name: file.file_name, resolved_path: file.file_path });
          } catch (pdfError) {
            console.warn(`[merge] Failed to merge PDF ${file.file_name}:`, pdfError);
            skippedFiles.push({ file_type: type, file_name: file.file_name, file_path: file.file_path, reason: pdfError instanceof Error ? pdfError.message : 'pdf_merge_failed' });
          }
        }
      } catch (fileError) {
        console.error(`[merge] Error processing ${type} file ${file.file_name}:`, fileError);
        skippedFiles.push({ file_type: type, file_name: file.file_name, file_path: file.file_path, reason: fileError instanceof Error ? fileError.message : 'processing_failed' });
      }
    }

    const mergedBytes = await mainPdf.save();
    console.log(`[merge] Completed ${baseFilename}: ${includedFiles.length} files merged, ${skippedFiles.length} skipped`);
    
    return {
      filename: baseFilename,
      pdfBytes: Array.from(new Uint8Array(mergedBytes)),
      skippedFiles,
      fallbackFiles: includedFiles.filter(f => f.fallback),
    };
  } catch (error) {
    console.error(`[merge] Fatal error merging ${baseFilename}:`, error);
    return { filename: baseFilename, pdfBytes: Array.from(new Uint8Array(invoicePdfBytes)), skippedFiles, fallbackFiles: [] };
  }
};

export interface InvoiceProgress {
  current: number;
  total: number;
  phase: 'preparing' | 'processing' | 'finalizing';
  message: string;
}

export interface InvoiceWarning {
  invoice: string;
  files: Array<{ type: 'RC' | 'POD' | 'ADDITIONAL'; name: string }>;
  reason: 'skipped' | 'fallback';
}

export interface InvoiceGenerationResult {
  orderIds: string[];
  warnings: InvoiceWarning[];
}

export const generateInvoicePDF = async (
  orders: Order[],
  onProgress?: (progress: InvoiceProgress) => void
): Promise<InvoiceGenerationResult> => {
  if (!orders.length) return { orderIds: [], warnings: [] };

  console.log(`Starting invoice generation for ${orders.length} orders:`, orders.map(o => o.internalLoadNumber));
  
  onProgress?.({ current: 0, total: orders.length, phase: 'preparing', message: 'Preparing invoices...' });

  // Group orders by driver's company only (one invoice per order, not per broker)
  // This ensures each load gets its own invoice PDF
  const companiesMap = orders.reduce((acc, order) => {
    // Use driver's company (companyName) for folder organization
    const driverCompany = order.companyName;
    if (!acc[driverCompany]) {
      acc[driverCompany] = [];
    }
    acc[driverCompany].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  console.log(`Grouped ${orders.length} orders into ${Object.keys(companiesMap).length} companies (one invoice per order)`);

  // Fetch broker MC numbers for all orders
  const brokerNames = [...new Set(orders.map(o => o.brokerName))];
  const { data: brokersData } = await supabase
    .from('brokers')
    .select('name, mc_number')
    .in('name', brokerNames);
  
  const brokerMcMap = new Map(brokersData?.map(b => [b.name, b.mc_number]) || []);
  const currentDate = new Date().toLocaleDateString();

  // Collect all merge tasks first (don't await inside loop)
  const mergeTasks: MergeTask[] = [];
  const xlsxDataByCompany: Record<string, any[]> = {};
  const taskToCompanyMap: Map<number, string> = new Map();

  // Generate one PDF per order (organized by company folders)
  for (const [companyName, companyOrders] of Object.entries(companiesMap)) {
    const sanitizedCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    xlsxDataByCompany[sanitizedCompanyName] = [];

    for (const order of companyOrders) {
      const doc = new jsPDF();
      
      // Header - Use bookedByCompanyName for display, but companyName (driver's company) for invoice suffix
      const displayCompanyName = order.bookedByCompanyName || companyName;
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(displayCompanyName, 20, 25);
      doc.text('INVOICE', 150, 25);
      
      // Bill To section
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.rect(20, 40, 100, 30);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 22, 48);
      doc.setFont('helvetica', 'normal');
      doc.text(order.brokerName, 22, 55);
      
      // Add broker address if available
      let yPos = 61;
      if (order.brokerAddress) {
        // Split long address into multiple lines within the box
        const addressLines = doc.splitTextToSize(order.brokerAddress, 95);
        for (let i = 0; i < Math.min(addressLines.length, 2); i++) {
          doc.text(addressLines[i], 22, yPos);
          yPos += 5;
        }
      }
      if (order.brokerCity || order.brokerState || order.brokerZipCode) {
        const cityStateZip = [order.brokerCity, order.brokerState, order.brokerZipCode]
          .filter(Boolean)
          .join(', ');
        if (cityStateZip) {
          doc.text(cityStateZip, 22, yPos);
        }
      }
      
      // Invoice details table (right side)
      const rawInvoiceNumber = order.internalLoadNumber || Math.floor(Math.random() * 9999) + 1000;
      const invoiceNumber = formatInternalLoadNumber(rawInvoiceNumber, companyName);
      
      // Simple filename - just the load number with suffix
      const baseFilename = `${invoiceNumber}.pdf`;
      console.log(`Preparing invoice ${baseFilename} for company ${companyName}`);
    
      doc.rect(130, 40, 30, 8);
      doc.rect(160, 40, 30, 8);
      doc.rect(130, 48, 30, 8);
      doc.rect(160, 48, 30, 8);
      doc.rect(130, 56, 30, 8);
      doc.rect(160, 56, 30, 8);
      doc.rect(130, 64, 30, 8);
      doc.rect(160, 64, 30, 8);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice Date', 132, 46);
      doc.text('Invoice #', 132, 54);
      doc.text('Terms', 132, 62);
      doc.text('Due Date', 132, 70);
      
      doc.setFont('helvetica', 'normal');
      doc.text(currentDate, 162, 46);
      doc.text(invoiceNumber.toString(), 162, 54);
      doc.text('NET 30', 162, 62);
      
      // Calculate due date (30 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      doc.text(dueDate.toLocaleDateString(), 162, 70);
      
      // Main table headers
      let yPosition = 90;
      doc.setFont('helvetica', 'bold');
      doc.rect(20, yPosition, 22, 8);
      doc.rect(42, yPosition, 20, 8);
      doc.rect(62, yPosition, 35, 8);
      doc.rect(97, yPosition, 53, 8);
      doc.rect(150, yPosition, 12, 8);
      doc.rect(162, yPosition, 20, 8);
      doc.rect(182, yPosition, 25, 8);
      
      doc.text('Date', 22, yPosition + 5);
      doc.text('Truck #', 44, yPosition + 5);
      doc.text('Load #', 64, yPosition + 5);
      doc.text('Origin - Destination', 99, yPosition + 5);
      doc.text('Qty', 152, yPosition + 5);
      doc.text('Rate', 164, yPosition + 5);
      doc.text('Amount', 184, yPosition + 5);
      
      // Table row for this single order
      doc.setFont('helvetica', 'normal');
      yPosition += 8;
      
      const pickupDate = formatDateNoTimezone(order.pickupDate.split(' - ')[0]);
      
      // Build origin-destination text with all pickups and deliveries
      let originDestination = '';
      const pickups = order.pickup_drops?.filter(pd => pd.type === 'pickup') || [];
      const deliveries = order.pickup_drops?.filter(pd => pd.type === 'delivery') || [];
      
      // If we have pickup_drops data, use it
      if (pickups.length > 0 || deliveries.length > 0) {
        pickups.forEach((pickup, idx) => {
          originDestination += `Pickup ${pickups.length > 1 ? idx + 1 : ''}: ${pickup.city}, ${pickup.state}\n`;
        });
        deliveries.forEach((delivery, idx) => {
          originDestination += `Delivery ${deliveries.length > 1 ? idx + 1 : ''}: ${delivery.city}, ${delivery.state}\n`;
        });
      } else {
        // Fallback to old single pickup/delivery format
        const origin = `${order.pickupCity}, ${order.pickupState}`;
        const destination = `${order.deliveryCity}, ${order.deliveryState}`;
        originDestination = `Pickup: ${origin}\nDelivery: ${destination}`;
      }
      
      // Calculate required height based on text content
      const lines = doc.splitTextToSize(originDestination.trim(), 50);
      const lineHeight = 4;
      const minHeight = 12;
      const calculatedHeight = Math.max(minHeight, lines.length * lineHeight + 4);
      
      // Draw all cells with the calculated height
      doc.rect(20, yPosition, 22, calculatedHeight);
      doc.rect(42, yPosition, 20, calculatedHeight);
      doc.rect(62, yPosition, 35, calculatedHeight);
      doc.rect(97, yPosition, 53, calculatedHeight);
      doc.rect(150, yPosition, 12, calculatedHeight);
      doc.rect(162, yPosition, 20, calculatedHeight);
      doc.rect(182, yPosition, 25, calculatedHeight);
      
      // Position text vertically centered in the cells
      const textYOffset = (calculatedHeight - lines.length * lineHeight) / 2 + lineHeight;
      
      doc.text(pickupDate, 22, yPosition + textYOffset + 1);
      doc.text(order.truckNumber, 44, yPosition + textYOffset + 1);
      doc.text(order.brokerLoadNumber, 64, yPosition + textYOffset + 1);
      doc.text(lines, 99, yPosition + textYOffset);
      doc.text('1', 152, yPosition + textYOffset + 3);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 164, yPosition + textYOffset + 3);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 184, yPosition + textYOffset + 3);
      
      yPosition += calculatedHeight;
      
      // Totals for this single order
      const freightTotal = order.freightAmount;
      const detentionTotal = order.detention || 0;
      const layoverTotal = order.layover || 0;
      const extraStopTotal = order.extraStop || 0;
      const lumperTotal = order.lumper || 0;
      const tonuTotal = order.tonu || 0;
      const otherChargesTotal = order.otherCharges || 0;
      const otherAdditionalsTotal = order.otherAdditionals || 0;
      const lateFeeTotal = order.lateFee || 0;
      
      // Freight Income and additional fees
      doc.rect(150, yPosition, 32, 8);
      doc.rect(182, yPosition, 25, 8);
      doc.setFont('helvetica', 'bold');
      doc.text('Freight Income', 152, yPosition + 5);
      doc.text(formatCurrency(freightTotal), 184, yPosition + 5);
      yPosition += 8;
      
      // Additional fees sections...
      if (detentionTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('Detention', 152, yPosition + 5);
        doc.text(formatCurrency(detentionTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (layoverTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('Layover', 152, yPosition + 5);
        doc.text(formatCurrency(layoverTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (extraStopTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('Extra Stop', 152, yPosition + 5);
        doc.text(formatCurrency(extraStopTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (lumperTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('Lumper', 152, yPosition + 5);
        doc.text(formatCurrency(lumperTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (tonuTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('TONU', 152, yPosition + 5);
        doc.text(formatCurrency(tonuTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (otherChargesTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        const otherChargesLabel = order.otherChargesReason 
          ? `${order.otherChargesReason.substring(0, 25)}` 
          : 'Other Charges';
        doc.text(otherChargesLabel, 152, yPosition + 5);
        doc.text(formatCurrency(otherChargesTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (otherAdditionalsTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        const otherAddLabel = order.otherAdditionalsReason 
          ? `${order.otherAdditionalsReason.substring(0, 25)}` 
          : 'Other Additionals';
        doc.text(otherAddLabel, 152, yPosition + 5);
        doc.text(formatCurrency(otherAdditionalsTotal), 184, yPosition + 5);
        yPosition += 8;
      }
      
      if (lateFeeTotal > 0) {
        doc.rect(150, yPosition, 32, 8);
        doc.rect(182, yPosition, 25, 8);
        doc.text('Late Fee', 152, yPosition + 5);
        doc.text(`-${formatCurrency(lateFeeTotal).replace('$', '')}`, 184, yPosition + 5);
        yPosition += 8;
      }
      
      // Total
      const finalTotal = order.totalFreightAmount;
      doc.rect(162, yPosition, 20, 8);
      doc.rect(182, yPosition, 25, 8);
      doc.text('TOTAL:', 164, yPosition + 5);
      doc.text(formatCurrency(finalTotal), 184, yPosition + 5);
      
      // Notice section
      yPosition += 30;
      doc.setTextColor(255, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTICE OF ASSIGMENT', 105, yPosition, { align: 'center' });
      
      yPosition += 6;
      doc.setFont('helvetica', 'normal');
      doc.text('This invoice is assigned to, owned by and only payable to:', 105, yPosition, { align: 'center' });
      
      yPosition += 8;
      doc.setFont('helvetica', 'bold');
      doc.text('Capital Depot INC', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('606 Potter Road', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('Des Plaines IL 60016', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('847-470-1687', 105, yPosition, { align: 'center' });
      
      yPosition += 8;
      doc.setFont('helvetica', 'normal');
      doc.text('ACH Payments to be sent to:', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('Account name: Capital Depot INC', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('Routing Number: 071000013', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('Account Number: 522702898', 105, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text('Remittance address: AR@capitaldepot.com', 105, yPosition, { align: 'center' });
      
      // Footer
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
      doc.text('Page 1 Of 1', 190, 280);
      
      // Get PDF bytes and collect RC/POD/Additional files for this order
      const invoicePdfBytes = doc.output('arraybuffer');
      const rcFiles = order.rcFiles || [];
      const podFiles = order.podFiles || [];
      const additionalFiles = order.additionalFiles || [];
      
      // Add merge task (don't await here - we'll process in batches)
      const taskIndex = mergeTasks.length;
      taskToCompanyMap.set(taskIndex, sanitizedCompanyName);
      mergeTasks.push({
        invoicePdfBytes,
        rcFiles,
        podFiles,
        additionalFiles,
        baseFilename,
        companyFolder: sanitizedCompanyName
      });

      // Add order data to company's XLSX data
      const driverCompanyName = order.companyName;
      xlsxDataByCompany[sanitizedCompanyName].push({
        'ClientNo': brokerMcMap.get(order.brokerName) || '',
        'Invoice#': formatInternalLoadNumber(order.internalLoadNumber, driverCompanyName),
        'Debtor Debtor Name': order.brokerName,
        'Pono': order.brokerLoadNumber,
        'InvDate': currentDate,
        'InvAmt': `$${order.totalFreightAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      });
    }
  }

  console.log(`Collected ${mergeTasks.length} merge tasks, processing in parallel batches...`);
  
  onProgress?.({ current: 0, total: mergeTasks.length, phase: 'processing', message: `Processing 0 of ${mergeTasks.length} invoices...` });

  // Process merge tasks in parallel batches of 5
  const BATCH_SIZE = 5;
  const TIMEOUT_MS = 30000; // 30 second timeout per merge
  const invoicesByCompany: Record<string, Array<{ filename: string; pdfBytes: number[]; success: boolean }>> = {};
  const failedInvoices: string[] = [];
  const invoicesWithSkippedFiles: Array<{ invoice: string; skippedFiles: SkippedFile[] }> = [];
  const invoicesWithFallbackFiles: Array<{ invoice: string; fallbackFiles: IncludedFile[] }> = [];
  let successCount = 0;
  let processedCount = 0;
  
  // Initialize company arrays
  for (const companyFolder of Object.keys(xlsxDataByCompany)) {
    invoicesByCompany[companyFolder] = [];
  }

  // Process ALL batches until completion
  let batchNumber = 0;
  const totalBatches = Math.ceil(mergeTasks.length / BATCH_SIZE);
  
  for (let i = 0; i < mergeTasks.length; i += BATCH_SIZE) {
    batchNumber++;
    const batch = mergeTasks.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${batchNumber} of ${totalBatches} (${batch.length} invoices, total processed: ${i}/${mergeTasks.length})`);
    
    // Process batch in parallel with timeout - track success/failure
    const batchPromises = batch.map(async (task, batchIdx) => {
      try {
        const result = await withTimeout(
          processMergeTask(task),
          TIMEOUT_MS
        );
        
        if (result === null) {
          console.warn(`Timeout processing invoice: ${task.baseFilename}`);
          failedInvoices.push(task.baseFilename);
          // Return fallback with just the invoice PDF
          return { 
            filename: task.baseFilename, 
            pdfBytes: Array.from(new Uint8Array(task.invoicePdfBytes)),
            success: false,
            skippedFiles: [] as SkippedFile[],
            fallbackFiles: [] as IncludedFile[]
          };
        }
        
        // Track skipped files per invoice
        if (result.skippedFiles && result.skippedFiles.length > 0) {
          invoicesWithSkippedFiles.push({
            invoice: task.baseFilename,
            skippedFiles: result.skippedFiles
          });
        }
        
        // Track fallback files (embedded as attachment instead of inline merge)
        if (result.fallbackFiles && result.fallbackFiles.length > 0) {
          invoicesWithFallbackFiles.push({
            invoice: task.baseFilename,
            fallbackFiles: result.fallbackFiles
          });
        }
        
        successCount++;
        return { ...result, success: true };
      } catch (error) {
        console.error(`Error processing invoice ${task.baseFilename}:`, error);
        failedInvoices.push(task.baseFilename);
        return { 
          filename: task.baseFilename, 
          pdfBytes: Array.from(new Uint8Array(task.invoicePdfBytes)),
          success: false,
          skippedFiles: [] as SkippedFile[],
          fallbackFiles: [] as IncludedFile[]
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Add results to their respective company folders
    batchResults.forEach((result, idx) => {
      const taskIndex = i + idx;
      const companyFolder = taskToCompanyMap.get(taskIndex);
      if (companyFolder && invoicesByCompany[companyFolder]) {
        invoicesByCompany[companyFolder].push({
          filename: result.filename,
          pdfBytes: result.pdfBytes,
          success: result.success
        });
      }
    });
    
    // Update progress after each batch
    processedCount = i + batch.length;
    onProgress?.({ 
      current: processedCount, 
      total: mergeTasks.length, 
      phase: 'processing', 
      message: `Processing ${processedCount} of ${mergeTasks.length} invoices...` 
    });
    
    console.log(`Batch ${batchNumber} complete. Success so far: ${successCount}/${processedCount}`);
    
    // Small delay between batches to prevent rate limiting
    if (i + BATCH_SIZE < mergeTasks.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`All batches processed. Success: ${successCount}/${mergeTasks.length}, Failed: ${failedInvoices.length}`);
  
  // Report failures if any
  if (failedInvoices.length > 0) {
    console.error(`Failed to fully process ${failedInvoices.length} invoices:`, failedInvoices);
  }
  
  // Report skipped files if any
  if (invoicesWithSkippedFiles.length > 0) {
    console.warn(`${invoicesWithSkippedFiles.length} invoice(s) had files that could not be attached:`, invoicesWithSkippedFiles);
  }
  
  // Report fallback files if any
  if (invoicesWithFallbackFiles.length > 0) {
    console.warn(`${invoicesWithFallbackFiles.length} invoice(s) had files embedded as attachments (not inline):`, invoicesWithFallbackFiles);
  }

  onProgress?.({ current: mergeTasks.length, total: mergeTasks.length, phase: 'finalizing', message: 'Creating ZIP file...' });
  console.log(`All invoices processed. Creating ZIP file...`);

  // Create ZIP file with company folders
  try {
    console.log('Creating ZIP with company folders');
    const zip = new JSZip();
    
    // Create a folder for each company
    for (const [companyFolder, invoices] of Object.entries(invoicesByCompany)) {
      const folder = zip.folder(companyFolder);
      if (!folder) continue;

      // Add invoices to company folder
      for (const invoice of invoices) {
        folder.file(invoice.filename, new Uint8Array(invoice.pdfBytes));
      }
      
      // Add company-specific XLSX file
      const xlsxData = xlsxDataByCompany[companyFolder];
      if (xlsxData && xlsxData.length > 0) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoice Data');
        
        // Add headers
        worksheet.columns = [
          { header: 'ClientNo', key: 'ClientNo', width: 15 },
          { header: 'Invoice#', key: 'Invoice#', width: 15 },
          { header: 'Debtor Debtor Name', key: 'Debtor Debtor Name', width: 30 },
          { header: 'Pono', key: 'Pono', width: 20 },
          { header: 'InvDate', key: 'InvDate', width: 15 },
          { header: 'InvAmt', key: 'InvAmt', width: 15 }
        ];
        
        // Add data rows
        xlsxData.forEach(row => {
          worksheet.addRow(row);
        });
        
        // Generate Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();
        folder.file('invoice_data.xlsx', buffer);
      }
    }
    
    // Generate the ZIP file
    console.log('Generating ZIP file...');
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    // Download the ZIP file
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'invoices.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('ZIP file downloaded successfully');
    
    // Build warnings for the caller to display
    const warnings: InvoiceWarning[] = [];
    
    // Add skipped files warnings
    for (const item of invoicesWithSkippedFiles) {
      warnings.push({
        invoice: item.invoice.replace('.pdf', ''),
        files: item.skippedFiles.map(f => ({ type: f.file_type, name: f.file_name })),
        reason: 'skipped'
      });
    }
    
    // Add fallback files warnings
    for (const item of invoicesWithFallbackFiles) {
      warnings.push({
        invoice: item.invoice.replace('.pdf', ''),
        files: item.fallbackFiles.map(f => ({ type: f.file_type, name: f.file_name })),
        reason: 'fallback'
      });
    }
    
    if (warnings.length > 0) {
      console.warn(`Invoice generation completed with ${warnings.length} warning(s):`, warnings);
    }
    
    // Return the IDs of all orders that were processed and any warnings
    return { orderIds: orders.map(order => order.id), warnings };
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    throw error; // Re-throw so caller can handle
  }
};