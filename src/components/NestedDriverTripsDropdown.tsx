import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Loader2, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { formatCurrency } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { format, startOfWeek, endOfWeek } from "date-fns";

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

export function NestedDriverTripsDropdown({ driverName, driverId, onSearchDriver }: NestedDriverTripsDropdownProps) {
  const [open, setOpen] = useState(false);

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

  // Group orders by week
  const groupedByWeek = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const groups: { [key: string]: any[] } = {};

    orders.forEach((order) => {
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
  }, [orders]);

  const handleOpenInTrips = () => {
    if (onSearchDriver) {
      onSearchDriver(driverName);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        className="w-[950px] p-0 bg-popover" 
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
        
        <ScrollArea className="h-[450px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders && orders.length === 0 ? (
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
                      <span>{week.totals.miles.toLocaleString()} mi</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(week.totals.driverPay)}
                      </span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(week.totals.freightAmount)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Orders table - matches Trips page columns */}
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-yellow-200/50 dark:bg-yellow-800/50">
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Truck#</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Load#</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Pickup Date</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Pickup City</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Delivery Date</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Delivery City</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap">Miles</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Broker</TableHead>
                        <TableHead className="py-1.5 px-2 whitespace-nowrap">Broker Load#</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap">Driver Pay</TableHead>
                        <TableHead className="py-1.5 px-2 text-right whitespace-nowrap">Freight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {week.orders.map((order: any) => (
                        <TableRow 
                          key={order.id} 
                          className="text-xs hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            window.open(`/orders/${order.id}/edit`, '_blank');
                          }}
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
                          <TableCell className="py-1.5 px-2 text-right">
                            {(order.mileage || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 truncate max-w-[100px]" title={order.brokerName}>
                            {order.brokerName || "-"}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 truncate max-w-[80px]" title={order.brokerLoadNumber}>
                            {order.brokerLoadNumber || "-"}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right text-green-600 dark:text-green-400">
                            {formatCurrency(order.totalDriverPay || 0)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right text-green-600 dark:text-green-400">
                            {formatCurrency(order.totalFreightAmountNoLumper || 0)}
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