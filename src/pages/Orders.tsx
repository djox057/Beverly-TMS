import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText, Edit, Loader2, Download, Lock, LockOpen, XCircle } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { z } from "zod";
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
  const { hasRole, getPrimaryRole, profile } = useAuthContext();
  const primaryRole = getPrimaryRole();
  
  // Debug navigation function
  const navigateToEditOrder = (orderId: string) => {
    console.log('=== NAVIGATION DEBUG ===');
    console.log('Order ID to navigate to:', orderId);
    console.log('Order ID type:', typeof orderId);
    console.log('Current location:', window.location.href);
    
    if (!orderId) {
      console.error('Order ID is missing!');
      return;
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      console.error('Invalid order ID format:', orderId);
      return;
    }
    
    const targetUrl = `/edit-order/${orderId}`;
    console.log('Target URL:', targetUrl);
    
    // Try navigation with fallback to window.location
    try {
      console.log('Attempting React Router navigation...');
      navigate(targetUrl);
      console.log('React Router navigation completed');
    } catch (error) {
      console.error('Navigation failed, using window.location:', error);
      window.location.href = targetUrl;
    }
    console.log('=== END NAVIGATION DEBUG ===');
  };
  // Auto-set bookedBy filter for dispatchers
  const isDispatcher = primaryRole === 'dispatch';
  
  // Check if user has only dispatch role
  const isDispatchOnly = hasRole('dispatch') && 
    !hasRole('admin') && 
    !hasRole('manager') && 
    !hasRole('accounting') && 
    !hasRole('supervisor');
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all-companies");
  const [truckCompanyFilter, setTruckCompanyFilter] = useState("all-truck-companies");
  const [bookedByFilter, setBookedByFilter] = useState("all-users");
  const [missingDocsFilter, setMissingDocsFilter] = useState("all");
  const [truckFilter, setTruckFilter] = useState("all-trucks");
  const [driverFilter, setDriverFilter] = useState("all-drivers");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState("");
  const [cancelFormData, setCancelFormData] = useState({
    tonu: "",
    driverRate: "",
    dhMiles: "",
    notes: ""
  });
  
  // Set bookedBy filter for dispatchers when profile loads
  useEffect(() => {
    if (isDispatcher && profile?.full_name) {
      setBookedByFilter(profile.full_name);
    }
  }, [isDispatcher, profile?.full_name]);
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
    const matchesTruckCompany = !truckCompanyFilter || truckCompanyFilter === 'all-truck-companies' || order.truckCompanyName === truckCompanyFilter;
    const matchesBookedBy = !bookedByFilter || bookedByFilter === 'all-users' || order.bookedBy === bookedByFilter;
    const matchesTruck = !truckFilter || truckFilter === 'all-trucks' || order.truckNumber === truckFilter;
    const matchesDriver = !driverFilter || driverFilter === 'all-drivers' || order.driverName === driverFilter;
    
    let matchesMissingDocs = true;
    if (missingDocsFilter !== 'all') {
      if (missingDocsFilter === 'missing-rc') {
        matchesMissingDocs = order.rcFiles?.length === 0;
      } else if (missingDocsFilter === 'missing-bol') {
        matchesMissingDocs = order.bolFiles?.length === 0;
      } else if (missingDocsFilter === 'missing-pod') {
        matchesMissingDocs = order.podFiles?.length === 0;
      } else if (missingDocsFilter === 'complete') {
        matchesMissingDocs = (order.rcFiles?.length || 0) > 0 && (order.podFiles?.length || 0) > 0;
      }
    }

    // Date filtering based on delivery date
    let matchesDate = true;
    if (dateRange?.from) {
      const orderDeliveryDate = new Date(order.deliveryDate.split(' - ')[0]);
      const orderDateOnly = new Date(orderDeliveryDate.getFullYear(), orderDeliveryDate.getMonth(), orderDeliveryDate.getDate());
      
      if (dateRange.to) {
        // Date range filtering
        const fromDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
        const toDateOnly = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
        matchesDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
      } else {
        // Single date filtering
        const selectedDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
        matchesDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
      }
    }
    return matchesSearch && matchesCompany && matchesTruckCompany && matchesBookedBy && matchesTruck && matchesDriver && matchesMissingDocs && matchesDate;
  }) || [];

  // Get unique companies and booked by values for filters
  const uniqueCompanies = [...new Set(orders?.map(order => order.companyName) || [])].filter(Boolean);
  const uniqueTruckCompanies = [...new Set(orders?.map(order => order.truckCompanyName) || [])].filter(Boolean);
  const uniqueBookedBy = [...new Set(orders?.map(order => order.bookedBy) || [])].filter(Boolean);
  const uniqueTrucks = [...new Set(orders?.map(order => order.truckNumber) || [])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const uniqueDrivers = [...new Set(orders?.map(order => order.driverName) || [])].filter(Boolean).sort();
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
  const toggleOrderLock = async (orderId: string, currentLockStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ locked: !currentLockStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      toast.success(`Order ${!currentLockStatus ? 'locked' : 'unlocked'} successfully`);
    } catch (error) {
      console.error('Error toggling order lock:', error);
      toast.error("Failed to update order lock status");
    }
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

  const cancelSchema = z.object({
    tonu: z.string().min(1, "TONU is required").transform(val => parseFloat(val)),
    driverRate: z.string().min(1, "Driver rate is required").transform(val => parseFloat(val)),
    dhMiles: z.string().min(1, "DH miles is required").transform(val => parseInt(val)),
    notes: z.string().min(1, "Notes are required")
  });

  const openCancelDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
    setCancelDialogOpen(true);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrderId) return;

    try {
      // Validate inputs
      const validated = cancelSchema.parse(cancelFormData);

      // Update order with cancel values
      const { error } = await supabase
        .from('orders')
        .update({
          tonu: validated.tonu,
          driver_price: validated.driverRate,
          dh_miles: validated.dhMiles,
          notes: validated.notes,
          freight_amount: 0,
          loaded_miles: 0,
          locked: true,
          canceled: true
        })
        .eq('id', selectedOrderId);

      if (error) throw error;

      toast.success("Order cancelled and locked successfully");
      setCancelDialogOpen(false);
      setSelectedOrderId(null);
      setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error('Error cancelling order:', error);
        toast.error("Failed to cancel order");
      }
    }
  };
  return (
    <div className="h-full w-full">
      <div className="space-y-6 p-6 max-w-none">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Orders</h1>
        <div className="flex gap-2">
          {(primaryRole === 'admin' || primaryRole === 'accounting' || primaryRole === 'manager') && (
            <>
              <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length}>
                <Download className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>
              <Button variant="outline" onClick={generateInvoices} disabled={!filteredOrders.length}>
                <FileText className="mr-2 h-4 w-4" />
                INVOICE
              </Button>
            </>
          )}
          <Button onClick={() => navigate('/new-order')}>
            <FileText className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      <Card className="w-fit min-w-full">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>All Orders</CardTitle>
            
            <div className="flex flex-wrap gap-4 items-center">
              <DateRangePicker 
                date={dateRange} 
                onDateChange={setDateRange} 
                placeholder="Filter by delivery date" 
                className="w-72" 
              />
              
              <Select value={truckFilter} onValueChange={setTruckFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Truck" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-trucks">All Trucks</SelectItem>
                  {uniqueTrucks.map(truck => <SelectItem key={truck} value={truck}>{truck}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-companies">All Companies</SelectItem>
                  {uniqueCompanies.map(company => <SelectItem key={company} value={company}>{company}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={truckCompanyFilter} onValueChange={setTruckCompanyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Truck Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-truck-companies">All Truck Companies</SelectItem>
                  {uniqueTruckCompanies.map(company => <SelectItem key={company} value={company}>{company}</SelectItem>)}
                </SelectContent>
              </Select>
              
              {primaryRole !== 'dispatch' && (
                <Select value={bookedByFilter} onValueChange={setBookedByFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by Booked By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-users">All Users</SelectItem>
                    {uniqueBookedBy.map(user => <SelectItem key={user} value={user}>{user}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-drivers">All Drivers</SelectItem>
                  {uniqueDrivers.map(driver => <SelectItem key={driver} value={driver}>{driver}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={missingDocsFilter} onValueChange={setMissingDocsFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Missing Docs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="complete">Complete (RC + POD)</SelectItem>
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
                    <TableHead className="w-20">Notes</TableHead>
                    <TableHead className="w-28">Freight Amount</TableHead>
                    <TableHead className="w-28">Company</TableHead>
                    <TableHead className="w-24">Booked By</TableHead>
                    <TableHead className="w-16">RC</TableHead>
                    <TableHead className="w-16">POD</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? <TableRow>
                      <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                        No orders found
                      </TableCell>
                    </TableRow> : filteredOrders.map(order => {
                      // Check if order has extra charges
                      const hasExtraCharges = (order.detention && order.detention > 0) || 
                                             (order.layover && order.layover > 0) || 
                                             (order.extraStop && order.extraStop > 0) || 
                                             (order.lumper && order.lumper > 0) || 
                                             (order.lateFee && order.lateFee > 0);
                      
                      
                      return <TableRow key={order.id} className={`h-16 ${
                        order.canceled 
                          ? 'bg-destructive/10 hover:bg-destructive/15' 
                          : hasExtraCharges
                          ? 'bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)] hover:bg-[hsl(45_93%_85%)] dark:hover:bg-[hsl(45_93%_35%)]'
                          : order.tonu > 0
                          ? 'bg-[hsl(0_84%_95%)] dark:bg-[hsl(0_62%_20%)]' 
                          : ''
                      }`}>
                        <TableCell className="font-medium">{order.truckNumber}</TableCell>
                        <TableCell>{order.internalLoadNumber}</TableCell>
                        <TableCell className="p-0"><div className="h-full p-4">{order.pickupDate}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4 line-clamp-2">{order.pickupCity}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4">{order.pickupState}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4">{order.deliveryDate}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4 line-clamp-2">{order.deliveryCity}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4">{order.deliveryState}</div></TableCell>
                        <TableCell>{order.mileage.toLocaleString()}</TableCell>
                        <TableCell>${order.driverPrice.toLocaleString()}</TableCell>
                        <TableCell>{order.driverName}</TableCell>
                        <TableCell><div className="line-clamp-2">{order.brokerName}</div></TableCell>
                        <TableCell>{order.brokerLoadNumber}</TableCell>
                        <TableCell>{order.invoiced}</TableCell>
                        <TableCell>
                          {order.notes && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-auto p-1 text-xs font-normal hover:underline"
                              onClick={() => {
                                setSelectedNotes(order.notes);
                                setNotesDialogOpen(true);
                              }}
                            >
                              {order.notes.length > 12 ? order.notes.substring(0, 12) + '...' : order.notes}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>${order.totalFreightAmount.toLocaleString()}</TableCell>
                        <TableCell>{order.companyName}</TableCell>
                        <TableCell><div className="line-clamp-2">{order.bookedBy}</div></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {order.rcFiles && order.rcFiles.length > 0 ? order.rcFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from('order-files')
                            .createSignedUrl(file.file_path, 3600);
                          
                          if (error) {
                            toast.error(`Failed to load file: ${error.message}`);
                            return;
                          }
                          
                          const signedUrl = data?.signedUrl;
                          if (signedUrl) {
                            try {
                              const response = await fetch(signedUrl);
                              if (!response.ok) throw new Error('Failed to fetch file');
                              
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              
                              const newWindow = window.open(blobUrl, '_blank');
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                              
                              if (!newWindow) {
                                toast.error("Please allow popups for this site");
                              }
                            } catch (err) {
                              console.error('Error opening file:', err);
                              toast.error("Failed to open file");
                            }
                          }
                        }}>
                                  {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                                </Button>) : <Badge variant="destructive" className="text-xs">Missing</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {order.podFiles && order.podFiles.length > 0 ? order.podFiles.map((file: any) => <Button key={file.id} variant="outline" size="sm" className="text-xs" onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from('order-files')
                            .createSignedUrl(file.file_path, 3600);
                          
                          if (error) {
                            toast.error(`Failed to load file: ${error.message}`);
                            return;
                          }
                          
                          const signedUrl = data?.signedUrl;
                          if (signedUrl) {
                            try {
                              const response = await fetch(signedUrl);
                              if (!response.ok) throw new Error('Failed to fetch file');
                              
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              
                              const newWindow = window.open(blobUrl, '_blank');
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                              
                              if (!newWindow) {
                                toast.error("Please allow popups for this site");
                              }
                            } catch (err) {
                              console.error('Error opening file:', err);
                              toast.error("Failed to open file");
                            }
                          }
                        }}>
                                  {file.file_name.length > 8 ? file.file_name.substring(0, 8) + '...' : file.file_name}
                                </Button>) : <Badge variant="destructive" className="text-xs">Missing</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!order.locked && (
                              <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {(hasRole('manager') || hasRole('admin') || hasRole('accounting')) && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleOrderLock(order.id, order.locked)}
                                  title={order.locked ? 'Unlock order' : 'Lock order'}
                                >
                                  {order.locked ? (
                                    <Lock className="h-4 w-4 text-destructive" />
                                  ) : (
                                    <LockOpen className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                                {!order.locked && (
                                  <Button variant="outline" size="sm" onClick={() => openCancelDialog(order.id)} title="Cancel order">
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </>
                            )}
                            {isDispatchOnly && !order.locked && (
                              <Button variant="outline" size="sm" onClick={() => openCancelDialog(order.id)} title="Cancel order">
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    })}
                </TableBody>
              </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Enter cancellation details. This will set freight amount and loaded miles to 0, and lock the order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tonu">TONU Amount ($)</Label>
              <Input id="tonu" type="number" step="0.01" placeholder="0.00" value={cancelFormData.tonu} onChange={(e) => setCancelFormData({ ...cancelFormData, tonu: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driverRate">Driver Rate ($)</Label>
              <Input id="driverRate" type="number" step="0.01" placeholder="0.00" value={cancelFormData.driverRate} onChange={(e) => setCancelFormData({ ...cancelFormData, driverRate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dhMiles">DH Miles</Label>
              <Input id="dhMiles" type="number" placeholder="0" value={cancelFormData.dhMiles} onChange={(e) => setCancelFormData({ ...cancelFormData, dhMiles: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Cancellation Notes</Label>
              <Input id="notes" placeholder="Enter reason for cancellation" value={cancelFormData.notes} onChange={(e) => setCancelFormData({ ...cancelFormData, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleCancelOrder}>Confirm Cancellation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Notes</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm whitespace-pre-wrap">{selectedNotes}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNotesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};
export default Orders;