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
  podFiles?: OrderFile[];
  pickup_drops?: PickupDrop[];
}

// Helper to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
};

// Process a single invoice merge
interface MergeTask {
  invoicePdfBytes: ArrayBuffer;
  rcFiles: OrderFile[];
  podFiles: OrderFile[];
  baseFilename: string;
  companyFolder: string;
}

const processMergeTask = async (task: MergeTask): Promise<{ filename: string; pdfBytes: number[] }> => {
  const { invoicePdfBytes, rcFiles, podFiles, baseFilename } = task;
  
  if (rcFiles.length > 0 || podFiles.length > 0) {
    try {
      const { data: mergeResult, error: mergeError } = await supabase.functions.invoke('merge-pdfs', {
        body: {
          invoicePdfBytes: Array.from(new Uint8Array(invoicePdfBytes)),
          rcFiles,
          podFiles
        }
      });
      
      if (!mergeError && mergeResult?.pdfBytes) {
        return { filename: baseFilename, pdfBytes: mergeResult.pdfBytes };
      }
    } catch (error) {
      console.error(`Error merging ${baseFilename}:`, error);
    }
  }
  
  // Fallback to just the invoice
  return { filename: baseFilename, pdfBytes: Array.from(new Uint8Array(invoicePdfBytes)) };
};

export const generateInvoicePDF = async (orders: Order[]): Promise<string[]> => {
  if (!orders.length) return [];

  console.log(`Starting invoice generation for ${orders.length} orders:`, orders.map(o => o.internalLoadNumber));

  // Group orders by driver's company (companyName), then by broker within each company
  // This ensures invoices are organized by the company the driver belongs to
  const companiesMap = orders.reduce((acc, order) => {
    // Use driver's company (companyName) for folder organization, NOT bookedByCompanyName
    const driverCompany = order.companyName;
    if (!acc[driverCompany]) {
      acc[driverCompany] = {};
    }
    if (!acc[driverCompany][order.brokerName]) {
      acc[driverCompany][order.brokerName] = {
        brokerName: order.brokerName,
        companyName: driverCompany,
        orders: []
      };
    }
    acc[driverCompany][order.brokerName].orders.push(order);
    return acc;
  }, {} as Record<string, Record<string, { brokerName: string; companyName: string; orders: Order[] }>>);

  console.log(`Grouped orders into ${Object.keys(companiesMap).length} companies (by driver company) with invoices`);

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

  // Generate PDF for each broker/company combination
  for (const [companyName, brokerGroups] of Object.entries(companiesMap)) {
    const sanitizedCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    xlsxDataByCompany[sanitizedCompanyName] = [];

    for (const group of Object.values(brokerGroups)) {
      const doc = new jsPDF();
      
      // Header - Use bookedByCompanyName for display, but companyName (driver's company) for invoice suffix
      const firstOrderInGroup = group.orders[0];
      const displayCompanyName = firstOrderInGroup.bookedByCompanyName || group.companyName;
      
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
      doc.text(group.brokerName, 22, 55);
      
      // Add broker address if available
      const firstOrder = group.orders[0];
      let yPos = 61;
      if (firstOrder.brokerAddress) {
        // Split long address into multiple lines within the box
        const addressLines = doc.splitTextToSize(firstOrder.brokerAddress, 95);
        for (let i = 0; i < Math.min(addressLines.length, 2); i++) {
          doc.text(addressLines[i], 22, yPos);
          yPos += 5;
        }
      }
      if (firstOrder.brokerCity || firstOrder.brokerState || firstOrder.brokerZipCode) {
        const cityStateZip = [firstOrder.brokerCity, firstOrder.brokerState, firstOrder.brokerZipCode]
          .filter(Boolean)
          .join(', ');
        if (cityStateZip) {
          doc.text(cityStateZip, 22, yPos);
        }
      }
      
      // Invoice details table (right side)
      const rawInvoiceNumber = group.orders[0]?.internalLoadNumber || Math.floor(Math.random() * 9999) + 1000;
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
    doc.rect(20, yPosition, 20, 8);
    doc.rect(40, yPosition, 20, 8);
    doc.rect(60, yPosition, 25, 8);
    doc.rect(85, yPosition, 53, 8);
    doc.rect(138, yPosition, 20, 8);
    doc.rect(158, yPosition, 20, 8);
    doc.rect(178, yPosition, 25, 8);
    
    doc.text('Date', 22, yPosition + 5);
    doc.text('Truck #', 42, yPosition + 5);
    doc.text('Load #', 62, yPosition + 5);
    doc.text('Origin - Destination', 87, yPosition + 5);
    doc.text('Qty', 140, yPosition + 5);
    doc.text('Rate', 160, yPosition + 5);
    doc.text('Amount', 180, yPosition + 5);
    
    // Table rows
    doc.setFont('helvetica', 'normal');
    yPosition += 8;
    let freightTotal = 0;
    let detentionTotal = 0;
    let layoverTotal = 0;
    let extraStopTotal = 0;
    let lumperTotal = 0;
    let tonuTotal = 0;
    let otherChargesTotal = 0;
    let otherAdditionalsTotal = 0;
    let lateFeeTotal = 0;
    
    // Collect reasons for display
    const otherChargesReasons: string[] = [];
    const otherAdditionalsReasons: string[] = [];
    
    group.orders.forEach((order) => {
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
      doc.rect(20, yPosition, 20, calculatedHeight);
      doc.rect(40, yPosition, 20, calculatedHeight);
      doc.rect(60, yPosition, 25, calculatedHeight);
      doc.rect(85, yPosition, 53, calculatedHeight);
      doc.rect(138, yPosition, 20, calculatedHeight);
      doc.rect(158, yPosition, 20, calculatedHeight);
      doc.rect(178, yPosition, 25, calculatedHeight);
      
      // Position text vertically centered in the cells
      const textYOffset = (calculatedHeight - lines.length * lineHeight) / 2 + lineHeight;
      
      doc.text(pickupDate, 22, yPosition + textYOffset + 1);
      doc.text(order.truckNumber, 42, yPosition + textYOffset + 1);
      doc.text(order.brokerLoadNumber, 62, yPosition + textYOffset + 1);
      doc.text(lines, 87, yPosition + textYOffset);
      doc.text('1', 140, yPosition + textYOffset + 3);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 160, yPosition + textYOffset + 3);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 180, yPosition + textYOffset + 3);
      
      freightTotal += order.freightAmount;
      detentionTotal += order.detention || 0;
      layoverTotal += order.layover || 0;
      extraStopTotal += order.extraStop || 0;
      lumperTotal += order.lumper || 0;
      tonuTotal += order.tonu || 0;
      otherChargesTotal += order.otherCharges || 0;
      otherAdditionalsTotal += order.otherAdditionals || 0;
      lateFeeTotal += order.lateFee || 0;
      
      // Collect reasons
      if (order.otherCharges && order.otherCharges > 0 && order.otherChargesReason) {
        otherChargesReasons.push(order.otherChargesReason);
      }
      if (order.otherAdditionals && order.otherAdditionals > 0 && order.otherAdditionalsReason) {
        otherAdditionalsReasons.push(order.otherAdditionalsReason);
      }
      
      yPosition += calculatedHeight;
    });
    
    // Freight Income and additional fees
    doc.rect(138, yPosition, 40, 8);
    doc.rect(178, yPosition, 25, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Freight Income', 140, yPosition + 5);
    doc.text(formatCurrency(freightTotal), 180, yPosition + 5);
    yPosition += 8;
    
    // Additional fees sections...
    if (detentionTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('Detention', 140, yPosition + 5);
      doc.text(formatCurrency(detentionTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (layoverTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('Layover', 140, yPosition + 5);
      doc.text(formatCurrency(layoverTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (extraStopTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('Extra Stop', 140, yPosition + 5);
      doc.text(formatCurrency(extraStopTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (lumperTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('Lumper', 140, yPosition + 5);
      doc.text(formatCurrency(lumperTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (tonuTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('TONU', 140, yPosition + 5);
      doc.text(formatCurrency(tonuTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (otherChargesTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      const otherChargesLabel = otherChargesReasons.length > 0 
        ? `${otherChargesReasons.join(', ').substring(0, 25)}` 
        : 'Other Charges';
      doc.text(otherChargesLabel, 140, yPosition + 5);
      doc.text(formatCurrency(otherChargesTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (otherAdditionalsTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      const otherAddLabel = otherAdditionalsReasons.length > 0 
        ? `${otherAdditionalsReasons.join(', ').substring(0, 25)}` 
        : 'Other Additionals';
      doc.text(otherAddLabel, 140, yPosition + 5);
      doc.text(formatCurrency(otherAdditionalsTotal), 180, yPosition + 5);
      yPosition += 8;
    }
    
    if (lateFeeTotal > 0) {
      doc.rect(138, yPosition, 40, 8);
      doc.rect(178, yPosition, 25, 8);
      doc.text('Late Fee', 140, yPosition + 5);
      doc.text(`-${formatCurrency(lateFeeTotal).replace('$', '')}`, 180, yPosition + 5);
      yPosition += 8;
    }
    
    // Total
    const finalTotal = group.orders.reduce((sum, order) => sum + order.totalFreightAmount, 0);
    doc.rect(158, yPosition, 20, 8);
    doc.rect(178, yPosition, 25, 8);
    doc.text('TOTAL:', 160, yPosition + 5);
    doc.text(formatCurrency(finalTotal), 180, yPosition + 5);
    
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
    
      // Get PDF bytes and collect RC/POD files
      const invoicePdfBytes = doc.output('arraybuffer');
      const allRcFiles = group.orders.flatMap(order => order.rcFiles || []);
      const allPodFiles = group.orders.flatMap(order => order.podFiles || []);
      
      // Add merge task (don't await here - we'll process in batches)
      const taskIndex = mergeTasks.length;
      taskToCompanyMap.set(taskIndex, sanitizedCompanyName);
      mergeTasks.push({
        invoicePdfBytes,
        rcFiles: allRcFiles,
        podFiles: allPodFiles,
        baseFilename,
        companyFolder: sanitizedCompanyName
      });

      // Add order data to company's XLSX data
      group.orders.forEach(order => {
        // Use the driver's company (order.companyName) for the invoice suffix, not bookedByCompanyName
        const driverCompanyName = order.companyName;
        xlsxDataByCompany[sanitizedCompanyName].push({
          'ClientNo': brokerMcMap.get(order.brokerName) || '',
          'Invoice#': formatInternalLoadNumber(order.internalLoadNumber, driverCompanyName),
          'Debtor Debtor Name': order.brokerName,
          'Pono': order.brokerLoadNumber,
          'InvDate': currentDate,
          'InvAmt': `$${order.totalFreightAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        });
      });
    }
  }

  console.log(`Collected ${mergeTasks.length} merge tasks, processing in parallel batches...`);

  // Process merge tasks in parallel batches of 5
  const BATCH_SIZE = 5;
  const TIMEOUT_MS = 30000; // 30 second timeout per merge
  const invoicesByCompany: Record<string, Array<{ filename: string; pdfBytes: number[] }>> = {};
  
  // Initialize company arrays
  for (const companyFolder of Object.keys(xlsxDataByCompany)) {
    invoicesByCompany[companyFolder] = [];
  }

  for (let i = 0; i < mergeTasks.length; i += BATCH_SIZE) {
    const batch = mergeTasks.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(mergeTasks.length / BATCH_SIZE)} (${batch.length} invoices)`);
    
    // Process batch in parallel with timeout
    const batchPromises = batch.map(task => 
      withTimeout(
        processMergeTask(task),
        TIMEOUT_MS,
        { filename: task.baseFilename, pdfBytes: Array.from(new Uint8Array(task.invoicePdfBytes)) }
      )
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    // Add results to their respective company folders
    batchResults.forEach((result, idx) => {
      const taskIndex = i + idx;
      const companyFolder = taskToCompanyMap.get(taskIndex);
      if (companyFolder && invoicesByCompany[companyFolder]) {
        invoicesByCompany[companyFolder].push(result);
      }
    });
    
    // Small delay between batches to prevent rate limiting
    if (i + BATCH_SIZE < mergeTasks.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

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
    
    // Return the IDs of all orders that were processed
    return orders.map(order => order.id);
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    return [];
  }
};