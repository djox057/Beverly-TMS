import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Loader2, ExternalLink, Edit, CalendarClock, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  isOpen?: boolean;
  onToggle?: () => void;
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

// Cell selection hook for the inline section
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

// Toggle button component (controlled)
export function NestedDriverTripsDropdown({ 
  driverName, 
  driverId, 
  onSearchDriver, 
  isOpen = false, 
  onToggle 
}: NestedDriverTripsDropdownProps) {
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-6 px-2 text-xs gap-1 hover:bg-yellow-200 dark:hover:bg-yellow-800"
      onClick={onToggle}
    >
      {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      View Trips
    </Button>
  );
}

// Inline content component to be rendered in a separate table row
interface NestedDriverTripsInlineContentProps {
  driverName: string;
  driverId?: string;
  onSearchDriver?: (driverName: string) => void;
  colSpan: number;
}

export function NestedDriverTripsInlineContent({ 
  driverName, 
  driverId, 
  onSearchDriver,
  colSpan
}: NestedDriverTripsInlineContentProps) {
  const { toggleCell, isSelected, clearSelection, summary, hasSelection } = useNestedCellSelection();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["nested-driver-trips-inline", driverName, driverId],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(`
          *,
          pickup_drops (*),
          truck:trucks!orders_truck_id_fkey (id, truck_number),
          trailer:trailers!orders_trailer_id_fkey (id, trailer_number),
          driver1:drivers!orders_driver1_id_fkey (id, name, company_id, company:companies (id, name)),
          driver2:drivers!orders_driver2_id_fkey (id, name),
          order_files (*),
          broker:brokers (id, name),
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
            driver1:drivers!order_transfers_driver1_id_fkey (id, name),
            driver2:drivers!order_transfers_driver2_id_fkey (id, name),
            truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
            trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number),
            manual_driver_name,
            manual_truck_number,
            manual_trailer_number
          )
        `)
        .order("delivery_datetime", { ascending: false })
        .limit(50);

      if (driverId) {
        query = query.or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching nested driver trips:", error);
        return [];
      }

      const transformed = transformOrders(data || []);
      
      return transformed.filter(order => {
        const orderDriverName = order.driverName?.toLowerCase() || "";
        const searchName = driverName.toLowerCase();
        return orderDriverName.includes(searchName) || searchName.includes(orderDriverName);
      });
    },
    staleTime: 30000,
  });

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(order => {
      const miles = Number(order.mileage) || 0;
      const driverPay = Number(order.totalDriverPay) || 0;
      const freightAmount = Number(order.totalFreightAmountNoLumper) || 0;
      return !(miles === 0 && driverPay === 0 && freightAmount === 0);
    });
  }, [orders]);

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
          const weekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 });
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

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => {
        const weekStartDate = new Date(weekKey + "T12:00:00");
        const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 2 });
        
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
  };

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

  const renderMissingPodIcon = (order: any) => {
    if (order.canceled || (order.podFiles && order.podFiles.length > 0)) {
      return null;
    }
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0.5 h-6 w-6">
            <AlertCircle className="h-4 w-4 text-destructive" strokeWidth={2.5} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold text-destructive">POD Missing</div>
          <div className="text-muted-foreground">
            No proof of delivery uploaded.
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <TableRow className="hover:bg-transparent border-l-4 border-l-yellow-500">
      <TableCell colSpan={colSpan} className="p-0 bg-yellow-50/50 dark:bg-yellow-900/20">
        <div className="py-2 relative">
          {/* Header - aligned with table content */}
          <div className="flex items-center justify-between mb-2 px-4">
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
          
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders && filteredOrders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No trips found for this driver
            </div>
          ) : (
            <div className="space-y-3 px-4">
              {groupedByWeek.map((week) => (
                <div key={week.weekStart} className="border rounded-lg overflow-hidden bg-card">
                  {/* Week header - using grid for alignment */}
                  <div className="bg-muted/50 px-3 py-2 border-b grid grid-cols-[80px_80px_100px_1fr_100px_1fr_80px_140px_120px_100px_100px_80px] gap-1 items-center">
                    <div className="col-span-6 font-semibold text-sm">
                      Week: {format(week.weekStartDate, "MMM d")} - {format(week.weekEndDate, "MMM d, yyyy")}
                    </div>
                    <div 
                      className={`text-right text-xs cursor-pointer select-none px-1 rounded ${
                        isSelected(`week-miles-${week.weekStart}`) 
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleCell(`week-miles-${week.weekStart}`, week.totals.miles, "miles")}
                    >
                      {week.totals.miles.toLocaleString()} mi
                    </div>
                    <div className="col-span-2"></div>
                    <div 
                      className={`text-right text-xs text-green-600 dark:text-green-400 font-medium cursor-pointer select-none px-1 rounded ${
                        isSelected(`week-driver-${week.weekStart}`) 
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleCell(`week-driver-${week.weekStart}`, week.totals.driverPay, "driverPay", week.totals.miles)}
                    >
                      {formatCurrency(week.totals.driverPay)}
                    </div>
                    <div 
                      className={`text-right text-xs text-green-600 dark:text-green-400 font-medium cursor-pointer select-none px-1 rounded ${
                        isSelected(`week-freight-${week.weekStart}`) 
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleCell(`week-freight-${week.weekStart}`, week.totals.freightAmount, "freightAmount", week.totals.miles)}
                    >
                      {formatCurrency(week.totals.freightAmount)}
                    </div>
                    <div></div>
                  </div>
                  
                  {/* Column headers */}
                  <div className="grid grid-cols-[80px_80px_100px_1fr_100px_1fr_80px_140px_120px_100px_100px_80px] gap-1 bg-yellow-100/50 dark:bg-yellow-800/30 text-xs px-3 py-1.5 border-b">
                    <div className="font-medium">Truck#</div>
                    <div className="font-medium">Load#</div>
                    <div className="font-medium">Pickup Date</div>
                    <div className="font-medium">Pickup City</div>
                    <div className="font-medium">Delivery Date</div>
                    <div className="font-medium">Delivery City</div>
                    <div className="font-medium text-right">Miles</div>
                    <div className="font-medium">Broker</div>
                    <div className="font-medium">Broker Load#</div>
                    <div className="font-medium text-right">Driver Pay</div>
                    <div className="font-medium text-right">Freight</div>
                    <div className="font-medium">Actions</div>
                  </div>
                  
                  {/* Orders rows */}
                  {week.orders.map((order: any, orderIndex: number) => (
                    <div 
                      key={order.id} 
                      className={`grid grid-cols-[80px_80px_100px_1fr_100px_1fr_80px_140px_120px_100px_100px_80px] gap-1 text-xs h-12 items-center px-3 border-b last:border-b-0 ${getRowClassName(order, orderIndex)}`}
                    >
                      <div className="font-medium truncate">
                        {order.truckNumber || "—"}
                      </div>
                      <div className="font-medium">
                        {formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}
                      </div>
                      <div>
                        {formatDateDisplay(order.pickupDate)}
                      </div>
                      <div className="truncate">
                        <span>{order.pickupCity}</span>
                        {order.pickupState && <span className="text-muted-foreground">, {order.pickupState}</span>}
                      </div>
                      <div>
                        {formatDateDisplay(order.deliveryDate)}
                      </div>
                      <div className="truncate">
                        <span>{order.deliveryCity}</span>
                        {order.deliveryState && <span className="text-muted-foreground">, {order.deliveryState}</span>}
                      </div>
                      <div 
                        className={`text-right cursor-pointer select-none transition-colors px-1 rounded ${
                          isSelected(`nested-order-miles-${order.id}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted/50"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(`nested-order-miles-${order.id}`, Number(order.mileage) || 0, "miles");
                        }}
                      >
                        {(order.mileage || 0).toLocaleString()}
                      </div>
                      <div className="truncate" title={order.brokerName || ""}>
                        {order.brokerName || "—"}
                      </div>
                      <div className="truncate" title={order.brokerLoadNumber || ""}>
                        {order.brokerLoadNumber || "—"}
                      </div>
                      <div 
                        className={`text-right cursor-pointer select-none transition-colors px-1 rounded ${
                          isSelected(`nested-order-driver-${order.id}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted/50"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(`nested-order-driver-${order.id}`, Number(order.totalDriverPay) || 0, "driverPay", Number(order.mileage) || 0);
                        }}
                      >
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrency(order.totalDriverPay || 0)}
                        </span>
                      </div>
                      <div 
                        className={`text-right cursor-pointer select-none transition-colors px-1 rounded ${
                          isSelected(`nested-order-freight-${order.id}`) 
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500" 
                            : "hover:bg-muted/50"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(`nested-order-freight-${order.id}`, Number(order.totalFreightAmountNoLumper) || 0, "freightAmount", Number(order.mileage) || 0);
                        }}
                      >
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrency(order.totalFreightAmountNoLumper || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/orders/${order.id}/edit`;
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {renderAdditionalPayIcon(order)}
                        {renderRescheduledIcon(order)}
                        {renderMissingPodIcon(order)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          
          {/* Cell selection summary - fixed bottom right */}
          {hasSelection && (
            <div className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-lg p-3 min-w-[280px]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Cell Selection Summary</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sum:</span>
                  <span className="font-medium">{formatCurrency(summary.totalSum)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average:</span>
                  <span className="font-medium">{formatCurrency(summary.average)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Miles:</span>
                  <span className="font-medium">{summary.totalMiles.toLocaleString()}</span>
                </div>
                {summary.totalMiles > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RPM:</span>
                    <span className="font-medium">${summary.rpm.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
