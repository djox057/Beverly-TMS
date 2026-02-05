import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Loader2, ExternalLink, Edit, CalendarClock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { formatCurrency } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { format, startOfWeek, endOfWeek } from "date-fns";
import moneyStackIcon from "@/assets/money-stack.png";

interface NestedDriverTripsDropdownProps {
  driverName: string;
  driverId?: string;
  onSearchDriver?: (driverName: string) => void;
}

// Helper to format datetime strings without timezone conversion
const formatDateDisplay = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  try {
    const normalizedStr = String(dateStr).replace(" ", "T");
    const datePart = normalizedStr.split("T")[0];
    if (!datePart) return "";
    const [year, month, day] = datePart.split("-");
    if (!year || !month || !day) return "";
    return `${month}/${day}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

// Cell selection hook for the popup
function useNestedCellSelection() {
  const [selectedCells, setSelectedCells] = useState<Map<string, { value: number; type: string; miles?: number }>>(new Map());

  const toggleCell = useCallback((cellId: string, value: number, type: string, miles?: number) => {
    setSelectedCells((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(cellId)) {
        newMap.delete(cellId);
      } else {
        newMap.set(cellId, { value, type, miles });
      }
      return newMap;
    });
  }, []);

  const isSelected = useCallback((cellId: string) => selectedCells.has(cellId), [selectedCells]);

  const clearSelection = useCallback(() => setSelectedCells(new Map()), []);

  const summary = useMemo(() => {
    let totalSum = 0;
    let totalMiles = 0;
    let count = 0;

    selectedCells.forEach(({ value, type, miles }) => {
      if (type === "miles") {
        totalMiles += value;
      } else {
        totalSum += value;
        if (miles) totalMiles += miles;
      }
      count++;
    });

    const average = count > 0 ? totalSum / count : 0;
    const rpm = totalMiles > 0 ? totalSum / totalMiles : 0;

    return { totalSum, average, totalMiles, rpm, count };
  }, [selectedCells]);

  return { toggleCell, isSelected, clearSelection, summary, hasSelection: selectedCells.size > 0 };
}

export function NestedDriverTripsDropdown({ driverName, driverId, onSearchDriver }: NestedDriverTripsDropdownProps) {
  const [open, setOpen] = useState(false);
  const { toggleCell, isSelected, clearSelection, summary, hasSelection } = useNestedCellSelection();

  // Clear selection when popup closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      clearSelection();
    }
  };

  // Fetch orders for this driver when popover opens
  const { data: orders, isLoading } = useQuery({
    queryKey: ["nested-driver-trips", driverName, driverId],
    queryFn: async () => {
      // Search by driver name or ID
      let query = supabase
        .from("orders")
        .select(`
          *,
          pickup_drops (*),
          trucks:truck_id (id, truck_number),
          trailers:trailer_id (id, trailer_number),
          driver1:driver1_id (id, name, company_id, companies:company_id(name)),
          driver2:driver2_id (id, name),
          order_files (*),
          brokers:broker_id (id, name),
          order_transfers (
            id,
            sequence_number,
            driver1_id,
            driver2_id,
            truck_id,
            trailer_id,
            miles,
            driver_price,
            transfer_datetime,
            driver1:driver1_id (id, name),
            driver2:driver2_id (id, name),
            truck:truck_id (id, truck_number),
            trailer:trailer_id (id, trailer_number),
            manual_driver_name,
            manual_truck_number,
            manual_trailer_number
          )
        `)
        .order("delivery_datetime", { ascending: false })
        .limit(50);

      // Filter by driver1_id or driver2_id if we have an ID
      if (driverId) {
        query = query.or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching nested driver trips:", error);
        return [];
      }

      // Transform orders
      const transformed = transformOrders(data || []);
      
      // Filter to only include orders where the driver name matches
      // (in case of transfers, the order may have different current driver)
      return transformed.filter(order => {
        const orderDriverName = order.driverName?.toLowerCase() || "";
        const searchName = driverName.toLowerCase();
        return orderDriverName.includes(searchName) || searchName.includes(orderDriverName);
      });
    },
    enabled: open, // Only fetch when popover is open
    staleTime: 30000,
  });

  // Filter out orders with 0 miles, 0 driver pay, and 0 freight
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(order => {
      const miles = Number(order.mileage) || 0;
      const driverPay = Number(order.totalDriverPay) || 0;
      const freightAmount = Number(order.totalFreightAmountNoLumper) || 0;
      return !(miles === 0 && driverPay === 0 && freightAmount === 0);
    });
  }, [orders]);

  // Group orders by week
  const groupedByWeek = useMemo(() => {
    if (!filteredOrders || filteredOrders.length === 0) return [];

    const groups: { [key: string]: any[] } = {};

    filteredOrders.forEach((order) => {
      if (order.deliveryDate) {
        try {
          const normalizedStr = String(order.deliveryDate).replace(" ", "T");
          const datePart = normalizedStr.split("T")[0];
          if (!datePart) return;
          
          const [year, month, day] = datePart.split("-").map(Number);
          if (!year || !month || !day) return;
          
          const deliveryDate = new Date(year, month - 1, day, 12, 0, 0);
          const weekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 }); // Tuesday
          const weekKey = format(weekStart, "yyyy-MM-dd");

          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(order);
        } catch (e) {
          console.error("Error parsing date:", e);
        }
      }
    });

    // Sort weeks by date (newest first)
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => {
        const weekStartDate = new Date(weekKey + "T12:00:00");
        const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 2 });
        
        // Calculate totals
        const weekOrders = groups[weekKey];
        const totals = weekOrders.reduce(
          (acc, order) => ({
            miles: acc.miles + (Number(order.mileage) || 0),
            driverPay: acc.driverPay + (Number(order.totalDriverPay) || 0),
            freightAmount: acc.freightAmount + (Number(order.totalFreightAmountNoLumper) || 0),
          }),
          { miles: 0, driverPay: 0, freightAmount: 0 }
        );

        return {
          weekStart: weekKey,
          weekStartDate,
          weekEndDate,
          orders: weekOrders,
          totals,
        };
      });
  }, [filteredOrders]);

  const handleOpenInTrips = () => {
    if (onSearchDriver) {
      onSearchDriver(driverName);
    }
    setOpen(false);
  };

  // Get row class based on order state (matching Trips page logic)
  const getRowClassName = (order: any, orderIndex: number) => {
    const isRecovery = order.isRecovery;
    const freightAmount = Number(order.freightAmount) || 0;
    const totalFreight = Number(order.totalFreightAmountNoLumper) || 0;
    const hasAdditionalPay = totalFreight > freightAmount;
    const hasReducedPay = totalFreight < freightAmount;

    const hasOrangeCondition =
      order.canceled ||
      ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

    const isEvenRow = orderIndex % 2 === 1;
    const alternatingBg = isEvenRow ? "bg-muted/50 dark:bg-muted/30" : "bg-background";

    if (isRecovery) {
      return "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)]";
    }
    if (hasReducedPay) {
      return "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)]";
    }
    if (hasAdditionalPay) {
      return "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)]";
    }
    if (hasOrangeCondition) {
      return "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)]";
    }
    return alternatingBg;
  };

  // Render additional pay/charge icon
  const renderAdditionalPayIcon = (order: any) => {
    const freightAmount = Number(order.freightAmount) || 0;
    const totalFreight = Number(order.totalFreightAmountNoLumper) || 0;
    const difference = totalFreight - freightAmount;
    
    if (difference === 0) return null;
    
    const isPositive = difference > 0;
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0.5 h-6 w-6">
            <img 
              src={moneyStackIcon} 
              alt={isPositive ? "Additional pay" : "Reduced pay"} 
              className={`h-4 w-4 object-contain ${!isPositive ? "grayscale brightness-75 hue-rotate-180" : ""}`}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold mb-1">
            {isPositive ? "Additional Pay" : "Reduced Pay"}
          </div>
          <div className={`font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
            {isPositive ? "+" : ""}{formatCurrency(difference)}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Render rescheduled icon
  const renderRescheduledIcon = (order: any) => {
    if (!(order as any).dateChangeNotes || (order as any).dateChangeNotes.trim() === "") {
      return null;
    }
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0.5 h-6 w-6">
            <CalendarClock className="h-4 w-4 text-orange-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold mb-1">Rescheduled</div>
          <div className="text-muted-foreground whitespace-pre-wrap">
            {(order as any).dateChangeNotes}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Render missing POD icon
  const renderMissingPodIcon = (order: any) => {
    if (order.canceled || (order.podFiles && order.podFiles.length > 0)) {
      return null;
    }
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0.5 h-6 w-6">
            <AlertCircle className="h-4 w-4 text-red-600 fill-red-100" strokeWidth={2.5} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold text-red-500">POD Missing</div>
          <div className="text-muted-foreground">
            No proof of delivery uploaded.
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-xs gap-1 hover:bg-yellow-200 dark:hover:bg-yellow-800"
        >
          <ChevronDown className="h-3 w-3" />
          View Trips
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[calc(100vw-280px)] max-w-[1600px] min-w-[900px] p-0 bg-popover" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b flex items-center justify-between bg-muted/50">
          <div className="font-semibold text-sm">
            Trips for {driverName}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs gap-1"
            onClick={handleOpenInTrips}
          >
            <ExternalLink className="h-3 w-3" />
            Open in Trips
          </Button>
        </div>
        
        {/* Cell selection summary */}
        {hasSelection && (
          <div className="px-3 py-2 border-b bg-blue-50 dark:bg-blue-950 text-xs flex items-center gap-4">
            <span className="font-medium">Selection:</span>
            <span>Sum: {formatCurrency(summary.totalSum)}</span>
            <span>Avg: {formatCurrency(summary.average)}</span>
            <span>Miles: {summary.totalMiles.toLocaleString()}</span>
            {summary.totalMiles > 0 && <span>RPM: ${summary.rpm.toFixed(2)}</span>}
            <Button variant="ghost" size="sm" className="h-5 px-2 text-xs ml-auto" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        )}
        
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders && filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No trips found for this driver
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {groupedByWeek.map((week) => (
                <div key={week.weekStart} className="border rounded-lg overflow-hidden">
                  {/* Week header - matches Trips page style */}
                  <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between font-semibold">
                    <span className="text-sm">
                      Week: {format(week.weekStartDate, "MMM d")} - {format(week.weekEndDate, "MMM d, yyyy")}
                    </span>
                    <div className="flex gap-6 text-xs">
                      <span 
                        className={`cursor-pointer select-none px-1 rounded ${
                          isSelected(`week-miles-${week.weekStart}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleCell(`week-miles-${week.weekStart}`, week.totals.miles, "miles")}
                      >
                        {week.totals.miles.toLocaleString()} mi
                      </span>
                      <span 
                        className={`text-green-600 dark:text-green-400 font-medium cursor-pointer select-none px-1 rounded ${
                          isSelected(`week-driver-${week.weekStart}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleCell(`week-driver-${week.weekStart}`, week.totals.driverPay, "driverPay", week.totals.miles)}
                      >
                        {formatCurrency(week.totals.driverPay)}
                      </span>
                      <span 
                        className={`text-green-600 dark:text-green-400 font-medium cursor-pointer select-none px-1 rounded ${
                          isSelected(`week-freight-${week.weekStart}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleCell(`week-freight-${week.weekStart}`, week.totals.freightAmount, "freightAmount", week.totals.miles)}
                      >
                        {formatCurrency(week.totals.freightAmount)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Orders table - matches Trips page columns */}
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-yellow-200/50 dark:bg-yellow-800/50">
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Truck#</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Load#</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Pickup Date</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Pickup City</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Delivery Date</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Delivery City</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap h-8">Miles</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Broker</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Broker Load#</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap h-8">Driver Pay</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap h-8">Freight</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap h-8">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {week.orders.map((order: any, orderIndex: number) => (
                        <TableRow 
                          key={order.id} 
                          className={`text-xs h-10 ${getRowClassName(order, orderIndex)}`}
                        >
                          <TableCell className="py-1.5 px-2">
                            {order.truckNumber}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 font-medium">
                            {formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            {formatDateDisplay(order.pickupDate)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <span>{order.pickupCity}</span>
                            {order.pickupState && <span className="text-muted-foreground">, {order.pickupState}</span>}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            {formatDateDisplay(order.deliveryDate)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <span>{order.deliveryCity}</span>
                            {order.deliveryState && <span className="text-muted-foreground">, {order.deliveryState}</span>}
                          </TableCell>
                          <TableCell 
                            className={`py-1.5 px-2 text-right cursor-pointer select-none transition-colors ${
                              isSelected(`order-miles-${order.id}`) 
                                ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500 ring-inset" 
                                : "hover:bg-muted/50"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCell(`order-miles-${order.id}`, Number(order.mileage) || 0, "miles");
                            }}
                          >
                            {(order.mileage || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 truncate max-w-[100px]" title={order.brokerName}>
                            {order.brokerName || "-"}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 truncate max-w-[80px]" title={order.brokerLoadNumber}>
                            {order.brokerLoadNumber || "-"}
                          </TableCell>
                          <TableCell 
                            className={`py-1.5 px-2 text-right cursor-pointer select-none transition-colors ${
                              isSelected(`order-driver-${order.id}`) 
                                ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500 ring-inset" 
                                : "hover:bg-muted/50"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCell(`order-driver-${order.id}`, Number(order.totalDriverPay) || 0, "driverPay", Number(order.mileage) || 0);
                            }}
                          >
                            <span className="text-green-600 dark:text-green-400">
                              {formatCurrency(order.totalDriverPay || 0)}
                            </span>
                          </TableCell>
                          <TableCell 
                            className={`py-1.5 px-2 text-right cursor-pointer select-none transition-colors ${
                              isSelected(`order-freight-${order.id}`) 
                                ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500 ring-inset" 
                                : "hover:bg-muted/50"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCell(`order-freight-${order.id}`, Number(order.totalFreightAmountNoLumper) || 0, "freightAmount", Number(order.mileage) || 0);
                            }}
                          >
                            <span className="text-green-600 dark:text-green-400">
                              {formatCurrency(order.totalFreightAmountNoLumper || 0)}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/orders/${order.id}/edit`, '_blank');
                                }}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              {renderAdditionalPayIcon(order)}
                              {renderRescheduledIcon(order)}
                              {renderMissingPodIcon(order)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
