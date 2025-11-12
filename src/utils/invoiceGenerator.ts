import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/utils';

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
  lateFee?: number;
  companyName: string;
  driverName: string;
  mileage: number;
  rcFiles?: OrderFile[];
  podFiles?: OrderFile[];
}

export const generateInvoicePDF = async (orders: Order[]): Promise<string[]> => {
  if (!orders.length) return [];

  console.log(`Starting invoice generation for ${orders.length} orders:`, orders.map(o => o.internalLoadNumber));

  // Group orders by company first, then by broker within each company
  const companiesMap = orders.reduce((acc, order) => {
    if (!acc[order.companyName]) {
      acc[order.companyName] = {};
    }
    if (!acc[order.companyName][order.brokerName]) {
      acc[order.companyName][order.brokerName] = {
        brokerName: order.brokerName,
        companyName: order.companyName,
        orders: []
      };
    }
    acc[order.companyName][order.brokerName].orders.push(order);
    return acc;
  }, {} as Record<string, Record<string, { brokerName: string; companyName: string; orders: Order[] }>>);

  console.log(`Grouped orders into ${Object.keys(companiesMap).length} companies with invoices`);

  // Collect all invoice data organized by company
  const invoicesByCompany: Record<string, Array<{ filename: string; pdfBytes: number[] }>> = {};
  const xlsxDataByCompany: Record<string, any[]> = {};

  // Fetch broker MC numbers for all orders
  const brokerNames = [...new Set(orders.map(o => o.brokerName))];
  const { data: brokersData } = await supabase
    .from('brokers')
    .select('name, mc_number')
    .in('name', brokerNames);
  
  const brokerMcMap = new Map(brokersData?.map(b => [b.name, b.mc_number]) || []);
  const currentDate = new Date().toLocaleDateString();

  // Generate PDF for each broker/company combination
  for (const [companyName, brokerGroups] of Object.entries(companiesMap)) {
    const sanitizedCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    invoicesByCompany[sanitizedCompanyName] = [];
    xlsxDataByCompany[sanitizedCompanyName] = [];

    for (const group of Object.values(brokerGroups)) {
      const doc = new jsPDF();
      
      // Header - Company name and INVOICE
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(group.companyName, 20, 25);
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
      const invoiceNumber = group.orders[0]?.internalLoadNumber || Math.floor(Math.random() * 9999) + 1000;
      
      // Simple filename - just the load number
      const baseFilename = `${invoiceNumber}.pdf`;
      console.log(`Generated invoice ${baseFilename} for company ${companyName}`);
    
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
    doc.rect(85, yPosition, 50, 8);
    doc.rect(135, yPosition, 20, 8);
    doc.rect(155, yPosition, 20, 8);
    doc.rect(175, yPosition, 25, 8);
    
    doc.text('Date', 22, yPosition + 5);
    doc.text('Truck #', 42, yPosition + 5);
    doc.text('Load #', 62, yPosition + 5);
    doc.text('Origin - Destination', 87, yPosition + 5);
    doc.text('Qty', 137, yPosition + 5);
    doc.text('Rate', 157, yPosition + 5);
    doc.text('Amount', 177, yPosition + 5);
    
    // Table rows
    doc.setFont('helvetica', 'normal');
    yPosition += 8;
    let freightTotal = 0;
    let detentionTotal = 0;
    let layoverTotal = 0;
    let extraStopTotal = 0;
    let lumperTotal = 0;
    let tonuTotal = 0;
    let lateFeeTotal = 0;
    
    group.orders.forEach((order) => {
      const pickupDate = order.pickupDate.split(' - ')[0];
      const origin = `${order.pickupCity}, ${order.pickupState}`;
      const destination = `${order.deliveryCity}, ${order.deliveryState}`;
      const originDestination = `Pickup: ${origin}\nDelivery: ${destination}`;
      
      doc.rect(20, yPosition, 20, 12);
      doc.rect(40, yPosition, 20, 12);
      doc.rect(60, yPosition, 25, 12);
      doc.rect(85, yPosition, 50, 12);
      doc.rect(135, yPosition, 20, 12);
      doc.rect(155, yPosition, 20, 12);
      doc.rect(175, yPosition, 25, 12);
      
      doc.text(pickupDate, 22, yPosition + 5);
      doc.text(order.truckNumber, 42, yPosition + 5);
      doc.text(order.brokerLoadNumber, 62, yPosition + 5);
      
      const lines = doc.splitTextToSize(originDestination, 48);
      doc.text(lines, 87, yPosition + 4);
      
      doc.text('1', 137, yPosition + 7);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 157, yPosition + 7);
      doc.text(formatCurrency(order.totalFreightAmount).replace('$', '$'), 177, yPosition + 7);
      
      freightTotal += order.freightAmount;
      detentionTotal += order.detention || 0;
      layoverTotal += order.layover || 0;
      extraStopTotal += order.extraStop || 0;
      lumperTotal += order.lumper || 0;
      tonuTotal += order.tonu || 0;
      lateFeeTotal += order.lateFee || 0;
      yPosition += 12;
    });
    
    // Freight Income and additional fees
    doc.rect(135, yPosition, 40, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Freight Income', 137, yPosition + 5);
    doc.text(formatCurrency(freightTotal), 177, yPosition + 5);
    yPosition += 8;
    
    // Additional fees sections...
    if (detentionTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Detention', 137, yPosition + 5);
      doc.text(formatCurrency(detentionTotal), 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (layoverTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Layover', 137, yPosition + 5);
      doc.text(formatCurrency(layoverTotal), 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (extraStopTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Extra Stop', 137, yPosition + 5);
      doc.text(formatCurrency(extraStopTotal), 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (lumperTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Lumper', 137, yPosition + 5);
      doc.text(formatCurrency(lumperTotal), 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (tonuTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('TONU', 137, yPosition + 5);
      doc.text(formatCurrency(tonuTotal), 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (lateFeeTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Late Fee', 137, yPosition + 5);
      doc.text(`-${formatCurrency(lateFeeTotal).replace('$', '')}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    // Total
    const finalTotal = group.orders.reduce((sum, order) => sum + order.totalFreightAmount, 0);
    doc.rect(155, yPosition, 20, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.text('TOTAL:', 157, yPosition + 5);
    doc.text(formatCurrency(finalTotal), 177, yPosition + 5);
    
    // Notice section
    yPosition += 30;
    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTICE OF ASSIGNMENT', 105, yPosition, { align: 'center' });
    
    yPosition += 10;
    doc.setFont('helvetica', 'normal');
    const noticeText = [
      'This invoice is assigned to, owned by and only payable to:',
      'Capital Depot Inc',
      '8930 Waukegan Rd Suite 230',
      'Morton Grove, IL 60053',
      'Any disputes, claims etc. must be reported to Capital Depot INC at 847-470-1687',
      'immediately upon receipt of this invoice'
    ];
    
    noticeText.forEach((line, i) => {
      doc.text(line, 105, yPosition + (i * 5), { align: 'center' });
    });
    
    // Footer
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
    doc.text('Page 1 Of 1', 190, 280);
    
      // Get PDF bytes and collect RC/POD files
      const invoicePdfBytes = doc.output('arraybuffer');
      const allRcFiles = group.orders.flatMap(order => order.rcFiles || []);
      const allPodFiles = group.orders.flatMap(order => order.podFiles || []);
      
      // If we have RC or POD files, merge them first
      if (allRcFiles.length > 0 || allPodFiles.length > 0) {
        try {
          const { data: mergeResult, error: mergeError } = await supabase.functions.invoke('merge-pdfs', {
            body: {
              invoicePdfBytes: Array.from(new Uint8Array(invoicePdfBytes)),
              rcFiles: allRcFiles,
              podFiles: allPodFiles
            }
          });
          
          if (!mergeError && mergeResult?.pdfBytes) {
            invoicesByCompany[sanitizedCompanyName].push({
              filename: baseFilename,
              pdfBytes: mergeResult.pdfBytes
            });
          } else {
            // Fallback to just the invoice
            invoicesByCompany[sanitizedCompanyName].push({
              filename: baseFilename,
              pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
            });
          }
        } catch (error) {
          // Fallback to just the invoice
          invoicesByCompany[sanitizedCompanyName].push({
            filename: baseFilename,
            pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
          });
        }
      } else {
        // No additional files, just use the invoice
        invoicesByCompany[sanitizedCompanyName].push({
          filename: baseFilename,
          pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
        });
      }

      // Add order data to company's XLSX data
      group.orders.forEach(order => {
        xlsxDataByCompany[sanitizedCompanyName].push({
          'ClientNo': brokerMcMap.get(order.brokerName) || '',
          'Invoice#': order.internalLoadNumber,
          'Debtor Debtor Name': order.brokerName,
          'Pono': order.brokerLoadNumber,
          'InvDate': currentDate,
          'InvAmt': `$${order.totalFreightAmount.toLocaleString()}`
        });
      });
    }
  }

  console.log(`Collected invoices for ${Object.keys(invoicesByCompany).length} companies`);

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
        const headers = ['ClientNo', 'Invoice#', 'Debtor Debtor Name', 'Pono', 'InvDate', 'InvAmt'];
        const csvRows = [
          headers.join('\t'),
          ...xlsxData.map(row => 
            headers.map(h => row[h as keyof typeof row] || '').join('\t')
          )
        ];
        const csvContent = csvRows.join('\n');
        folder.file('invoice_data.xls', csvContent);
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