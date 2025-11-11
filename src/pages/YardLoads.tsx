import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Calendar, FileText, Lock, Unlock, Plus, Download } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { useAuthContext } from "@/contexts/AuthContext";
import { DateRange } from "react-day-picker";

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
  const { toast } = useToast();
  const { hasRole } = useAuthContext();
  
  // Fetch data using the same hook as Orders page
  const { data: orders = [], isLoading } = useOrders();
  const { data: companies = [] } = useCompanies();

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

  // Get unique values for filters
  const trucks = Array.from(new Set(orders.map(o => o.truckNumber).filter(Boolean))).sort();
  const drivers = Array.from(new Set(orders.map(o => o.driverName).filter(Boolean))).sort();
  const brokers = Array.from(new Set(orders.map(o => o.brokerName).filter(Boolean))).sort();

  // Filter orders
  const filteredOrders = orders.filter(order => {
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
      'Pickup Date': order.pickupDate ? format(new Date(order.pickupDate), 'MM/dd/yyyy') : '',
      'Delivery': `${order.deliveryCity}, ${order.deliveryState}`,
      'Delivery Date': order.deliveryDate ? format(new Date(order.deliveryDate), 'MM/dd/yyyy') : '',
      'Miles': order.mileage || 0,
      'Driver Pay': order.driverPrice || 0,
      'Broker Rate': order.freightAmount || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Yard Loads");
    XLSX.writeFile(wb, `yard-loads-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export Successful",
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

      toast({
        title: currentLockState ? "Load Unlocked" : "Load Locked",
        description: currentLockState 
          ? "Load can now be edited" 
          : "Load is now locked from editing",
      });
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast({
        title: "Error",
        description: "Failed to toggle lock status",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Loads at the Yard</h1>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => navigate('/new-order')}>
            <Plus className="mr-2 h-4 w-4" />
            New Load
          </Button>
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
                  <TableHead>Load #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      No loads found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell 
                        onClick={() => navigateToEditOrder(order.id)}
                        className="font-medium"
                      >
                        {order.internalLoadNumber}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        {getStatusBadge(order.status)}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        {order.companyName || '-'}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        {order.truckNumber || '-'}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        {order.driverName || '-'}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        {order.brokerName || '-'}
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        <div className="max-w-[200px] truncate">
                          {order.pickupCity}, {order.pickupState}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {order.pickupDate && format(new Date(order.pickupDate), 'MM/dd/yyyy')}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)}>
                        <div className="max-w-[200px] truncate">
                          {order.deliveryCity}, {order.deliveryState}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {order.deliveryDate && format(new Date(order.deliveryDate), 'MM/dd/yyyy')}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => navigateToEditOrder(order.id)} className="text-right">
                        {order.mileage || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {hasRole('manager') || hasRole('admin') ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOrderLock(order.id, order.locked || false);
                              }}
                            >
                              {order.locked ? (
                                <Lock className="h-4 w-4" />
                              ) : (
                                <Unlock className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
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
    </div>
  );
}
