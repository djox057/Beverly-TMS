import jsPDF from 'jspdf';

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
  companyName: string;
  driverName: string;
  mileage: number;
}

export const generateInvoicePDF = (orders: Order[]) => {
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
  Object.values(groupedOrders).forEach((group, index) => {
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
    const invoiceNumber = Math.floor(Math.random() * 9999) + 1000;
    
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
    let total = 0;
    
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
      doc.text(`$${order.freightAmount.toLocaleString()}`, 157, yPosition + 7);
      doc.text(`$${order.freightAmount.toLocaleString()}`, 177, yPosition + 7);
      
      total += order.freightAmount;
      yPosition += 12;
    });
    
    // Freight Income row
    doc.rect(135, yPosition, 40, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Freight Income', 137, yPosition + 5);
    doc.text(`$${total.toLocaleString()}`, 177, yPosition + 5);
    
    yPosition += 8;
    
    // Total row
    doc.rect(155, yPosition, 20, 8);
    doc.rect(175, yPosition, 25, 8);
    doc.text('TOTAL:', 157, yPosition + 5);
    doc.text(`$${total.toLocaleString()}`, 177, yPosition + 5);
    
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
    
    // Footer
    doc.setTextColor(0, 0, 0); // Black color
    doc.setFontSize(8);
    doc.text('Beverly Trucking Software', 105, 280, { align: 'center' });
    doc.text('Page 1 Of 1', 190, 280);
    
    // Save the PDF
    const filename = `invoice_${group.brokerName.replace(/[^a-zA-Z0-9]/g, '_')}_${currentDate.replace(/\//g, '-')}.pdf`;
    if (index === 0) {
      doc.save(filename);
    } else {
      // For multiple PDFs, we need to create separate documents
      setTimeout(() => doc.save(filename), index * 100);
    }
  });
};