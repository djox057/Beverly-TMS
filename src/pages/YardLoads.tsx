import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders } from "@/hooks/useOrders";
import { useYardLoadsTable, YardLoad } from "@/hooks/useYardLoadsTable";
import { useCompanies } from "@/hooks/useCompanies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Combobox } from "@/components/ui/combobox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Calendar, FileText, Lock, Unlock, Plus, Download, Edit, XCircle, Undo2, LockOpen } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { useAuthContext } from "@/contexts/AuthContext";
import { DateRange } from "react-day-picker";
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";

const ITEMS_PER_PAGE = 50;

const getStatusBadge = (status: string) => {
  const statusConfig = {
    pending: { label: "Pending", variant: "secondary" as const },
    in_transit: { label: "In Transit", variant: "default" as const },
    delivered: { label: "Delivered", variant: "outline" as const },
    cancelled: { label: "Cancelled", variant: "destructive" as const },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || { 
    label: status, 
    variant: "secondary" as const 
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
};

export default function YardLoads() {
  const navigate = useNavigate();
  const { hasRole } = useAuthContext();
  
  const isYardRole = hasRole('yard');
  
  // Check if user has required roles
  useEffect(() => {
    if (!hasRole('manager') && !hasRole('admin') && !hasRole('yard')) {
      navigate('/');
    }
  }, [hasRole, navigate]);
  
  const canCancelOrders = hasRole('dispatch') || hasRole('afterhours');
  const canEditOrders = !isYardRole; // Yard role cannot edit
  const canCreateOrders = !isYardRole; // Yard role cannot create
  
  // Fetch data - yard role uses dedicated table, others use orders
  const { data: ordersData = [], isLoading: ordersLoading } = useOrders();
  const { data: yardLoadsData = [], isLoading: yardLoadsLoading } = useYardLoadsTable();
  const { data: companies = [] } = useCompanies();
  
  // Transform yard_loads data to match orders format for display
  const transformYardLoads = (yardLoads: YardLoad[]) => {
    return yardLoads.map(load => ({
      id: load.id,
      orderId: load.order_id,
      internalLoadNumber: load.internal_load_number,
      trailerNumber: load.trailer_number,
      deliveryDate: load.delivery_date,
      deliveryCity: load.delivery_city,
      deliveryState: load.delivery_state,
      truckNumber: load.truck_number,
      driverName: load.driver_name,
      brokerName: load.broker_name,
      notes: load.notes,
      // Default values for fields not in yard_loads
      pickupCity: '',
      pickupState: '',
      pickupDate: '',
      mileage: 0,
      driverPrice: 0,
      totalDriverPay: 0,
      freightAmount: 0,
      totalFreightAmount: 0,
      brokerLoadNumber: '',
      companyName: '',
      bookedBy: '',
      status: 'pending',
      locked: false,
      canceled: false,
      isRecovery: false,
      lateFeeDriver: 0,
      noTrackingFeeDriver: 0,
      wrongAddressFeeDriver: 0,
      detentionDriver: 0,
      layoverDriver: 0,
      escortFee: 0,
      lumper: 0,
      dateChangeNotes: '',
      truckId: null,
      driver1Id: null,
      truckCompanyName: '',
    }));
  };
  
  // Use appropriate data source based on role
  const orders = isYardRole ? transformYardLoads(yardLoadsData) : ordersData;
  const isLoading = isYardRole ? yardLoadsLoading : ordersLoading;

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedTruck, setSelectedTruck] = useState<string>("");
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedNotes, setSelectedNotes] = useState<string>("");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

  // Get unique values for filters
  const trucks = Array.from(new Set(orders.map(o => o.truckNumber).filter(Boolean))).sort();
  const drivers = Array.from(new Set(orders.map(o => o.driverName).filter(Boolean))).sort();
  const brokers = Array.from(new Set(orders.map(o => o.brokerName).filter(Boolean))).sort();

  // Filter orders - only show loads with no driver AND no truck (skip for yard role since they use dedicated table)
  const filteredOrders = orders.filter(order => {
    // For yard role, data is already filtered from yard_loads table
    // For other roles, filter for yard loads (no driver1_id AND no truck_id)
    if (!isYardRole && (order.driver1Id || order.truckId)) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchableFields = [
        order.internalLoadNumber,
        order.brokerLoadNumber,
        order.truckNumber,
        order.driverName,
        order.brokerName,
        `${order.pickupCity}, ${order.pickupState}`,
        `${order.deliveryCity}, ${order.deliveryState}`,
      ].filter(Boolean);
      
      if (!searchableFields.some(field => field?.toLowerCase().includes(query))) {
        return false;
      }
    }

    // Company filter
    if (selectedCompany && order.truckCompanyName !== selectedCompany) {
      return false;
    }

    // Truck filter
    if (selectedTruck && order.truckNumber !== selectedTruck) {
      return false;
    }

    // Driver filter
    if (selectedDriver && order.driverName !== selectedDriver) {
      return false;
    }

    // Broker filter
    if (selectedBroker && order.brokerName !== selectedBroker) {
      return false;
    }

    // Status filter
    if (selectedStatus && order.status !== selectedStatus) {
      return false;
    }

    // Date range filter
    if (dateRange.from) {
      const orderDate = new Date(order.pickupDate);
      if (orderDate < dateRange.from) {
        return false;
      }
    }
    if (dateRange.to) {
      const orderDate = new Date(order.pickupDate);
      if (orderDate > dateRange.to) {
        return false;
      }
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCompany, selectedTruck, selectedDriver, selectedBroker, selectedStatus, dateRange]);

  const navigateToEditOrder = (orderId: string) => {
    // Set flag to return to yard loads
    localStorage.setItem('returnToYardLoads', 'true');
    navigate(`/edit-order/${orderId}`);
  };

  const exportToExcel = () => {
    const exportData = filteredOrders.map(order => ({
      'Load #': order.internalLoadNumber,
      'Broker Load #': order.brokerLoadNumber || '',
      'Status': order.status,
      'Company': order.companyName || '',
      'Truck': order.truckNumber || '',
      'Driver': order.driverName || '',
      'Broker': order.brokerName || '',
      'Pickup': `${order.pickupCity}, ${order.pickupState}`,
      'Pickup Date': formatDateNoTimezone(order.pickupDate),
      'Delivery': `${order.deliveryCity}, ${order.deliveryState}`,
      'Delivery Date': formatDateNoTimezone(order.deliveryDate),
      'Miles': order.mileage || 0,
      'Driver Pay': order.driverPrice || 0,
      'Broker Rate': order.freightAmount || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Yard Loads");
    XLSX.writeFile(wb, `yard-loads-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast.success("Export Successful", {
      description: `Exported ${filteredOrders.length} loads to Excel`,
    });
  };

  const toggleOrderLock = async (orderId: string, currentLockState: boolean) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ locked: !currentLockState })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(currentLockState ? "Load Unlocked" : "Load Locked");
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast.error("Failed to toggle lock status");
    }
  };

  const openCancelDialog = (orderId: string) => {
    setOrderToCancel(orderId);
    setCancelDialogOpen(true);
  };

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({ canceled: true })
        .eq('id', orderToCancel);

      if (error) throw error;

      toast.success("Load Canceled");
      setCancelDialogOpen(false);
      setOrderToCancel(null);
    } catch (error) {
      console.error('Error canceling order:', error);
      toast.error("Failed to cancel load");
    }
  };

  const handleRevertCancellation = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ canceled: false })
        .eq('id', orderId);

      if (error) throw error;

      toast.success("Cancellation Reverted");
    } catch (error) {
      console.error('Error reverting cancellation:', error);
      toast.error("Failed to revert cancellation");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Loads at the Yard</h1>
        <div className="flex gap-2">
          {!isYardRole && (
            <Button onClick={exportToExcel} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          )}
          {canCreateOrders && (
            <Button onClick={() => navigate('/new-order')}>
              <Plus className="mr-2 h-4 w-4" />
              New Load
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Search loads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
            
            <DateRangePicker
              date={dateRange}
              onDateChange={setDateRange}
            />

            <Combobox
              options={companies.map(c => ({ value: c.name, label: c.name }))}
              value={selectedCompany}
              onValueChange={setSelectedCompany}
              placeholder="All Companies"
              searchPlaceholder="Search companies..."
            />

            <Combobox
              options={[
                { value: "pending", label: "Pending" },
                { value: "in_transit", label: "In Transit" },
                { value: "delivered", label: "Delivered" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              value={selectedStatus}
              onValueChange={setSelectedStatus}
              placeholder="All Statuses"
              searchPlaceholder="Search status..."
            />

            <Combobox
              options={trucks.map(t => ({ value: t, label: t }))}
              value={selectedTruck}
              onValueChange={setSelectedTruck}
              placeholder="All Trucks"
              searchPlaceholder="Search trucks..."
            />

            <Combobox
              options={drivers.map(d => ({ value: d, label: d }))}
              value={selectedDriver}
              onValueChange={setSelectedDriver}
              placeholder="All Drivers"
              searchPlaceholder="Search drivers..."
            />

            <Combobox
              options={brokers.map(b => ({ value: b, label: b }))}
              value={selectedBroker}
              onValueChange={setSelectedBroker}
              placeholder="All Brokers"
              searchPlaceholder="Search brokers..."
            />
          </div>

          {/* Table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Trailer #</TableHead>
                  <TableHead className="w-20">Load #</TableHead>
                  <TableHead className="w-32">Delivery Date</TableHead>
                  <TableHead className="w-40">Delivery City</TableHead>
                  <TableHead className="w-16">Miles</TableHead>
                  <TableHead className="w-24">Driver Pay</TableHead>
                  <TableHead className="w-36">Broker Name</TableHead>
                  <TableHead className="w-28">Broker Load #</TableHead>
                  <TableHead className="w-28">Freight Amount</TableHead>
                  <TableHead className="w-28">Company</TableHead>
                  <TableHead className="w-24">Booked By</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      No loads found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order: any) => {
                    const isRecovery = order.isRecovery;
                    const hasRedFees = (order.lateFeeDriver > 0) || (order.noTrackingFeeDriver > 0) || (order.wrongAddressFeeDriver > 0);
                    const hasGreenFees = (order.detentionDriver > 0) || (order.layoverDriver > 0);
                    const hasYellowFees = (order.escortFee > 0) || (order.lumper > 0);
                    const hasOrangeCondition = order.canceled || (order.dateChangeNotes && order.dateChangeNotes.trim() !== '');
                    
                    const rowClassName = isRecovery
                      ? 'bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_85%)] dark:hover:bg-[hsl(270_50%_30%)]'
                      : hasRedFees 
                      ? 'bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_85%)] dark:hover:bg-[hsl(0_62%_30%)]'
                      : hasGreenFees
                      ? 'bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_85%)] dark:hover:bg-[hsl(120_40%_30%)]'
                      : hasYellowFees
                      ? 'bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)] hover:bg-[hsl(45_93%_85%)] dark:hover:bg-[hsl(45_93%_35%)]'
                      : hasOrangeCondition
                      ? 'bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_85%)] dark:hover:bg-[hsl(25_75%_35%)]'
                      : '';
                    
                    return (
                      <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                        <TableCell className="font-medium">{order.trailerNumber}</TableCell>
                        <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                        <TableCell className="p-0"><div className="h-full p-4">{formatDateNoTimezone(order.deliveryDate)}</div></TableCell>
                        <TableCell className="p-0"><div className="h-full p-4 line-clamp-2">
                          {order.deliveryCity}{order.deliveryCity && order.deliveryState ? ', ' : ''}{order.deliveryState}
                        </div></TableCell>
                        <TableCell>{order.mileage?.toLocaleString() || '0'}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(order.totalDriverPay)}
                          </div>
                        </TableCell>
                        <TableCell><div className="line-clamp-2">{order.brokerName}</div></TableCell>
                        <TableCell>{order.brokerLoadNumber}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(order.totalFreightAmount)}
                          </div>
                        </TableCell>
                        <TableCell>{order.companyName}</TableCell>
                        <TableCell><div className="line-clamp-2">{order.bookedBy}</div></TableCell>
                        <TableCell>
                          {canEditOrders && !order.locked && (
                            <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          <div className="text-sm text-muted-foreground">
            Showing {paginatedOrders.length} of {filteredOrders.length} loads
          </div>
        </div>
      </Card>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Notes</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap">{selectedNotes}</div>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Load</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this load? This action can be reverted later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelOrder}>Confirm Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
