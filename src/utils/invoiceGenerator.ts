import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

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
  brokerLoadNumber: string;
  freightAmount: number;
  totalFreightAmount: number;
  detention?: number;
  layover?: number;
  extraStop?: number;
  lumper?: number;
  lateFee?: number;
  companyName: string;
  driverName: string;
  mileage: number;
  rcFiles?: OrderFile[];
  podFiles?: OrderFile[];
}

export const generateInvoicePDF = async (orders: Order[]) => {
  if (!orders.length) return;

  // Group orders by broker and company
  const groupedOrders = orders.reduce((acc, order) => {
    const key = `${order.brokerName}-${order.companyName}`;
    if (!acc[key]) {
      acc[key] = {
        brokerName: order.brokerName,
        companyName: order.companyName,
        orders: []
      };
    }
    acc[key].orders.push(order);
    return acc;
  }, {} as Record<string, { brokerName: string; companyName: string; orders: Order[] }>);

  const groupValues = Object.values(groupedOrders);
  const isMultipleInvoices = groupValues.length > 1;

  // Collect all invoice data for edge function
  const invoiceData = [];

  // Generate PDF for each broker/company combination
  for (const group of groupValues) {
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
    
    // Invoice details table (right side)
    const currentDate = new Date().toLocaleDateString();
    const invoiceNumber = group.orders[0]?.internalLoadNumber || Math.floor(Math.random() * 9999) + 1000;
    
    // Generate filename with new format
    const baseFilename = `${invoiceNumber}.pdf`;
    
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
      doc.text(`$${order.totalFreightAmount.toLocaleString()}`, 157, yPosition + 7);
      doc.text(`$${order.totalFreightAmount.toLocaleString()}`, 177, yPosition + 7);
      
      freightTotal += order.freightAmount;
      detentionTotal += order.detention || 0;
      layoverTotal += order.layover || 0;
      extraStopTotal += order.extraStop || 0;
      lumperTotal += order.lumper || 0;
      lateFeeTotal += order.lateFee || 0;
      yPosition += 12;
    });
    
    // Freight Income and additional fees
    doc.rect(135, yPosition, 40, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Freight Income', 137, yPosition + 5);
    doc.text(`$${freightTotal.toLocaleString()}`, 177, yPosition + 5);
    yPosition += 8;
    
    // Additional fees sections...
    if (detentionTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Detention', 137, yPosition + 5);
      doc.text(`$${detentionTotal.toLocaleString()}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (layoverTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Layover', 137, yPosition + 5);
      doc.text(`$${layoverTotal.toLocaleString()}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (extraStopTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Extra Stop', 137, yPosition + 5);
      doc.text(`$${extraStopTotal.toLocaleString()}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (lumperTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Lumper', 137, yPosition + 5);
      doc.text(`$${lumperTotal.toLocaleString()}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    if (lateFeeTotal > 0) {
      doc.rect(135, yPosition, 40, 8);
      doc.rect(175, yPosition, 25, 8);
      doc.text('Late Fee', 137, yPosition + 5);
      doc.text(`-$${lateFeeTotal.toLocaleString()}`, 177, yPosition + 5);
      yPosition += 8;
    }
    
    // Total
    const finalTotal = group.orders.reduce((sum, order) => sum + order.totalFreightAmount, 0);
    doc.rect(155, yPosition, 20, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.text('TOTAL:', 157, yPosition + 5);
    doc.text(`$${finalTotal.toLocaleString()}`, 177, yPosition + 5);
    
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
          invoiceData.push({
            filename: baseFilename,
            pdfBytes: mergeResult.pdfBytes
          });
        } else {
          // Fallback to just the invoice
          invoiceData.push({
            filename: baseFilename,
            pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
          });
        }
      } catch (error) {
        // Fallback to just the invoice
        invoiceData.push({
          filename: baseFilename,
          pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
        });
      }
    } else {
      // No additional files, just use the invoice
      invoiceData.push({
        filename: baseFilename,
        pdfBytes: Array.from(new Uint8Array(invoicePdfBytes))
      });
    }
  }

  // Use edge function to handle folder creation
  try {
    const { data: result, error } = await supabase.functions.invoke('create-invoice-folder', {
      body: {
        invoices: invoiceData,
        folderName: isMultipleInvoices ? 'folder' : undefined
      }
    });

    if (error) {
      console.error('Error creating invoice folder:', error);
      // Fallback: download files individually
      invoiceData.forEach((invoice, index) => {
        const blob = new Blob([new Uint8Array(invoice.pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = invoice.filename;
        document.body.appendChild(link);
        setTimeout(() => {
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, index * 200);
      });
      return;
    }

    // Handle the result from edge function
    if (result.singleFile) {
      // Single file download
      const blob = new Blob([new Uint8Array(result.singleFile.pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.singleFile.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (result.multipleFiles) {
      // Multiple files - download sequentially to simulate folder
      result.multipleFiles.files.forEach((file: any, index: number) => {
        const blob = new Blob([new Uint8Array(file.pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        document.body.appendChild(link);
        setTimeout(() => {
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, index * 300);
      });
    }
  } catch (error) {
    console.error('Error in invoice generation:', error);
    // Fallback: download files individually
    invoiceData.forEach((invoice, index) => {
      const blob = new Blob([new Uint8Array(invoice.pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = invoice.filename;
      document.body.appendChild(link);
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, index * 200);
    });
  }
};