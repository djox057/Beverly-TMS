import { useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Loader2, ExternalLink, Edit, CalendarClock, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";
import { cn, formatCurrency } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { format, startOfWeek, endOfWeek } from "date-fns";
import moneyStackIcon from "@/assets/money-stack.png";
import { useCellSelection } from "@/hooks/useCellSelection";
import { CellSelectionSummary } from "@/components/CellSelectionSummary";
import { getTripsGridVariant, tripsGridCols } from "@/components/trips/tripsGrid";

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
  /** Make nested Edit match the main Trips rows */
  onEditOrder?: (orderId: string) => void;
  /** Reuse the main Trips paid-toggle confirmation flow */
  onOrderPaidToggle?: (orderId: string, currentPaid: boolean, loadNumber: string) => void;
  colSpan: number;
  /** Match Trips page columns when the optional drag column exists */
  showMoveColumn?: boolean;
  /** Match Trips page columns when the optional Paid column exists */
  showPaidColumn?: boolean;
}

export function NestedDriverTripsInlineContent({
  driverName,
  driverId,
  onSearchDriver,
  onEditOrder,
  onOrderPaidToggle,
  colSpan,
  showMoveColumn = false,
  showPaidColumn = false,
}: NestedDriverTripsInlineContentProps) {
  // Use the EXACT same selection hook + summary UI as the main Trips page
  const { selectedCellsArray, toggleCell, clearSelection, isSelected } = useCellSelection();

  const gridVariant = useMemo(
    () => getTripsGridVariant({ showMoveColumn, showPaidColumn }),
    [showMoveColumn, showPaidColumn],
  );

  const gridColsClass = tripsGridCols[gridVariant];

  const gridRowClass = useCallback(
    (...extra: (string | undefined | false)[]) =>
      cn("grid items-center gap-0", gridColsClass, ...extra),
    [gridColsClass],
  );

  const cellBase = "px-4 min-w-0";

  const weekLabelSpan = showMoveColumn ? 8 : 7;

  const { data: orders, isLoading } = useQuery({
    queryKey: ["nested-driver-trips-inline", driverName, driverId],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          `
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
        `,
        )
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

      return transformed.filter((order) => {
        const orderDriverName = order.driverName?.toLowerCase() || "";
        const searchName = driverName.toLowerCase();
        return orderDriverName.includes(searchName) || searchName.includes(orderDriverName);
      });
    },
    staleTime: 30000,
  });

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((order) => {
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
          { miles: 0, driverPay: 0, freightAmount: 0 },
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
    onSearchDriver?.(driverName);
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
              className={cn(
                "h-4 w-4 object-contain",
                !isPositive && "grayscale brightness-75 hue-rotate-180",
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold mb-1">{isPositive ? "Additional Pay" : "Reduced Pay"}</div>
          <div className={cn("font-semibold", isPositive ? "text-green-600 dark:text-green-400" : "text-destructive")}>
            {isPositive ? "+" : ""}
            {formatCurrency(difference)}
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
            <CalendarClock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 max-w-xs text-xs" align="start">
          <div className="font-semibold mb-1">Rescheduled</div>
          <div className="text-muted-foreground whitespace-pre-wrap">{(order as any).dateChangeNotes}</div>
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
          <div className="text-muted-foreground">No proof of delivery uploaded.</div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0 border-l-4 border-l-yellow-500 bg-background">
        <div className="py-2">
          {/* Header */}
          <div className="flex items-center justify-between py-2 px-4 border-b border-border">
            <div className="font-semibold text-sm">Trips for {driverName}</div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleOpenInTrips}>
              <ExternalLink className="h-3 w-3" />
              Open in Trips
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No trips found for this driver</div>
          ) : (
            <div className="space-y-3 px-2 pt-2">
              {groupedByWeek.map((week) => (
                <div key={week.weekStart} className="border rounded-lg overflow-hidden bg-card">
                  {/* Week summary bar - EXACT Trips header columns */}
                  <div className={gridRowClass("bg-muted/50 border-b text-xs")}>
                    {showMoveColumn && <div className={cellBase} />}

                    <div
                      className={cn(cellBase, "font-semibold text-sm py-2")}
                      style={{ gridColumn: `span ${weekLabelSpan} / span ${weekLabelSpan}` }}
                    >
                      Week: {format(week.weekStartDate, "MMM d")} - {format(week.weekEndDate, "MMM d, yyyy")}
                    </div>

                    {/* Miles */}
                    <div
                      className={cn(
                        cellBase,
                        "py-2 text-right cursor-pointer select-none rounded-sm",
                        isSelected(`week-miles-${week.weekStart}`)
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                          : "hover:bg-muted",
                      )}
                      onClick={() => toggleCell(`week-miles-${week.weekStart}`, week.totals.miles, "miles")}
                    >
                      {week.totals.miles.toLocaleString()} mi
                    </div>

                    {/* Broker Name + Broker Load# (blank in week bar, but keeps alignment) */}
                    <div className={cn(cellBase, "py-2")} />
                    <div className={cn(cellBase, "py-2")} />

                    {/* Driver Pay */}
                    <div
                      className={cn(
                        cellBase,
                        "py-2 text-right font-medium cursor-pointer select-none rounded-sm",
                        isSelected(`week-driver-${week.weekStart}`)
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                          : "hover:bg-muted",
                      )}
                      onClick={() =>
                        toggleCell(`week-driver-${week.weekStart}`, week.totals.driverPay, "driverPay", week.totals.miles)
                      }
                    >
                      <span className="text-green-600 dark:text-green-400">{formatCurrency(week.totals.driverPay)}</span>
                    </div>

                    {/* Freight */}
                    <div
                      className={cn(
                        cellBase,
                        "py-2 text-right font-medium cursor-pointer select-none rounded-sm",
                        isSelected(`week-freight-${week.weekStart}`)
                          ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                          : "hover:bg-muted",
                      )}
                      onClick={() =>
                        toggleCell(`week-freight-${week.weekStart}`, week.totals.freightAmount, "freightAmount", week.totals.miles)
                      }
                    >
                      <span className="text-green-600 dark:text-green-400">{formatCurrency(week.totals.freightAmount)}</span>
                    </div>

                    {showPaidColumn && <div className={cn(cellBase, "py-2 text-center")} />}


                    {/* Actions (blank in week bar) */}
                    <div className={cn(cellBase, "py-2")} />
                  </div>

                  {/* Column headers - EXACT Trips header columns */}
                  <div className={gridRowClass("bg-yellow-100/50 dark:bg-yellow-800/30 text-xs border-b")}> 
                    {showMoveColumn && <div className={cn(cellBase, "py-1.5")} />}
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Truck#</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Driver</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Load#</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Pickup Date</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Pickup City</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Delivery Date</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Delivery City</div>
                    <div className={cn(cellBase, "py-1.5 font-medium text-right")}>Miles</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Broker Name</div>
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Broker Load#</div>
                    <div className={cn(cellBase, "py-1.5 font-medium text-right")}>Driver Pay</div>
                    <div className={cn(cellBase, "py-1.5 font-medium text-right")}>Freight Amt</div>
                    {showPaidColumn && <div className={cn(cellBase, "py-1.5 font-medium text-center")}>Paid</div>}
                    <div className={cn(cellBase, "py-1.5 font-medium")}>Actions</div>
                  </div>

                  {/* Orders rows - EXACT Trips header columns */}
                  {week.orders.map((order: any, orderIndex: number) => (
                    <div
                      key={order.id}
                      className={gridRowClass(
                        "text-xs h-12 border-b last:border-b-0",
                        getRowClassName(order, orderIndex),
                      )}
                    >
                      {showMoveColumn && <div className={cellBase} />}

                      <div className={cn(cellBase, "font-medium truncate")}>{order.truckNumber || ""}</div>
                      <div className={cn(cellBase, "truncate")}>{driverName}</div>
                      <div className={cn(cellBase, "font-medium")}>{formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}</div>
                      <div className={cellBase}>{formatDateDisplay(order.pickupDate)}</div>
                      <div className={cn(cellBase, "truncate")}> 
                        <span>{order.pickupCity}</span>
                        {order.pickupState && <span className="text-muted-foreground">, {order.pickupState}</span>}
                      </div>
                      <div className={cellBase}>{formatDateDisplay(order.deliveryDate)}</div>
                      <div className={cn(cellBase, "truncate")}> 
                        <span>{order.deliveryCity}</span>
                        {order.deliveryState && <span className="text-muted-foreground">, {order.deliveryState}</span>}
                      </div>

                      {/* Miles */}
                      <div
                        className={cn(
                          cellBase,
                          "text-right cursor-pointer select-none transition-colors rounded-sm",
                          isSelected(`nested-order-miles-${order.id}`)
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                            : "hover:bg-muted/50",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(`nested-order-miles-${order.id}`, Number(order.mileage) || 0, "miles");
                        }}
                      >
                        {(order.mileage || 0).toLocaleString()}
                      </div>

                      <div className={cn(cellBase, "truncate")} title={order.brokerName || ""}>
                        {order.brokerName || ""}
                      </div>
                      <div className={cn(cellBase, "truncate")} title={order.brokerLoadNumber || ""}>
                        {order.brokerLoadNumber || ""}
                      </div>

                      {/* Driver Pay */}
                      <div
                        className={cn(
                          cellBase,
                          "text-right cursor-pointer select-none transition-colors rounded-sm",
                          isSelected(`nested-order-driver-${order.id}`)
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                            : "hover:bg-muted/50",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(
                            `nested-order-driver-${order.id}`,
                            Number(order.totalDriverPay) || 0,
                            "driverPay",
                            Number(order.mileage) || 0,
                          );
                        }}
                      >
                        <span className="text-green-600 dark:text-green-400">{formatCurrency(order.totalDriverPay || 0)}</span>
                      </div>

                      {/* Freight */}
                      <div
                        className={cn(
                          cellBase,
                          "text-right cursor-pointer select-none transition-colors rounded-sm",
                          isSelected(`nested-order-freight-${order.id}`)
                            ? "bg-blue-200 dark:bg-blue-800 ring-1 ring-blue-500"
                            : "hover:bg-muted/50",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCell(
                            `nested-order-freight-${order.id}`,
                            Number(order.totalFreightAmountNoLumper) || 0,
                            "freightAmount",
                            Number(order.mileage) || 0,
                          );
                        }}
                      >
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrency(order.totalFreightAmountNoLumper || 0)}
                        </span>
                      </div>

                      {showPaidColumn && (
                        <div className={cn(cellBase, "text-center")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-center">
                            <Checkbox
                              checked={(order as any).paid === true}
                              disabled={!onOrderPaidToggle}
                              onCheckedChange={() =>
                                onOrderPaidToggle?.(
                                  order.id,
                                  (order as any).paid === true,
                                  String((order as any).loadNumber ?? (order as any).internalLoadNumber ?? "")
                                )
                              }
                              aria-label={`Mark load ${String((order as any).loadNumber ?? "")} as ${(order as any).paid ? "unpaid" : "paid"}`}
                            />
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className={cn(cellBase, "flex items-center justify-center gap-0.5")}> 
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEditOrder) {
                              onEditOrder(order.id);
                              return;
                            }
                            // Fallback: keep behavior consistent with Trips rows
                            localStorage.setItem("returnToTrips", "true");
                            window.location.href = `/edit-order/${order.id}`;
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

          <CellSelectionSummary selectedCellsArray={selectedCellsArray} onClear={clearSelection} />
        </div>
      </TableCell>
    </TableRow>
  );
}

