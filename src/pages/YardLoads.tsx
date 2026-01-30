import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useYardLoadsFromOrders, YardLoadOrder } from "@/hooks/useYardLoadsFromOrders";
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
import { Calendar, FileText, Lock, Unlock, Plus, Download, Edit, XCircle, Undo2, LockOpen, UserPlus } from "lucide-react";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { useAuthContext } from "@/contexts/AuthContext";
import { DateRange } from "react-day-picker";
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";
import { AssignTransferDriverDialog, TransferDriverData } from "@/components/AssignTransferDriverDialog";
import { useQueryClient } from "@tanstack/react-query";

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
    if (!hasRole('manager') && !hasRole('admin') && !hasRole('yard') && !hasRole('afterhours')) {
      navigate('/');
    }
  }, [hasRole, navigate]);
  
  const canCancelOrders = hasRole('dispatch') || hasRole('afterhours');
  const canEditOrders = !isYardRole; // Yard role cannot edit
  const canCreateOrders = !isYardRole; // Yard role cannot create
  
  // Fetch yard loads directly from orders table (where driver1_id IS NULL and truck_id IS NULL)
  const { data: yardLoadsData = [], isLoading } = useYardLoadsFromOrders();
  const { data: companies = [] } = useCompanies();

  // Use yard loads data directly (already filtered by driver1_id IS NULL and truck_id IS NULL)
  const orders = yardLoadsData;

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
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedOrderForTransfer, setSelectedOrderForTransfer] = useState<YardLoadOrder | null>(null);
  const queryClient = useQueryClient();

  // Get unique values for filters
  const trucks = Array.from(new Set(orders.map(o => o.truckNumber).filter(Boolean))).sort() as string[];
  const drivers = Array.from(new Set(orders.map(o => o.driverName).filter(Boolean))).sort() as string[];
  const brokers = Array.from(new Set(orders.map(o => o.brokerName).filter(Boolean))).sort() as string[];


  // Filter orders (all are already yard loads from the query)
  const filteredOrders = orders.filter(order => {

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchableFields = [
        String(order.internalLoadNumber || ''),
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
    if (selectedCompany && order.companyName !== selectedCompany) {
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
      'Load #': formatInternalLoadNumber(order.internalLoadNumber, order.companyName),
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
      // When unlocking, also set invoiced to false
      const updateData = currentLockState 
        ? { locked: false, invoiced: false } 
        : { locked: true };
      
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      // Show success immediately
      toast.success(currentLockState ? "Load Unlocked" : "Load Locked");

      // Update cache in background (non-blocking)
      (async () => {
        try {
          const { addLockedOrderToCache, removeLockedOrderFromCache } = await import("@/utils/ordersCache");
          
          if (!currentLockState) {
            // Locking - fetch full order data and add to cache
            const { data: orderData } = await supabase
              .from("orders")
              .select("*")
              .eq("id", orderId)
              .single();
            
            if (orderData) {
              await addLockedOrderToCache(orderData);
            }
          } else {
            // Unlocking - remove from cache
            await removeLockedOrderFromCache(orderId);
          }
        } catch (cacheError) {
          console.warn("Cache update failed (will sync on next archive export):", cacheError);
        }
      })();
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
        .update({ 
          canceled: true,
          freight_amount: 0,
          driver_price: 0
        })
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

  const openTransferDialog = (order: YardLoadOrder) => {
    setSelectedOrderForTransfer(order);
    setTransferDialogOpen(true);
  };

  // Revert transfer for left-at-yard loads - restores original driver/truck
  const handleRevertTransfer = async (order: YardLoadOrder) => {
    if (!order.isRecovery || !order.originalDriverId || !order.originalTruckId) {
      toast.error("Cannot revert - missing original assignment data");
      return;
    }

    try {
      // Get the current truck assigned to the order (the new truck that took over)
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('truck_id')
        .eq('id', order.id)
        .single();

      const currentTruckId = currentOrder?.truck_id;

      // Find the previous trailer for this truck from assignment_history
      // Look for the most recent trailer_assignment BEFORE the transfer was created
      let previousTrailerId: string | null = null;
      
      if (currentTruckId) {
        // Get the transfer creation time from order_transfers (use first one for multi-stop loads)
        const { data: transferData } = await supabase
          .from('order_transfers')
          .select('created_at')
          .eq('order_id', order.id)
          .order('sequence_number', { ascending: true })
          .limit(1);

        const transferCreatedAt = transferData?.[0]?.created_at;

        if (transferCreatedAt) {
          // Look for the trailer assignment just BEFORE the transfer
          const { data: historyData } = await supabase
            .from('assignment_history')
            .select('trailer_id')
            .eq('truck_id', currentTruckId)
            .eq('change_type', 'trailer_assignment')
            .lt('changed_at', transferCreatedAt)
            .order('changed_at', { ascending: false })
            .limit(1);

          previousTrailerId = historyData?.[0]?.trailer_id || null;
        }

        // Reset the new truck's trailer to what it had before
        const { error: truckError } = await supabase
          .from('trucks')
          .update({ trailer_id: previousTrailerId })
          .eq('id', currentTruckId);

        if (truckError) {
          console.error('Error resetting truck trailer:', truckError);
        }

        // Record this trailer change in assignment_history
        // HARDENED: Include old_ values for accurate display
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from('assignment_history').insert({
          truck_id: currentTruckId,
          trailer_id: previousTrailerId,
          old_truck_id: currentTruckId,
          old_trailer_id: order.trailerId || null, // The trailer we're reverting FROM
          change_type: 'trailer_assignment',
          changed_by: userData?.user?.id || null,
        });
      }

      const { error } = await supabase
        .from('orders')
        .update({
          driver1_id: order.originalDriverId,
          driver2_id: order.originalDriver2Id || null,
          truck_id: order.originalTruckId,
          trailer_id: order.originalTrailerId || null,
          is_recovery: false,
          original_driver1_id: null,
          original_driver2_id: null,
          original_truck_id: null,
          original_trailer_id: null,
          original_miles: null,
          original_driver_price: null,
          recovery_miles: null,
          recovery_driver_price: null,
        })
        .eq('id', order.id);

      if (error) throw error;

      // Delete order_transfers records for this order
      const { error: transfersDeleteError } = await supabase
        .from("order_transfers")
        .delete()
        .eq("order_id", order.id);

      if (transfersDeleteError) throw transfersDeleteError;

      toast.success("Transfer reverted - original driver and truck restored");
      queryClient.invalidateQueries({ queryKey: ["yard-loads-orders"] });
      // Real-time subscription will update orders cache
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
    } catch (error) {
      console.error('Error reverting transfer:', error);
      toast.error("Failed to revert transfer");
    }
  };

  const handleAssignTransferDriver = async (data: TransferDriverData) => {
    if (!selectedOrderForTransfer) return;

    const yardLoadTrailerId = selectedOrderForTransfer.trailerId;

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Get the truck's current trailer before making changes (for revert purposes)
      let previousTrailerId: string | null = null;
      if (data.transferTruckId) {
        const { data: currentTruck } = await supabase
          .from('trucks')
          .select('trailer_id')
          .eq('id', data.transferTruckId)
          .single();

        previousTrailerId = currentTruck?.trailer_id || null;

        // Always update the truck's trailer to the yard load's trailer (even if null)
        const { error: truckError } = await supabase
          .from('trucks')
          .update({ trailer_id: yardLoadTrailerId || null })
          .eq('id', data.transferTruckId);

        if (truckError) {
          console.error('Error updating truck trailer:', truckError);
        }

        // Record the trailer change AFTER updating - store what we changed TO
        // HARDENED: Include old_ values for accurate display
        await supabase.from('assignment_history').insert({
          truck_id: data.transferTruckId,
          trailer_id: yardLoadTrailerId || null, // The NEW trailer (what we changed TO)
          old_truck_id: data.transferTruckId,
          old_trailer_id: previousTrailerId, // The OLD trailer (what we changed FROM)
          change_type: 'trailer_assignment',
          changed_by: userData?.user?.id || null,
        });
      }

      // Update the order with transfer driver info - use yard load's trailer
      const { error } = await supabase
        .from('orders')
        .update({
          driver1_id: data.transferDriverId,
          truck_id: data.transferTruckId,
          trailer_id: yardLoadTrailerId || null, // Use yard load's trailer
          recovery_miles: data.recoveryMiles,
          recovery_driver_price: data.recoveryDriverPrice,
        })
        .eq('id', selectedOrderForTransfer.id);

      if (error) throw error;

      // Create order_transfers records for Original (sequence 0) and Transfer #1 (sequence 1)
      // First, delete any existing transfers for this order to avoid duplicates
      await supabase
        .from('order_transfers')
        .delete()
        .eq('order_id', selectedOrderForTransfer.id);

      // Create Original (sequence 0) record
      await supabase.from('order_transfers').insert({
        order_id: selectedOrderForTransfer.id,
        sequence_number: 0,
        driver1_id: selectedOrderForTransfer.originalDriverId,
        truck_id: selectedOrderForTransfer.originalTruckId,
        trailer_id: selectedOrderForTransfer.originalTrailerId,
        miles: selectedOrderForTransfer.originalMiles,
        driver_price: selectedOrderForTransfer.originalDriverPrice,
        transfer_city: data.transferCity,
        transfer_state: data.transferState,
        transfer_address: data.transferAddress || null,
        transfer_datetime: data.transferDatetime,
      });

      // Create Transfer #1 (sequence 1) record
      await supabase.from('order_transfers').insert({
        order_id: selectedOrderForTransfer.id,
        sequence_number: 1,
        driver1_id: data.transferDriverId,
        truck_id: data.transferTruckId,
        trailer_id: yardLoadTrailerId,
        miles: data.recoveryMiles,
        driver_price: data.recoveryDriverPrice,
      });

      // Create recovery history entry
      await supabase.from('recovery_history').insert({
        order_id: selectedOrderForTransfer.id,
        original_driver1_id: selectedOrderForTransfer.originalDriverId,
        original_truck_id: selectedOrderForTransfer.originalTruckId,
        original_trailer_id: selectedOrderForTransfer.originalTrailerId,
        recovery_driver1_id: data.transferDriverId,
        recovery_truck_id: data.transferTruckId,
        recovery_trailer_id: yardLoadTrailerId || null,
        recovery_date: new Date().toISOString(),
      });

      // Update recovery driver's company to match original driver's company
      if (data.transferDriverId && selectedOrderForTransfer.originalDriverId) {
        const { data: originalDriver } = await supabase
          .from('drivers')
          .select('company_id')
          .eq('id', selectedOrderForTransfer.originalDriverId)
          .single();

        if (originalDriver?.company_id) {
          await supabase
            .from('drivers')
            .update({ company_id: originalDriver.company_id })
            .eq('id', data.transferDriverId);
        }
      }

      toast.success("Transfer driver assigned successfully");
      queryClient.invalidateQueries({ queryKey: ["yard-loads-orders"] });
      // Real-time subscription will update orders cache
      queryClient.invalidateQueries({ queryKey: ["trucks"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      setTransferDialogOpen(false);
      setSelectedOrderForTransfer(null);
    } catch (error) {
      console.error('Error assigning transfer driver:', error);
      toast.error("Failed to assign transfer driver");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Loads at the Yard</h1>
        <div className="flex flex-wrap gap-2">
          {!isYardRole && (
            <Button onClick={exportToExcel} variant="outline" className="text-xs md:text-sm">
              <Download className="mr-1 md:mr-2 h-4 w-4" />
              Export
            </Button>
          )}
          {canCreateOrders && (
            <Button onClick={() => navigate('/new-order')} className="text-xs md:text-sm">
              <Plus className="mr-1 md:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">New Load</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 md:p-6">
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
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
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Trailer #</TableHead>
                  <TableHead className="w-20">Load #</TableHead>
                  <TableHead className="w-28">Broker Load #</TableHead>
                  <TableHead className="w-36">Delivery City</TableHead>
                  <TableHead className="w-28">Delivery Date</TableHead>
                  <TableHead className="w-24">Delivery Time</TableHead>
                  <TableHead className="w-24">Miles</TableHead>
                  <TableHead className="w-36">Broker Name</TableHead>
                  <TableHead className="w-28">Freight Amount</TableHead>
                  <TableHead className="w-28">Company</TableHead>
                  <TableHead className="w-28">Booked By</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
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
                  paginatedOrders.map((order: YardLoadOrder) => {
                    const isRecovery = order.isRecovery;
                    const rowClassName = isRecovery
                      ? 'bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_85%)] dark:hover:bg-[hsl(270_50%_30%)]'
                      : '';
                    
                    return (
                      <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                        <TableCell className="font-medium">{order.trailerNumber || '-'}</TableCell>
                        <TableCell className="font-medium">{formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}</TableCell>
                        <TableCell>{order.brokerLoadNumber || '-'}</TableCell>
                        <TableCell>
                          <span className="line-clamp-2">{order.deliveryCity}{order.deliveryCity && order.deliveryState ? ', ' : ''}{order.deliveryState}</span>
                        </TableCell>
                        <TableCell>{formatDateNoTimezone(order.deliveryDate)}</TableCell>
                        <TableCell>
                          {order.deliveryDate ? order.deliveryDate.substring(11, 16) : '-'}
                        </TableCell>
                        <TableCell>
                          {order.terminalToDeliveryMiles?.toLocaleString() || '0'}
                        </TableCell>
                        <TableCell>
                          <span className="line-clamp-2">{order.brokerName || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(order.freightAmount || 0)}
                          </div>
                        </TableCell>
                        <TableCell>{order.companyName || '-'}</TableCell>
                        <TableCell>{order.bookedBy || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {order.isRecovery && (
                              <>
                                <Button 
                                  variant="default" 
                                  size="sm" 
                                  onClick={() => openTransferDialog(order)}
                                  title="Assign Transfer Driver"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                {order.originalDriverId && order.originalTruckId && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleRevertTransfer(order)}
                                    title="Revert Transfer - Restore Original Driver"
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                            {!order.locked && canEditOrders && (
                              <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Assign Transfer Driver Dialog */}
      <AssignTransferDriverDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onSave={handleAssignTransferDriver}
        originalDriverName={selectedOrderForTransfer?.originalDriverName || null}
        originalTruckNumber={selectedOrderForTransfer?.originalTruckNumber || null}
        originalTrailerNumber={selectedOrderForTransfer?.originalTrailerNumber || null}
        originalMiles={selectedOrderForTransfer?.originalMiles || 0}
        originalDriverPrice={selectedOrderForTransfer?.originalDriverPrice || 0}
        recoveryMiles={selectedOrderForTransfer?.recoveryMiles || 0}
        yardLoadTrailerId={selectedOrderForTransfer?.trailerId}
        yardLoadTrailerNumber={selectedOrderForTransfer?.trailerNumber}
      />
    </div>
  );
}
