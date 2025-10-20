import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2 } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useState, useMemo } from "react";
import { useDragPan } from "@/hooks/useDragPan";
import { format, startOfWeek, endOfWeek, parseISO, isWithinInterval } from "date-fns";

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

const Trips = () => {
  useDragPan();
  
  const { data: orders, isLoading } = useOrders();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [truckFilter, setTruckFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const itemsPerPage = 50;

  // Filter orders based on truck and driver filters
  const filteredOrders = orders?.filter(order => {
    const matchesTruck = !truckFilter || 
      order.truckNumber?.toLowerCase().includes(truckFilter.toLowerCase());
    
    const matchesDriver = !driverFilter || 
      order.driverName?.toLowerCase().includes(driverFilter.toLowerCase());

    return matchesTruck && matchesDriver;
  }) || [];

  // Group orders by week (Monday-Sunday)
  const groupedByWeek = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    
    filteredOrders.forEach(order => {
      if (order.deliveryDate) {
        try {
          // Parse date string - handle various formats
          const dateStr = String(order.deliveryDate);
          let deliveryDate: Date;
          
          // If it's a string with time (ISO format)
          if (dateStr.includes('T')) {
            deliveryDate = parseISO(dateStr);
          } 
          // If it's a simple date string like "10/20/2025" or "2025-10-20"
          else {
            // Try to parse as-is first
            deliveryDate = new Date(dateStr);
            
            // If that fails, try adding time
            if (isNaN(deliveryDate.getTime())) {
              deliveryDate = new Date(dateStr + 'T00:00:00');
            }
          }
          
          // Validate the date
          if (isNaN(deliveryDate.getTime())) {
            console.error('Invalid date:', order.deliveryDate);
            return;
          }
          
          const weekStart = startOfWeek(deliveryDate, { weekStartsOn: 1 }); // Monday
          const weekKey = format(weekStart, 'yyyy-MM-dd');
          
          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(order);
        } catch (e) {
          console.error('Error parsing date:', e, 'for order:', order.deliveryDate);
        }
      }
    });
    
    // Sort weeks by date
    return Object.keys(groups)
      .sort()
      .map(weekKey => ({
        weekStart: weekKey,
        orders: groups[weekKey]
      }));
  }, [filteredOrders]);

  // Pagination
  const totalPages = Math.ceil(groupedByWeek.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedWeeks = groupedByWeek.slice(startIndex, endIndex);

  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => setCurrentPage(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Trips</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Truck Filter */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by truck number..."
                value={truckFilter}
                onChange={(e) => {
                  setTruckFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>

            {/* Driver Filter */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by driver name..."
                value={driverFilter}
                onChange={(e) => {
                  setDriverFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-fit min-w-full">
        <CardHeader>
          <CardTitle>
            Trips ({filteredOrders.length})
          </CardTitle>
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
                    <TableHead className="w-20">Pickup State</TableHead>
                    <TableHead className="w-32">Delivery Date</TableHead>
                    <TableHead className="w-28">Delivery City</TableHead>
                    <TableHead className="w-20">Delivery State</TableHead>
                    <TableHead className="w-16">Miles</TableHead>
                    <TableHead className="w-24">Driver Pay</TableHead>
                    <TableHead className="w-32">Driver</TableHead>
                    <TableHead className="w-36">Broker Name</TableHead>
                    <TableHead className="w-28">Broker Load #</TableHead>
                    <TableHead className="w-20">Invoiced</TableHead>
                    <TableHead className="w-28">Freight Amount</TableHead>
                    <TableHead className="w-28">Company</TableHead>
                  </TableRow>
                 </TableHeader>
                <TableBody>
                   {paginatedWeeks.length === 0 ? (
                     <TableRow>
                      <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                        No trips found
                      </TableCell>
                     </TableRow>
                   ) : (
                     paginatedWeeks.map((week, weekIndex) => {
                       const weekTotal = week.orders.reduce((acc, order) => ({
                         miles: acc.miles + (order.mileage || 0),
                         driverPay: acc.driverPay + (order.totalDriverPay || 0),
                         freightAmount: acc.freightAmount + (order.totalFreightAmount || 0)
                       }), { miles: 0, driverPay: 0, freightAmount: 0 });

                       const weekStartDate = parseISO(week.weekStart);
                       const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

                       return (
                         <>
                           {/* Weekly Summary Row */}
                           <TableRow key={`week-${week.weekStart}`} className="bg-muted/50 font-semibold border-t-4 border-primary">
                             <TableCell colSpan={8} className="py-3">
                               Week: {format(weekStartDate, 'MMM d')} - {format(weekEndDate, 'MMM d, yyyy')}
                             </TableCell>
                             <TableCell className="py-3">{weekTotal.miles.toLocaleString()}</TableCell>
                             <TableCell className="py-3">
                               <div className="font-semibold text-green-600 dark:text-green-400">
                                 ${weekTotal.driverPay.toLocaleString()}
                               </div>
                             </TableCell>
                             <TableCell colSpan={4}></TableCell>
                             <TableCell className="py-3">
                               <div className="font-semibold text-green-600 dark:text-green-400">
                                 ${weekTotal.freightAmount.toLocaleString()}
                               </div>
                             </TableCell>
                             <TableCell></TableCell>
                           </TableRow>

                           {/* Orders for this week */}
                           {week.orders.map((order, orderIndex) => {
                             const isRecovery = order.isRecovery;
                             const isLastInWeek = orderIndex === week.orders.length - 1;
                             
                             const rowClassName = isRecovery
                               ? 'bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_85%)] dark:hover:bg-[hsl(270_50%_30%)]'
                               : '';
                             
                             return (
                               <TableRow 
                                 key={order.id} 
                                 className={`h-16 ${rowClassName} ${isLastInWeek ? 'border-b-4 border-primary' : ''}`}
                               >
                                 <TableCell className="font-medium">{order.truckNumber}</TableCell>
                                 <TableCell>{order.internalLoadNumber}</TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4">{order.pickupDate}</div></TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4 line-clamp-2">{order.pickupCity}</div></TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4">{order.pickupState}</div></TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4">{order.deliveryDate}</div></TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4 line-clamp-2">{order.deliveryCity}</div></TableCell>
                                 <TableCell className="p-0"><div className="h-full p-4">{order.deliveryState}</div></TableCell>
                                 <TableCell>{order.mileage?.toLocaleString() || '0'}</TableCell>
                                 <TableCell>
                                   <div className="font-semibold text-green-600 dark:text-green-400">
                                     ${order.totalDriverPay?.toLocaleString() || '0'}
                                   </div>
                                 </TableCell>
                                 <TableCell><div className="line-clamp-2">{order.driverName}</div></TableCell>
                                 <TableCell><div className="line-clamp-2">{order.brokerName}</div></TableCell>
                                 <TableCell>{order.brokerLoadNumber}</TableCell>
                                 <TableCell>{order.invoiced}</TableCell>
                                 <TableCell>
                                   <div className="font-semibold text-green-600 dark:text-green-400">
                                     ${order.totalFreightAmount?.toLocaleString() || '0'}
                                   </div>
                                 </TableCell>
                                 <TableCell>{order.companyName}</TableCell>
                               </TableRow>
                             );
                           })}
                         </>
                       );
                     })
                   )}
                 </TableBody>
              </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {renderPaginationItems()}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Trips;
