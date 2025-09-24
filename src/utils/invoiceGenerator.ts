import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Helper function to convert PDF to image
const convertPdfToImage = async (pdfData: Uint8Array): Promise<string | null> => {
  try {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const page = await pdf.getPage(1); // Get first page
    
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) return null;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas
    }).promise;
    
    return canvas.toDataURL('image/png').split(',')[1]; // Return base64 without prefix
  } catch (error) {
    console.error('Error converting PDF to image:', error);
    return null;
  }
};

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

// Helper function to load file as array buffer for PDFs
const loadFileAsArrayBuffer = async (filePath: string): Promise<Uint8Array | null> => {
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
        const arrayBuffer = reader.result as ArrayBuffer;
        resolve(new Uint8Array(arrayBuffer));
      };
      reader.readAsArrayBuffer(data);
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

  // Generate PDF for each broker/company combination
  for (const [index, group] of Object.values(groupedOrders).entries()) {
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
    // Note: Broker address would need to be added to data model
    
    // Invoice details table (right side)
    const currentDate = new Date().toLocaleDateString();
    const invoiceNumber = group.orders[0]?.internalLoadNumber || Math.floor(Math.random() * 9999) + 1000;
    
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
      
      // Split origin-destination into two lines
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
    
    // Freight Income row
    doc.rect(135, yPosition, 40, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Freight Income', 137, yPosition + 5);
    doc.text(`$${freightTotal.toLocaleString()}`, 177, yPosition + 5);
    
    yPosition += 8;
    
    // Additional fees (if any exist)
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
    
    // Calculate final total from totalFreightAmount
    const finalTotal = group.orders.reduce((sum, order) => sum + order.totalFreightAmount, 0);
    
    // Total row
    doc.rect(155, yPosition, 20, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.text('TOTAL:', 157, yPosition + 5);
    doc.text(`$${finalTotal.toLocaleString()}`, 177, yPosition + 5);
    
    // Notice of Assignment section
    yPosition += 30;
    doc.setTextColor(255, 0, 0); // Red color
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
    
    // Get all RC and POD files for this group
    const allRcFiles = group.orders.flatMap(order => order.rcFiles || []);
    const allPodFiles = group.orders.flatMap(order => order.podFiles || []);
    const totalPages = 1 + allRcFiles.length + allPodFiles.length;
    
    // Update footer with correct page count
    doc.setTextColor(0, 0, 0); // Black color
    doc.setFontSize(8);
    doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
    doc.text(`Page 1 Of ${totalPages}`, 190, 280);
    
    // Add RC file pages
    let currentPage = 1;
    for (const file of allRcFiles) {
      doc.addPage();
      currentPage++;
      
      // Add RC file header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('RATE CONFIRMATION', 105, 30, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`File: ${file.file_name}`, 20, 50);
      
      // Load and display file content
      if (file.content_type.startsWith('image/')) {
        const fileData = await loadFileAsBase64(file.file_path);
        if (fileData) {
          try {
            // Add image to PDF
            const imgFormat = file.content_type.includes('jpeg') || file.content_type.includes('jpg') ? 'JPEG' : 'PNG';
            doc.addImage(`data:${file.content_type};base64,${fileData}`, imgFormat, 20, 70, 170, 180);
          } catch (error) {
            console.error('Error adding image:', error);
            doc.text('Error loading image file', 20, 70);
          }
        } else {
          doc.text('Error loading image file', 20, 70);
        }
      } else if (file.content_type === 'application/pdf') {
        // Convert PDF to image and display
        const pdfData = await loadFileAsArrayBuffer(file.file_path);
        if (pdfData) {
          const imageData = await convertPdfToImage(pdfData);
          if (imageData) {
            try {
              doc.addImage(`data:image/png;base64,${imageData}`, 'PNG', 20, 70, 170, 180);
            } catch (error) {
              console.error('Error adding PDF as image:', error);
              doc.text('Error converting PDF to image', 20, 70);
            }
          } else {
            doc.text('Error converting PDF to image', 20, 70);
          }
        } else {
          doc.text('Error loading PDF file', 20, 70);
        }
      } else {
        doc.text(`File type: ${file.content_type}`, 20, 70);
        doc.text('File preview not available for this format', 20, 85);
      }
      
      // Footer for RC page
      doc.setFontSize(8);
      doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
      doc.text(`Page ${currentPage} Of ${totalPages}`, 190, 280);
    }
    
    // Add POD file pages
    for (const file of allPodFiles) {
      doc.addPage();
      currentPage++;
      
      // Add POD file header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('PROOF OF DELIVERY', 105, 30, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`File: ${file.file_name}`, 20, 50);
      
      // Load and display file content
      if (file.content_type.startsWith('image/')) {
        const fileData = await loadFileAsBase64(file.file_path);
        if (fileData) {
          try {
            // Add image to PDF
            const imgFormat = file.content_type.includes('jpeg') || file.content_type.includes('jpg') ? 'JPEG' : 'PNG';
            doc.addImage(`data:${file.content_type};base64,${fileData}`, imgFormat, 20, 70, 170, 180);
          } catch (error) {
            console.error('Error adding image:', error);
            doc.text('Error loading image file', 20, 70);
          }
        } else {
          doc.text('Error loading image file', 20, 70);
        }
      } else if (file.content_type === 'application/pdf') {
        // Convert PDF to image and display
        const pdfData = await loadFileAsArrayBuffer(file.file_path);
        if (pdfData) {
          const imageData = await convertPdfToImage(pdfData);
          if (imageData) {
            try {
              doc.addImage(`data:image/png;base64,${imageData}`, 'PNG', 20, 70, 170, 180);
            } catch (error) {
              console.error('Error adding PDF as image:', error);
              doc.text('Error converting PDF to image', 20, 70);
            }
          } else {
            doc.text('Error converting PDF to image', 20, 70);
          }
        } else {
          doc.text('Error loading PDF file', 20, 70);
        }
      } else {
        doc.text(`File type: ${file.content_type}`, 20, 70);
        doc.text('File preview not available for this format', 20, 85);
      }
      
      // Footer for POD page
      doc.setFontSize(8);
      doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
      doc.text(`Page ${currentPage} Of ${totalPages}`, 190, 280);
    }
    
    // Save the PDF
    const filename = `invoice_${group.brokerName.replace(/[^a-zA-Z0-9]/g, '_')}_${currentDate.replace(/\//g, '-')}.pdf`;
    if (index === 0) {
      doc.save(filename);
    } else {
      // For multiple PDFs, we need to create separate documents
      setTimeout(() => doc.save(filename), index * 100);
    }
  }
};