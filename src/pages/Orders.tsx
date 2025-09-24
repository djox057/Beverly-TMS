import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Search, FileText, Edit, Loader2, Download } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "react-day-picker";
import * as XLSX from 'xlsx';

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  
  const { data: orders, isLoading, error } = useOrders();
  const { data: companies } = useCompanies();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>
    );
  }

  // Filter orders based on search term and filters
  const filteredOrders = orders?.filter(order => {
    const matchesSearch = order.internalLoadNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.brokerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.brokerLoadNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
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
    
    // Date filtering based on pickup date
    let matchesDateRange = true;
    if (dateRange?.from) {
      const orderPickupDate = new Date(order.pickupDate.split(' - ')[0]);
      if (dateRange.from && orderPickupDate < dateRange.from) {
        matchesDateRange = false;
      }
      if (dateRange.to && orderPickupDate > dateRange.to) {
        matchesDateRange = false;
      }
    }
    
    return matchesSearch && matchesCompany && matchesBookedBy && matchesMissingDocs && matchesDateRange;
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
      'Driver Price': order.driverPrice,
      'Driver': order.driverName,
      'Broker Name': order.brokerName,
      'Broker Load #': order.brokerLoadNumber,
      'Invoiced': order.invoiced,
      'Freight': order.freightAmount,
      'Notes': order.notes,
      'Company': order.companyName,
      'Booked By': order.bookedBy
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    XLSX.writeFile(workbook, `orders_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
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
              <DateRangePicker
                date={dateRange}
                onDateChange={setDateRange}
                placeholder="Filter by pickup date"
                className="w-72"
              />
              
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-companies">All Companies</SelectItem>
                  {uniqueCompanies.map(company => (
                    <SelectItem key={company} value={company}>{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={bookedByFilter} onValueChange={setBookedByFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Booked By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-users">All Users</SelectItem>
                  {uniqueBookedBy.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
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
                <Input
                  placeholder="Search orders..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Load #</TableHead>
                  <TableHead>Pickup Date</TableHead>
                  <TableHead>Pickup City</TableHead>
                  <TableHead>Pickup State</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Delivery City</TableHead>
                  <TableHead>Delivery State</TableHead>
                  <TableHead>Miles</TableHead>
                  <TableHead>Driver Price</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Broker Name</TableHead>
                  <TableHead>Broker Load #</TableHead>
                  <TableHead>Invoiced</TableHead>
                  <TableHead>Freight</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Booked By</TableHead>
                  <TableHead>RC</TableHead>
                  <TableHead>BOL</TableHead>
                  <TableHead>POD</TableHead>
                  <TableHead>Additional</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={22} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
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
                      <TableCell>${order.freightAmount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-xs truncate">{order.notes}</TableCell>
                      <TableCell>{order.companyName}</TableCell>
                      <TableCell>{order.bookedBy}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.rcFiles && order.rcFiles.length > 0 ? (
                            order.rcFiles.map((file: any) => (
                              <Button
                                key={file.id}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                  const { data } = supabase.storage
                                    .from('order-files')
                                    .getPublicUrl(file.file_path);
                                  window.open(data.publicUrl, '_blank');
                                }}
                              >
                                {file.file_name.length > 8 
                                  ? file.file_name.substring(0, 8) + '...' 
                                  : file.file_name}
                              </Button>
                            ))
                          ) : (
                            <Badge variant="destructive" className="text-xs">Missing</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.bolFiles && order.bolFiles.length > 0 ? (
                            order.bolFiles.map((file: any) => (
                              <Button
                                key={file.id}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                  const { data } = supabase.storage
                                    .from('order-files')
                                    .getPublicUrl(file.file_path);
                                  window.open(data.publicUrl, '_blank');
                                }}
                              >
                                {file.file_name.length > 8 
                                  ? file.file_name.substring(0, 8) + '...' 
                                  : file.file_name}
                              </Button>
                            ))
                          ) : (
                            <Badge variant="destructive" className="text-xs">Missing</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.podFiles && order.podFiles.length > 0 ? (
                            order.podFiles.map((file: any) => (
                              <Button
                                key={file.id}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                  const { data } = supabase.storage
                                    .from('order-files')
                                    .getPublicUrl(file.file_path);
                                  window.open(data.publicUrl, '_blank');
                                }}
                              >
                                {file.file_name.length > 8 
                                  ? file.file_name.substring(0, 8) + '...' 
                                  : file.file_name}
                              </Button>
                            ))
                          ) : (
                            <Badge variant="destructive" className="text-xs">Missing</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.additionalFiles && order.additionalFiles.length > 0 ? (
                            order.additionalFiles.map((file: any) => (
                              <Button
                                key={file.id}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                  const { data } = supabase.storage
                                    .from('order-files')
                                    .getPublicUrl(file.file_path);
                                  window.open(data.publicUrl, '_blank');
                                }}
                              >
                                {file.file_name.length > 8 
                                  ? file.file_name.substring(0, 8) + '...' 
                                  : file.file_name}
                              </Button>
                            ))
                          ) : (
                            '-'
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/edit-order/${order.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;