import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Loader2, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { formatCurrency } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";

interface NestedDriverTripsDropdownProps {
  driverName: string;
  driverId?: string;
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

export function NestedDriverTripsDropdown({ driverName, driverId }: NestedDriverTripsDropdownProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
          }),
          { miles: 0, driverPay: 0 }
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
    // Navigate to trips page with the driver name in search
    navigate(`/trips`);
    // Set the search filter in localStorage so Trips page picks it up
    localStorage.setItem("trips_searchFilter", driverName);
    setOpen(false);
    // Trigger page reload to pick up the new filter
    window.location.reload();
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
        className="w-[700px] p-0 bg-popover" 
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
        
        <ScrollArea className="h-[400px]">
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
                  {/* Week header */}
                  <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Week: {format(week.weekStartDate, "MMM d")} - {format(week.weekEndDate, "MMM d, yyyy")}
                    </span>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{week.totals.miles.toLocaleString()} mi</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(week.totals.driverPay)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Orders table */}
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="py-1 px-2">Load #</TableHead>
                        <TableHead className="py-1 px-2">Truck</TableHead>
                        <TableHead className="py-1 px-2">Pickup</TableHead>
                        <TableHead className="py-1 px-2">Delivery</TableHead>
                        <TableHead className="py-1 px-2 text-right">Miles</TableHead>
                        <TableHead className="py-1 px-2 text-right">Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {week.orders.map((order: any) => (
                        <TableRow 
                          key={order.id} 
                          className="text-xs hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            navigate(`/orders/${order.id}/edit`);
                            setOpen(false);
                          }}
                        >
                          <TableCell className="py-1.5 px-2 font-medium">
                            {formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            {order.truckNumber}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <div>{formatDateDisplay(order.pickupDate)}</div>
                            <div className="text-muted-foreground">{order.pickupCity}, {order.pickupState}</div>
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <div>{formatDateDisplay(order.deliveryDate)}</div>
                            <div className="text-muted-foreground">{order.deliveryCity}, {order.deliveryState}</div>
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right">
                            {(order.mileage || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right text-green-600 dark:text-green-400">
                            {formatCurrency(order.totalDriverPay || 0)}
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
