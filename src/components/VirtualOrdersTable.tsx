import { useRef, memo, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Lock,
  LockOpen,
  XCircle,
  Calculator,
  Undo2,
  Edit,
  Loader2,
  CalendarClock,
  Square,
} from "lucide-react";
import moneyStackIcon from "@/assets/money-stack.png";
import lumperReceiptIcon from "@/assets/lumper-receipt-icon.png";
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { hasUpdateTracking } from "@/utils/orderChangeTracker";

const ROW_HEIGHT = 64; // h-16 = 4rem = 64px
const OVERSCAN = 5;

interface VirtualOrdersTableProps {
  orders: any[];
  primaryRole: string;
  selectionMode: boolean;
  selectedOrderIds: Set<string>;
  orderIdsWithMissingLumperRC: Set<string>;
  recalculatingOrder: string | null;
  onToggleOrderSelection: (orderId: string) => void;
  onToggleSelectAll: () => void;
  onSetSelectionMode: (mode: boolean) => void;
  onNavigateToEdit: (orderId: string) => void;
  onToggleLock: (orderId: string, currentLocked: boolean) => void;
  onCancelOrder: (orderId: string) => void;
  onRevertCancellation: (orderId: string) => void;
  onRecalculateMiles: (orderId: string) => void;
  onOpenNotes: (notes: string) => void;
  onOpenPaidConfirm: (orderId: string, currentPaid: boolean) => void;
  onOpenLumperMissing: (data: { orderId: string; driverId: string; driverName: string }) => void;
  hasRole: (role: string) => boolean;
  canCancelOrders: boolean;
}

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

// Memoized row component for performance
const OrderRow = memo(({ 
  order, 
  index,
  style,
  primaryRole,
  selectionMode,
  isSelected,
  hasMissingLumperRC,
  isRecalculating,
  onToggleSelection,
  onNavigateToEdit,
  onToggleLock,
  onCancelOrder,
  onRevertCancellation,
  onRecalculateMiles,
  onOpenNotes,
  onOpenPaidConfirm,
  onOpenLumperMissing,
  hasRole,
  canCancelOrders,
}: {
  order: any;
  index: number;
  style: React.CSSProperties;
  primaryRole: string;
  selectionMode: boolean;
  isSelected: boolean;
  hasMissingLumperRC: boolean;
  isRecalculating: boolean;
  onToggleSelection: () => void;
  onNavigateToEdit: () => void;
  onToggleLock: () => void;
  onCancelOrder: () => void;
  onRevertCancellation: () => void;
  onRecalculateMiles: () => void;
  onOpenNotes: () => void;
  onOpenPaidConfirm: () => void;
  onOpenLumperMissing: () => void;
  hasRole: (role: string) => boolean;
  canCancelOrders: boolean;
}) => {
  const isRecovery = order.isRecovery;
  const isCanceled = order.canceled;
  const freightAmount = Number(order.freightAmount) || 0;
  const totalFreight = Number(order.totalFreightAmount) || 0;
  const lumper = Number(order.lumper) || 0;
  const escortFee = Number(order.escortFee) || 0;
  const hasLumperOrEscort = lumper > 0 || escortFee > 0;
  const hasAdditionalPay = totalFreight > freightAmount;
  const hasReducedPay = totalFreight < freightAmount;
  const hasOrangeCondition = order.canceled || (order.dateChangeNotes && order.dateChangeNotes.trim() !== "");
  
  const isEvenRow = index % 2 === 1;
  const alternatingBg = isEvenRow 
    ? "bg-muted/50 hover:bg-muted/50 dark:bg-muted/30 dark:hover:bg-muted/30" 
    : "bg-background hover:bg-background";

  const rowClassName = isRecovery
    ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_90%)] dark:hover:bg-[hsl(270_50%_25%)]"
    : hasLumperOrEscort
      ? "bg-[hsl(50_95%_88%)] dark:bg-[hsl(50_75%_25%)] hover:bg-[hsl(50_95%_88%)] dark:hover:bg-[hsl(50_75%_25%)]"
      : hasReducedPay
        ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_90%)] dark:hover:bg-[hsl(0_62%_25%)]"
        : hasAdditionalPay
          ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_90%)] dark:hover:bg-[hsl(120_40%_25%)]"
          : hasOrangeCondition
            ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_90%)] dark:hover:bg-[hsl(25_75%_30%)]"
            : alternatingBg;

  const pickups = order.pickupDrops?.filter((pd: any) => pd.type === "pickup") || [];
  const deliveries = order.pickupDrops?.filter((pd: any) => pd.type === "delivery") || [];
  const firstPickup = pickups.length > 0 ? pickups.reduce((earliest: any, pd: any) => 
    !earliest || new Date(pd.datetime) < new Date(earliest.datetime) ? pd : earliest, null) : null;
  const lastDelivery = deliveries.length > 0 ? deliveries.reduce((latest: any, pd: any) => 
    !latest || new Date(pd.datetime) > new Date(latest.datetime) ? pd : latest, null) : null;

  const hasRc = order.orderFiles?.some((f: any) => f.file_category === "RC");
  const hasPod = order.orderFiles?.some((f: any) => f.file_category === "POD");
  const displayTruckNumber = order.truckNumber || order.deletedTruckNumber || "-";
  const displayDriverName = order.driverName || order.deletedDriver1Name || "-";

  return (
    <TableRow 
      style={style}
      className={`h-16 ${rowClassName} flex items-center`}
    >
      {/* Selection / Icons cell */}
      <TableCell className="w-[60px] min-w-[60px] max-w-[60px] px-1 flex items-center gap-0">
        {selectionMode && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelection}
            className="mr-1"
            aria-label={`Select load ${order.loadNumber}`}
          />
        )}
        {isCanceled && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-lg leading-none cursor-default">🚫</span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Canceled</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {(hasAdditionalPay || hasReducedPay) && (
          <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
            <img 
              src={moneyStackIcon} 
              alt={hasAdditionalPay ? "Additional pay" : "Reduced pay"} 
              className={`h-5 w-5 object-contain ${!hasAdditionalPay ? "grayscale brightness-75 hue-rotate-180" : ""}`}
            />
          </Button>
        )}
        {order.dateChangeNotes && order.dateChangeNotes.trim() !== "" && (
          <CalendarClock className="h-5 w-5 text-orange-500" />
        )}
        {hasMissingLumperRC && (
          <button className="inline-flex p-1" onClick={onOpenLumperMissing}>
            <img src={lumperReceiptIcon} alt="Lumper Receipt" className="h-4 w-4 cursor-pointer" />
          </button>
        )}
      </TableCell>

      {/* Truck # */}
      <TableCell className="w-[80px] min-w-[80px] max-w-[80px] font-medium truncate">
        {displayTruckNumber}
      </TableCell>

      {/* Driver */}
      <TableCell className="w-[120px] min-w-[120px] max-w-[120px] truncate">
        {displayDriverName}
      </TableCell>

      {/* Load # */}
      <TableCell className="w-[80px] min-w-[80px] max-w-[80px] truncate">
        <span className={order.locked ? "text-blue-500 font-medium" : ""}>
          {order.internalLoadNumber ? formatInternalLoadNumber(order.internalLoadNumber, order.truckCompanyName) : "-"}
        </span>
      </TableCell>

      {/* Pickup Date */}
      <TableCell className="w-[100px] min-w-[100px] max-w-[100px] truncate">
        {firstPickup?.datetime ? formatDateNoTimezone(firstPickup.datetime) : "-"}
      </TableCell>

      {/* Pickup City */}
      <TableCell className="w-[140px] min-w-[140px] max-w-[140px] truncate">
        {firstPickup ? `${firstPickup.city || ""}, ${firstPickup.state || ""}` : "-"}
      </TableCell>

      {/* Delivery Date */}
      <TableCell className="w-[100px] min-w-[100px] max-w-[100px] truncate">
        {lastDelivery?.datetime ? formatDateNoTimezone(lastDelivery.datetime) : "-"}
      </TableCell>

      {/* Delivery City */}
      <TableCell className="w-[140px] min-w-[140px] max-w-[140px] truncate">
        {lastDelivery ? `${lastDelivery.city || ""}, ${lastDelivery.state || ""}` : "-"}
      </TableCell>

      {/* Miles */}
      <TableCell className="w-[60px] min-w-[60px] max-w-[60px] truncate">
        {order.mileage || "-"}
      </TableCell>

      {/* Broker Name */}
      <TableCell className="w-[140px] min-w-[140px] max-w-[140px] truncate">
        {order.brokerName || "-"}
      </TableCell>

      {/* Broker Load # */}
      <TableCell className="w-[110px] min-w-[110px] max-w-[110px] truncate">
        {order.brokerLoadNumber || "-"}
      </TableCell>

      {/* Invoiced */}
      <TableCell className="w-[70px] min-w-[70px] max-w-[70px] text-center">
        {order.invoiced ? "✓" : "-"}
      </TableCell>

      {/* Notes */}
      <TableCell className="w-[100px] min-w-[100px] max-w-[100px]">
        {order.notes ? (
          <Button variant="ghost" size="sm" onClick={onOpenNotes} className="text-xs truncate max-w-[90px]">
            View
          </Button>
        ) : "-"}
      </TableCell>

      {/* Driver Pay */}
      <TableCell className="w-[90px] min-w-[90px] max-w-[90px] truncate">
        {formatCurrency(order.totalDriverPay || 0)}
      </TableCell>

      {/* Freight Amount */}
      <TableCell className="w-[100px] min-w-[100px] max-w-[100px] truncate">
        {formatCurrency(order.totalFreightAmount || 0)}
      </TableCell>

      {/* Company */}
      <TableCell className="w-[100px] min-w-[100px] max-w-[100px] truncate">
        {order.bookedByCompanyName || "-"}
      </TableCell>

      {/* Booked By */}
      <TableCell className="w-[90px] min-w-[90px] max-w-[90px] truncate">
        {order.bookedBy?.split("-")[0]?.trim() || "-"}
      </TableCell>

      {/* RC */}
      <TableCell className="w-[90px] min-w-[90px] max-w-[90px] text-center">
        {hasRc ? <Badge className="bg-success text-success-foreground">✓</Badge> : <Badge variant="destructive">✗</Badge>}
      </TableCell>

      {/* POD */}
      <TableCell className="w-[90px] min-w-[90px] max-w-[90px] text-center">
        {hasPod ? <Badge className="bg-success text-success-foreground">✓</Badge> : <Badge variant="destructive">✗</Badge>}
      </TableCell>

      {/* Actions */}
      <TableCell className="w-[160px] min-w-[160px] max-w-[160px]">
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={onNavigateToEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {(hasRole("admin") || hasRole("accounting") || hasRole("manager")) && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={onToggleLock}>
                      {order.locked ? <Lock className="h-4 w-4 text-blue-500" /> : <LockOpen className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{order.locked ? "Unlock" : "Lock"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={onRecalculateMiles} disabled={isRecalculating}>
                      {isRecalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Recalculate Miles</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          {canCancelOrders && !order.canceled && !order.locked && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onCancelOrder}>
                    <XCircle className="h-4 w-4 text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel Load</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {order.canceled && (hasRole("admin") || hasRole("accounting") || hasRole("manager")) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onRevertCancellation}>
                    <Undo2 className="h-4 w-4 text-orange-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Revert Cancellation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>

      {/* Paid */}
      {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && (
        <TableCell className="w-[80px] min-w-[80px] max-w-[80px] text-center">
          <Checkbox
            checked={order.paid === true}
            onCheckedChange={onOpenPaidConfirm}
            aria-label={`Mark load ${order.loadNumber} as paid`}
          />
        </TableCell>
      )}
    </TableRow>
  );
});

OrderRow.displayName = "OrderRow";

export const VirtualOrdersTable = memo(({
  orders,
  primaryRole,
  selectionMode,
  selectedOrderIds,
  orderIdsWithMissingLumperRC,
  recalculatingOrder,
  onToggleOrderSelection,
  onToggleSelectAll,
  onSetSelectionMode,
  onNavigateToEdit,
  onToggleLock,
  onCancelOrder,
  onRevertCancellation,
  onRecalculateMiles,
  onOpenNotes,
  onOpenPaidConfirm,
  onOpenLumperMissing,
  hasRole,
  canCancelOrders,
}: VirtualOrdersTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="w-full">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[60px] min-w-[60px] max-w-[60px]">
              {selectionMode ? (
                <Checkbox
                  checked={orders.length > 0 && selectedOrderIds.size === orders.length}
                  onCheckedChange={onToggleSelectAll}
                  aria-label="Select all"
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onSetSelectionMode(true)}
                  title="Enable selection mode"
                >
                  <Square className="h-4 w-4" />
                </Button>
              )}
            </TableHead>
            <TableHead className="w-[80px] min-w-[80px] max-w-[80px] whitespace-nowrap">Truck #</TableHead>
            <TableHead className="w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap">Driver</TableHead>
            <TableHead className="w-[80px] min-w-[80px] max-w-[80px] whitespace-nowrap">Load #</TableHead>
            <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Pickup Date</TableHead>
            <TableHead className="w-[140px] min-w-[140px] max-w-[140px] whitespace-nowrap">Pickup City</TableHead>
            <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Delivery Date</TableHead>
            <TableHead className="w-[140px] min-w-[140px] max-w-[140px] whitespace-nowrap">Delivery City</TableHead>
            <TableHead className="w-[60px] min-w-[60px] max-w-[60px] whitespace-nowrap">Miles</TableHead>
            <TableHead className="w-[140px] min-w-[140px] max-w-[140px] whitespace-nowrap">Broker Name</TableHead>
            <TableHead className="w-[110px] min-w-[110px] max-w-[110px] whitespace-nowrap">Broker Load #</TableHead>
            <TableHead className="w-[70px] min-w-[70px] max-w-[70px] whitespace-nowrap">Invoiced</TableHead>
            <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Notes</TableHead>
            <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap">Driver Pay</TableHead>
            <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Freight Amt</TableHead>
            <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Company</TableHead>
            <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap">Booked By</TableHead>
            <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap text-center">RC</TableHead>
            <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap text-center">POD</TableHead>
            <TableHead className="w-[160px] min-w-[160px] max-w-[160px] whitespace-nowrap text-center">Actions</TableHead>
            {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && (
              <TableHead className="w-[80px] min-w-[80px] max-w-[80px] whitespace-nowrap text-center">Paid</TableHead>
            )}
          </TableRow>
        </TableHeader>
      </Table>
      
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: "calc(100vh - 400px)", minHeight: "400px" }}
      >
        <div style={{ height: totalSize, width: "100%", position: "relative" }}>
          {orders.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No orders found
            </div>
          ) : (
            virtualItems.map((virtualRow) => {
              const order = orders[virtualRow.index];
              return (
                <OrderRow
                  key={order.id}
                  order={order}
                  index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "flex",
                    alignItems: "center",
                  }}
                  primaryRole={primaryRole}
                  selectionMode={selectionMode}
                  isSelected={selectedOrderIds.has(order.id)}
                  hasMissingLumperRC={orderIdsWithMissingLumperRC.has(order.id)}
                  isRecalculating={recalculatingOrder === order.id}
                  onToggleSelection={() => onToggleOrderSelection(order.id)}
                  onNavigateToEdit={() => onNavigateToEdit(order.id)}
                  onToggleLock={() => onToggleLock(order.id, order.locked)}
                  onCancelOrder={() => onCancelOrder(order.id)}
                  onRevertCancellation={() => onRevertCancellation(order.id)}
                  onRecalculateMiles={() => onRecalculateMiles(order.id)}
                  onOpenNotes={() => onOpenNotes(order.notes || "")}
                  onOpenPaidConfirm={() => onOpenPaidConfirm(order.id, order.paid === true)}
                  onOpenLumperMissing={() => onOpenLumperMissing({
                    orderId: order.id,
                    driverId: order.driver1Id || "",
                    driverName: order.driverName || "Unknown",
                  })}
                  hasRole={hasRole}
                  canCancelOrders={canCancelOrders}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

VirtualOrdersTable.displayName = "VirtualOrdersTable";
