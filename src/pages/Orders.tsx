import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText, Edit, Loader2, Download } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
const getStatusBadge = (status: string) => {
  switch (status) {
    case "Delivered":
      return <Badge className="bg-success text-success-foreground">Delivered</Badge>;
    case "In Transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "Pending":
      return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};
const Orders = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all-companies");
  const [bookedByFilter, setBookedByFilter] = useState("all-users");
  const [missingDocsFilter, setMissingDocsFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const {
    data: orders,
    isLoading,
    error
  } = useOrders();
  const {
    data: companies
  } = useCompanies();
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>;
  }

  // Filter orders based on search term and filters
  const filteredOrders = orders?.filter(order => {
    const matchesSearch = order.internalLoadNumber.toLowerCase().includes(searchTerm.toLowerCase()) || order.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) || order.driverName.toLowerCase().includes(searchTerm.toLowerCase()) || order.brokerName.toLowerCase().includes(searchTerm.toLowerCase()) || order.brokerLoadNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany = !companyFilter || companyFilter === 'all-companies' || order.companyName === companyFilter;
    const matchesBookedBy = !bookedByFilter || bookedByFilter === 'all-users' || order.bookedBy === bookedByFilter;
    let matchesMissingDocs = true;
    if (missingDocsFilter !== 'all') {
      if (missingDocsFilter === 'missing-rc') {
        matchesMissingDocs = order.rcFiles?.length === 0;
      } else if (missingDocsFilter === 'missing-bol') {
        matchesMissingDocs = order.bolFiles?.length === 0;
      } else if (missingDocsFilter === 'missing-pod') {
        matchesMissingDocs = order.podFiles?.length === 0;
      }
    }

    // Date filtering based on delivery date
    let matchesDate = true;
    if (selectedDate) {
      const orderDeliveryDate = new Date(order.deliveryDate.split(' - ')[0]);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      const orderDateOnly = new Date(orderDeliveryDate.getFullYear(), orderDeliveryDate.getMonth(), orderDeliveryDate.getDate());
      matchesDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
    }
    return matchesSearch && matchesCompany && matchesBookedBy && matchesMissingDocs && matchesDate;
  }) || [];

  // Get unique companies and booked by values for filters
  const uniqueCompanies = [...new Set(orders?.map(order => order.companyName) || [])].filter(Boolean);
  const uniqueBookedBy = [...new Set(orders?.map(order => order.bookedBy) || [])].filter(Boolean);
  const exportToExcel = () => {
    if (!filteredOrders.length) return;
    const exportData = filteredOrders.map(order => ({
      'Truck #': order.truckNumber,
      'Load #': order.internalLoadNumber,
      'Pickup Date': order.pickupDate,
      'Pickup City': order.pickupCity,
      'Pickup State': order.pickupState,
      'Delivery Date': order.deliveryDate,
      'Delivery City': order.deliveryCity,
      'Delivery State': order.deliveryState,
      'Miles': order.mileage,
      'Driver Rate': order.driverPrice,
      'Driver': order.driverName,
      'Broker Name': order.brokerName,
      'Broker Load #': order.brokerLoadNumber,
      'Invoiced': order.invoiced,
      'Total Freight': order.totalFreightAmount,
      'Notes': order.notes,
      'Company': order.companyName,
      'Booked By': order.bookedBy
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    XLSX.writeFile(workbook, `orders_${new Date().toISOString().split('T')[0]}.xlsx`);
  };
  const generateInvoices = async () => {
    if (!filteredOrders.length) return;
    try {
      await generateInvoicePDF(filteredOrders);

      // Update invoiced status for all orders that were processed
      const orderIds = filteredOrders.map(order => order.id);
      const {
        error
      } = await supabase.from('orders').update({
        invoiced: true
      }).in('id', orderIds);
      if (error) {
        console.error('Error updating invoice status:', error);
      } else {
        console.log(`Successfully updated ${orderIds.length} orders as invoiced`);
        // Force refresh of orders data to show updated status
        window.location.reload();
      }
    } catch (error) {
      console.error('Error generating invoices:', error);
    }
  };
  return (
    <div className="h-full w-full">
      <div className="min-w-[1800px] space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Button variant="outline" onClick={generateInvoices} disabled={!filteredOrders.length}>
            <FileText className="mr-2 h-4 w-4" />
            INVOICE
          </Button>
          <Button onClick={() => navigate('/new-order')}>
            <FileText className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Orders</CardTitle>
            <div className="flex gap-4 items-center">
              <DatePicker date={selectedDate} onDateChange={setSelectedDate} placeholder="Filter by delivery date" className="w-72" />
              
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-companies">All Companies</SelectItem>
                  {uniqueCompanies.map(company => <SelectItem key={company} value={company}>{company}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={bookedByFilter} onValueChange={setBookedByFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Booked By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-users">All Users</SelectItem>
                  {uniqueBookedBy.map(user => <SelectItem key={user} value={user}>{user}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={missingDocsFilter} onValueChange={setMissingDocsFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Missing Docs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="missing-rc">Missing RC</SelectItem>
                  <SelectItem value="missing-bol">Missing BOL</SelectItem>
                  <SelectItem value="missing-pod">Missing POD</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Search orders..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Truck #</TableHead>
                    <TableHead className="w-20">Load #</TableHead>
                    <TableHead className="w-32">Pickup Date</TableHead>
                    <TableHead className="w-28">Pickup City</TableHead>
                    <TableHead className="w-16">Pickup State</TableHead>
                    <TableHead className="w-32">Delivery Date</TableHead>
                    <TableHead className="w-28">Delivery City</TableHead>
                    <TableHead className="w-16">Delivery State</TableHead>
                    <TableHead className="w-16">Miles</TableHead>
                    <TableHead className="w-24">Driver Rate</TableHead>
                    <TableHead className="w-32">Driver</TableHead>
                    <TableHead className="w-36">Broker Name</TableHead>
                    <TableHead className="w-28">Broker Load #</TableHead>
                    <TableHead className="w-20">Invoiced</TableHead>
                    <TableHead className="w-28">Freight Amount</TableHead>
                    <TableHead className="w-40">Notes</TableHead>
                    <TableHead className="w-28">Company</TableHead>
                    <TableHead className="w-24">Booked By</TableHead>
                    <TableHead className="w-16">RC</TableHead>
                    <TableHead className="w-16">BOL</TableHead>
                    <TableHead className="w-16">POD</TableHead>
                    <TableHead className="w-20">Additional</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? <TableRow>
                    <TableCell colSpan={23} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow> : filteredOrders.map(order => <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.truckNumber}</TableCell>
                      <TableCell>{order.internalLoadNumber}</TableCell>
                      <TableCell>{order.pickupDate}</TableCell>
                      <TableCell>{order.pickupCity}</TableCell>
                      <TableCell>{order.pickupState}</TableCell>
                      <TableCell>{order.deliveryDate}</TableCell>
                      <TableCell>{order.deliveryCity}</TableCell>
                      <TableCell>{order.deliveryState}</TableCell>
                      <TableCell>{order.mileage.toLocaleString()}</TableCell>
                      <TableCell>${order.driverPrice.toLocaleString()}</TableCell>
                      <TableCell>{order.driverName}</TableCell>
                      <TableCell>{order.brokerName}</TableCell>
                      <TableCell>{order.brokerLoadNumber}</TableCell>
                      <TableCell>{order.invoiced}</TableCell>
                      <TableCell>${order.totalFreightAmount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-xs truncate">{order.notes}</TableCell>
                      <TableCell>{order.companyName}</TableCell>
                      <TableCell>{order.bookedBy}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.rcFiles && order.rcFiles.length > 0 ? order.rcFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                        const {
                          data
                        } = supabase.storage.from('order-files').getPublicUrl(file.file_path);
                        window.open(data.publicUrl, '_blank');
                      }}>
                                {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                              </Button>) : <Badge variant="destructive" className="text-xs">Missing</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.bolFiles && order.bolFiles.length > 0 ? order.bolFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                        const {
                          data
                        } = supabase.storage.from('order-files').getPublicUrl(file.file_path);
                        window.open(data.publicUrl, '_blank');
                      }}>
                                {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                              </Button>) : <Badge variant="destructive" className="text-xs">Missing</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.podFiles && order.podFiles.length > 0 ? order.podFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                        const {
                          data
                        } = supabase.storage.from('order-files').getPublicUrl(file.file_path);
                        window.open(data.publicUrl, '_blank');
                      }}>
                                {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                              </Button>) : <Badge variant="destructive" className="text-xs">Missing</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.additionalFiles && order.additionalFiles.length > 0 ? order.additionalFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                        const {
                          data
                        } = supabase.storage.from('order-files').getPublicUrl(file.file_path);
                        window.open(data.publicUrl, '_blank');
                      }}>
                                {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                              </Button>) : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/edit-order/${order.id}`)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};
export default Orders;