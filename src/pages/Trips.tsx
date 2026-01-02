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
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Loader2, FileDown, Edit, Info, CalendarClock } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, getDay, addDays } from "date-fns";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rebuildWorkbookClean } from "@/utils/excel/rebuildWorkbookClean";

// Legacy cleanup function (kept for reference)
const cleanupWorksheet = (worksheet: ExcelJS.Worksheet, maxRow: number, maxCol: number = 12) => {
  // no-op
};

// Fuel transaction type
type FuelTransaction = {
  id?: string;
  transaction_number: string;
  transaction_date: string;
  location_name: string | null;
  city: string | null;
  state: string | null;
  item: string | null;
  fees: number;
  unit_price: number;
  quantity: number;
  amount: number;
};

// Helper to parse date string to Date object without timezone shift
const parseDateNoTimezoneToDate = (dateStr: string): Date | null => {
  try {
    const normalizedStr = String(dateStr).replace(" ", "T");
    const datePart = normalizedStr.split("T")[0];
    if (!datePart) return null;
    return new Date(datePart + "T12:00:00");
  } catch (e) {
    return null;
  }
};

// Helper to find the last delivery date from a list of orders
const findLastDeliveryDate = (orders: any[]): Date | null => {
  const deliveryDates: Date[] = [];

  orders.forEach((order) => {
    if (order.deliveryDate) {
      const date = parseDateNoTimezoneToDate(order.deliveryDate);
      if (date) deliveryDates.push(date);
    }
  });

  if (deliveryDates.length === 0) return null;

  // Sort dates and return the last one
  deliveryDates.sort((a, b) => a.getTime() - b.getTime());
  return deliveryDates[deliveryDates.length - 1];
};

// Helper to fetch the previous week's last delivery for a truck
const fetchPreviousWeekLastDelivery = async (
  truckId: string,
  currentWeekMonday: Date
): Promise<Date | null> => {
  // Calculate previous week range (Monday to Sunday before current week)
  const prevWeekMonday = addDays(currentWeekMonday, -7);
  const prevWeekSunday = addDays(currentWeekMonday, -1);

  // Query orders for this truck with deliveries in the previous week
  // NOTE: We don't rely on order.status here because delivery completion is represented by delivery_datetime.
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      delivery_datetime,
      truck_id,
      pickup_drops!inner(datetime, type)
    `)
    .eq("truck_id", truckId)
    .not("delivery_datetime", "is", null);

  if (error) {
    console.error("Error fetching previous week orders:", error);
    return null;
  }

  

  if (!orders || orders.length === 0) return null;

  // Filter orders to only those with delivery in the previous week
  const prevWeekDeliveries: Date[] = [];

  orders.forEach((order: any) => {
    // Get delivery datetime from pickup_drops or order level
    let deliveryDate: Date | null = null;

    // First try to get from pickup_drops
    const dropStops = order.pickup_drops?.filter((pd: any) => pd.type === "drop") || [];
    if (dropStops.length > 0) {
      const lastDrop = dropStops.sort((a: any, b: any) => 
        (b.datetime || "").localeCompare(a.datetime || "")
      )[0];
      if (lastDrop?.datetime) {
        deliveryDate = parseDateNoTimezoneToDate(lastDrop.datetime);
      }
    }

    // Fallback to order delivery_datetime
    if (!deliveryDate && order.delivery_datetime) {
      deliveryDate = parseDateNoTimezoneToDate(order.delivery_datetime);
    }

    if (deliveryDate) {
      // Check if delivery is within previous week
      if (deliveryDate >= prevWeekMonday && deliveryDate <= prevWeekSunday) {
        prevWeekDeliveries.push(deliveryDate);
      }
    }
  });

  if (prevWeekDeliveries.length === 0) return null;

  // Return the last delivery date from previous week
  prevWeekDeliveries.sort((a, b) => a.getTime() - b.getTime());
  return prevWeekDeliveries[prevWeekDeliveries.length - 1];
};

// Helper to calculate fuel date range based on the new logic:
// - Fuel start: Previous week's last delivery date (or current week Monday if none)
// - Fuel end: Current week's last delivery date - 1 day
const calculateFuelDateRange = (
  previousWeekLastDelivery: Date | null,
  currentWeekLastDelivery: Date | null,
  currentWeekMonday: Date
): { fuelStart: Date; fuelEnd: Date } | null => {
  // If no delivery in current week → return null (no fuel)
  if (!currentWeekLastDelivery) return null;

  // Fuel start: previous week last delivery OR current week Monday if none
  const fuelStart = previousWeekLastDelivery || currentWeekMonday;

  // Fuel end: current week last delivery - 1 day
  const fuelEnd = addDays(currentWeekLastDelivery, -1);

  // If fuel end is before fuel start (edge case), return null
  if (fuelEnd < fuelStart) return null;

  return { fuelStart, fuelEnd };
};

// Helper to fetch fuel transactions for a truck within a date range
const fetchFuelTransactionsForTruck = async (
  truckNumber: string,
  startDate: Date,
  endDate: Date
): Promise<FuelTransaction[]> => {
  const { data, error } = await supabase
    .from("fuel_transactions")
    .select("id, transaction_number, transaction_date, location_name, city, state, item, fees, unit_price, quantity, amount")
    .eq("truck_number", truckNumber)
    .gte("transaction_date", format(startDate, "yyyy-MM-dd"))
    .lte("transaction_date", format(endDate, "yyyy-MM-dd"))
    .order("transaction_date", { ascending: true });

  if (error) {
    console.error("Error fetching fuel transactions:", error);
    return [];
  }

  return data || [];
};

// Function to fetch fuel transactions for a statement using the new logic:
// - Fuel start: Previous week's last delivery date (or current week Monday if none)
// - Fuel end: Current week's last delivery date - 1 day
const fetchFuelTransactionsForStatement = async (
  truckNumber: string,
  truckId: string,
  orders: any[],
  currentWeekMonday: Date
): Promise<FuelTransaction[]> => {
  // Find current week's last delivery from the orders
  const currentWeekLastDelivery = findLastDeliveryDate(orders);

  // If no delivery in current week, return empty
  if (!currentWeekLastDelivery) {
    console.log("No deliveries found in current week - no fuel to fetch");
    return [];
  }

  // Fetch previous week's last delivery
  const previousWeekLastDelivery = await fetchPreviousWeekLastDelivery(truckId, currentWeekMonday);

  // Calculate fuel range with new logic
  const fuelRange = calculateFuelDateRange(
    previousWeekLastDelivery,
    currentWeekLastDelivery,
    currentWeekMonday
  );

  if (!fuelRange) {
    console.log("Could not calculate valid fuel range");
    return [];
  }

  console.log(`Fuel range: ${format(fuelRange.fuelStart, "yyyy-MM-dd")} to ${format(fuelRange.fuelEnd, "yyyy-MM-dd")}`);

  // Fetch fuel transactions within the calculated range only
  return await fetchFuelTransactionsForTruck(truckNumber, fuelRange.fuelStart, fuelRange.fuelEnd);
};

// Helper to write fuel transactions to worksheet
const writeFuelTransactionsToWorksheet = (
  worksheet: ExcelJS.Worksheet,
  fuelTransactions: FuelTransaction[],
  startRow: number,
  endRow: number
) => {
  let currentRow = startRow;
  fuelTransactions.forEach((fuel) => {
    if (currentRow > endRow) return;

    // A: transaction_number
    worksheet.getCell(`A${currentRow}`).value = fuel.transaction_number || "";

    // B: transaction_date
    worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(fuel.transaction_date);

    // C: location_name
    worksheet.getCell(`C${currentRow}`).value = fuel.location_name || "";

    // D: city
    worksheet.getCell(`D${currentRow}`).value = fuel.city || "";

    // E: state
    worksheet.getCell(`E${currentRow}`).value = fuel.state || "";

    // F: fees
    const feesCell = worksheet.getCell(`F${currentRow}`);
    feesCell.value = parseFloat(String(fuel.fees)) || 0;
    feesCell.numFmt = "$#,##0.00";

    // G: item
    worksheet.getCell(`G${currentRow}`).value = fuel.item || "";

    // H: unit_price - set to amount when quantity is 1, rounded to 2 decimals
    const quantity = parseFloat(String(fuel.quantity)) || 0;
    const amount = parseFloat(String(fuel.amount)) || 0;
    const unitPrice = (quantity === 1 || quantity === 1.0) ? amount : (parseFloat(String(fuel.unit_price)) || 0);
    const unitPriceCell = worksheet.getCell(`H${currentRow}`);
    unitPriceCell.value = Math.round(unitPrice * 100) / 100;
    unitPriceCell.numFmt = "$#,##0.00";

    // I: quantity
    const quantityCell = worksheet.getCell(`I${currentRow}`);
    quantityCell.value = quantity;
    quantityCell.numFmt = "#,##0.00";

    // J: amount
    const amountCell = worksheet.getCell(`J${currentRow}`);
    amountCell.value = amount;
    amountCell.numFmt = "$#,##0.00";

    currentRow++;
  });
};

// Helper to format datetime strings without timezone conversion
// Extracts date parts directly from the string (Chicago time)
const formatDateDisplay = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  try {
    // Normalize the string - replace space with T for consistent parsing
    const normalizedStr = String(dateStr).replace(" ", "T");
    
    // Extract date parts directly from the ISO string (YYYY-MM-DD)
    const datePart = normalizedStr.split("T")[0];
    if (!datePart) return "";
    
    const [year, month, day] = datePart.split("-");
    if (!year || !month || !day) return "";
    
    return `${month}/${day}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

// Helper to sort orders ascending by date for statements
const sortOrdersAscending = (orders: any[]) => {
  return [...orders].sort((a, b) => {
    const getDateValue = (dateStr: string | null | undefined): number => {
      if (!dateStr) return 0;
      const normalizedStr = String(dateStr).replace(" ", "T");
      const datePart = normalizedStr.split("T")[0];
      return datePart ? new Date(datePart + "T12:00:00").getTime() : 0;
    };
    const dateA = getDateValue(a.deliveryDate) || getDateValue(a.pickupDate);
    const dateB = getDateValue(b.deliveryDate) || getDateValue(b.pickupDate);
    return dateA - dateB; // Oldest first (ascending)
  });
};

// Type for EFS deductions (cash advances and other requests)
type EfsDeduction = {
  description: string;
  date: string;
  amount: number;
};

// Function to fetch EFS deductions (cash advances and other requests) for a driver within a week
const fetchEfsDeductionsForStatement = async (
  driverId: string,
  weekStartDate: Date,
  weekEndDate: Date
): Promise<EfsDeduction[]> => {
  const deductions: EfsDeduction[] = [];
  
  if (!driverId) return deductions;
  
  const weekStartISO = format(weekStartDate, "yyyy-MM-dd");
  const weekEndISO = format(addDays(weekEndDate, 1), "yyyy-MM-dd"); // Include the end date
  
  // Fetch cash advances for the driver within the week
  const { data: cashAdvances, error: cashError } = await supabase
    .from("driver_cash_advances")
    .select("amount, requested_at")
    .eq("driver_id", driverId)
    .gte("requested_at", weekStartISO)
    .lt("requested_at", weekEndISO)
    .order("requested_at", { ascending: true });
  
  if (cashError) {
    console.error("Error fetching cash advances:", cashError);
  } else if (cashAdvances) {
    cashAdvances.forEach((ca: any) => {
      deductions.push({
        description: "EFS Money Code-Cash advance",
        date: formatDateDisplay(ca.requested_at),
        amount: Math.abs(Number(ca.amount) || 0),
      });
    });
  }
  
  // Fetch EFS other requests for the driver within the week
  const { data: efsOther, error: efsError } = await supabase
    .from("efs_other_requests")
    .select("amount, purpose, requested_at")
    .eq("driver_id", driverId)
    .gte("requested_at", weekStartISO)
    .lt("requested_at", weekEndISO)
    .order("requested_at", { ascending: true });
  
  if (efsError) {
    console.error("Error fetching EFS other requests:", efsError);
  } else if (efsOther) {
    efsOther.forEach((efs: any) => {
      deductions.push({
        description: efs.purpose || "EFS Other",
        date: formatDateDisplay(efs.requested_at),
        amount: Math.abs(Number(efs.amount) || 0),
      });
    });
  }
  
  return deductions;
};

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
  const navigate = useNavigate();

  const { data: orders, isLoading } = useOrders();

  const [currentPage, setCurrentPage] = useState(1);
  const [truckFilter, setTruckFilter] = useState(() => {
    return localStorage.getItem("trips_truckFilter") || "";
  });
  const [driverFilter, setDriverFilter] = useState(() => {
    return localStorage.getItem("trips_driverFilter") || "";
  });
  const itemsPerPage = 50;

  const queryClient = useQueryClient();

  // Fetch paid status from database
  const { data: paidWeeksData } = useQuery({
    queryKey: ["trips-paid-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips_paid_status")
        .select("*");
      
      if (error) throw error;
      
      // Convert to a map for quick lookup
      const paidMap: Record<string, boolean> = {};
      data?.forEach((row: any) => {
        const key = `${row.truck_number}_${row.driver_name}_${row.week_start}`;
        paidMap[key] = row.is_paid;
      });
      return paidMap;
    },
  });

  // Mutation to toggle paid status
  const togglePaidMutation = useMutation({
    mutationFn: async ({ truckNumber, truckId, driverName, weekStart, weekOrders, isPaid }: { 
      truckNumber: string; 
      truckId: string;
      driverName: string; 
      weekStart: string;
      weekOrders: any[];
      isPaid: boolean;
    }) => {
      // Update the trip paid status
      const { error } = await supabase
        .from("trips_paid_status")
        .upsert({
          truck_number: truckNumber || "unknown",
          driver_name: driverName || "unknown",
          week_start: weekStart,
          is_paid: isPaid,
        }, {
          onConflict: "truck_number,driver_name,week_start",
        });
      
      if (error) throw error;

      // Also update fuel transactions paid status
      if (truckNumber && truckId) {
        const currentWeekMonday = new Date(weekStart + "T12:00:00");
        
        // Get fuel transactions using the same logic as for statements
        const fuelTransactions = await fetchFuelTransactionsForStatement(
          truckNumber,
          truckId,
          weekOrders,
          currentWeekMonday
        );

        // Update fuel transactions paid status
        if (fuelTransactions.length > 0) {
          const fuelIds = fuelTransactions.map(f => f.id);
          const { error: fuelError } = await supabase
            .from("fuel_transactions")
            .update({ paid: isPaid })
            .in("id", fuelIds);

          if (fuelError) {
            console.error("Error updating fuel paid status:", fuelError);
          } else {
            console.log(`Set ${fuelIds.length} fuel transactions to paid=${isPaid}`);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips-paid-status"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
    },
    onError: (error) => {
      console.error("Error toggling paid status:", error);
      toast.error("Failed to update paid status");
    },
  });

  // State for paid confirmation dialog
  const [paidConfirmDialog, setPaidConfirmDialog] = useState<{
    open: boolean;
    truckNumber: string;
    truckId: string;
    driverName: string;
    weekStart: string;
    weekOrders: any[];
    newPaidStatus: boolean;
  } | null>(null);

  // Show confirmation dialog before toggling paid status
  const handlePaidToggle = (truckNumber: string, truckId: string, driverName: string, weekStart: string, weekOrders: any[]) => {
    const currentStatus = isWeekPaid(truckNumber, driverName, weekStart);
    setPaidConfirmDialog({
      open: true,
      truckNumber,
      truckId,
      driverName,
      weekStart,
      weekOrders,
      newPaidStatus: !currentStatus,
    });
  };

  // Confirm paid status toggle
  const confirmPaidToggle = () => {
    if (paidConfirmDialog) {
      togglePaidMutation.mutate({
        truckNumber: paidConfirmDialog.truckNumber,
        truckId: paidConfirmDialog.truckId,
        driverName: paidConfirmDialog.driverName,
        weekStart: paidConfirmDialog.weekStart,
        weekOrders: paidConfirmDialog.weekOrders,
        isPaid: paidConfirmDialog.newPaidStatus,
      });
      setPaidConfirmDialog(null);
    }
  };

  // Check if a week is paid
  const isWeekPaid = (truckNumber: string, driverName: string, weekStart: string) => {
    const key = `${truckNumber || "unknown"}_${driverName || "unknown"}_${weekStart}`;
    return paidWeeksData?.[key] || false;
  };

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem("trips_truckFilter", truckFilter);
  }, [truckFilter]);

  useEffect(() => {
    localStorage.setItem("trips_driverFilter", driverFilter);
  }, [driverFilter]);

  // Expand orders to include all transfer segments
  const expandedOrders = useMemo(() => {
    if (!orders) return [];
    
    const result: any[] = [];
    
    orders.forEach((order) => {
      // Check if this order has order_transfers records AND is still a recovery load
      // After reverting, is_recovery becomes false so we should show as single row
      const hasTransfers = order.order_transfers && order.order_transfers.length > 0 && order.isRecovery;
      
      if (hasTransfers) {
        const transfers = Array.isArray(order.order_transfers)
          ? [...order.order_transfers].sort((a: any, b: any) => a.sequence_number - b.sequence_number)
          : [];

        // Build set of sequence numbers already in order_transfers
        const existingSeq = new Set<number>(transfers.map((t: any) => Number(t.sequence_number)));
        
        // Track which sequences we've added to prevent duplicates
        const addedSequences = new Set<number>();
        const segments: any[] = [];

        // Legacy check: some multi-transfer loads may only have seq >= 2 in order_transfers
        const legacyIsRecoveryLoad = !!order.originalDriver1Id && (
          (order.originalDriverPrice && order.originalDriverPrice > 0) ||
          (order.originalMiles && order.originalMiles > 0)
        );

        // Add legacy Original (seq 0) if not in order_transfers
        if (legacyIsRecoveryLoad && !existingSeq.has(0) && !addedSequences.has(0)) {
          addedSequences.add(0);
          segments.push({
            ...order,
            virtualId: `${order.id}_legacy_transfer_0`,
            transferSequence: 0,
            transferBadge: "Orig",
            isOriginalDriverPortion: true,
            isRecoveryDriverPortion: false,
            driverName: order.originalDriver1Name,
            driver1Name: order.originalDriver1Name,
            driver1Id: order.originalDriver1Id,
            driver2Name: order.originalDriver2Name,
            driver2Id: order.originalDriver2Id,
            truckNumber: order.originalTruckNumber || order.truckNumber,
            truckId: order.originalTruckId || order.truckId,
            trailerNumber: order.originalTrailerNumber || order.trailerNumber,
            trailerId: order.originalTrailerId || order.trailerId,
            totalDriverPay: order.originalDriverPrice || 0,
            driverPrice: order.originalDriverPrice || 0,
            mileage: order.originalMiles || 0,
            totalFreightAmount: order.totalFreightAmount,
          });
        }

        // Add legacy Rec (seq 1) if not in order_transfers
        if (legacyIsRecoveryLoad && !existingSeq.has(1) && !addedSequences.has(1)) {
          addedSequences.add(1);
          // Get recovery driver info from recovery_history if available
          const recoveryHistory = Array.isArray(order.recoveryHistory) && order.recoveryHistory.length > 0 
            ? order.recoveryHistory[0] 
            : null;
          const recDriverName = recoveryHistory?.recoveryDriver1?.name || recoveryHistory?.recoveryDriver1Name;
          const recTruckNumber = recoveryHistory?.recoveryTruck?.truck_number || recoveryHistory?.recoveryTruckNumber;
          const recTrailerNumber = recoveryHistory?.recoveryTrailer?.trailer_number || recoveryHistory?.recoveryTrailerNumber;
          
          // Use recovery_date for legacy Rec segment if available
          const recDeliveryDate = order.recoveryDate || order.deliveryDatetime;
          
          segments.push({
            ...order,
            virtualId: `${order.id}_legacy_transfer_1`,
            transferSequence: 1,
            transferBadge: "Rec",
            isOriginalDriverPortion: false,
            isRecoveryDriverPortion: true,
            // Use recovery_history data for driver/truck/trailer, NOT current order values
            driverName: recDriverName || "Unknown",
            driver1Name: recDriverName,
            truckNumber: recTruckNumber || order.truckNumber,
            trailerNumber: recTrailerNumber || order.trailerNumber,
            totalDriverPay: order.recoveryDriverPrice || order.totalDriverPay,
            driverPrice: order.recoveryDriverPrice || order.driverPrice,
            mileage: order.recoveryMiles || order.mileage,
            transferNote: `Original: Driver: ${order.originalDriver1Name || "N/A"}, Truck: ${order.originalTruckNumber || "N/A"}, Trailer: ${order.originalTrailerNumber || "N/A"}`,
            // Override delivery date with recovery date
            deliveryDatetime: recDeliveryDate,
            deliveryDate: recDeliveryDate,
          });
        }

        // Add all transfers from order_transfers (skip duplicates)
        transfers.forEach((transfer: any) => {
          const seq = Number(transfer.sequence_number);
          if (addedSequences.has(seq)) return; // Skip if already added
          addedSequences.add(seq);

          const isOriginal = seq === 0;
          const badge = isOriginal ? "Orig" : seq === 1 ? "Rec" : `Transfer ${seq}`;
          // Use transfer's datetime for the delivery date if available
          const transferDeliveryDate = transfer.transfer_datetime || order.deliveryDatetime;
          
          segments.push({
            ...order,
            virtualId: `${order.id}_transfer_${seq}`,
            transferSequence: seq,
            transferBadge: badge,
            isOriginalDriverPortion: isOriginal,
            isRecoveryDriverPortion: seq === 1,
            driver1Id: transfer.driver1_id,
            driver2Id: transfer.driver2_id,
            driverName: transfer.driver1?.name || transfer.manual_driver_name || order.driverName,
            driver1Name: transfer.driver1?.name || transfer.manual_driver_name,
            driver2Name: transfer.driver2?.name,
            truckId: transfer.truck_id,
            truckNumber: transfer.truck?.truck_number || transfer.manual_truck_number || order.truckNumber,
            trailerId: transfer.trailer_id,
            trailerNumber: transfer.trailer?.trailer_number || transfer.manual_trailer_number || order.trailerNumber,
            mileage: transfer.miles || 0,
            totalDriverPay: transfer.driver_price || 0,
            driverPrice: transfer.driver_price || 0,
            // Override delivery date with transfer's specific datetime
            deliveryDatetime: transferDeliveryDate,
            deliveryDate: transferDeliveryDate,
          });
        });

        segments
          .sort((a, b) => (a.transferSequence ?? 0) - (b.transferSequence ?? 0))
          .forEach((seg) => result.push(seg));
      } else {
        // Legacy: Split into Orig/Rec only if the order is still marked as recovery.
        // Some revert flows may leave original_* fields populated, but those should NOT
        // create extra trip rows once is_recovery is false.
        const isRecoveryLoad = !!order.isRecovery && !!order.originalDriver1Id && (
          (order.originalDriverPrice && order.originalDriverPrice > 0) ||
          (order.originalMiles && order.originalMiles > 0)
        );
        
        if (isRecoveryLoad) {
          // For recovery driver (current driver): use recovery miles/pay if available
          result.push({
            ...order,
            isRecoveryDriverPortion: true,
            transferBadge: "Rec",
            transferSequence: 1,
            // Use recovery-specific values if available, otherwise use full values
            totalDriverPay: order.recoveryDriverPrice || order.totalDriverPay,
            driverPrice: order.recoveryDriverPrice || order.driverPrice,
            mileage: order.recoveryMiles || order.mileage,
            // Build transfer note with recovery driver info
            transferNote: `Driver: ${order.driverName || 'N/A'}, Truck: ${order.truckNumber || 'N/A'}, Trailer: ${order.trailerNumber || 'N/A'}`,
          });
          
          // Create a virtual entry for the original driver's portion
          result.push({
            ...order,
            virtualId: `${order.id}_original`,
            // Mark as original driver portion
            isOriginalDriverPortion: true,
            transferBadge: "Orig",
            transferSequence: 0,
            // Override driver info with original driver
            driverName: order.originalDriver1Name,
            driver1Name: order.originalDriver1Name,
            driver1Id: order.originalDriver1Id,
            driver2Name: order.originalDriver2Name,
            driver2Id: order.originalDriver2Id,
            // Override truck/trailer with original if available
            truckNumber: order.originalTruckNumber || order.truckNumber,
            truckId: order.originalTruckId || order.truckId,
            trailerNumber: order.originalTrailerNumber || order.trailerNumber,
            trailerId: order.originalTrailerId || order.trailerId,
            // Use original driver's pay and miles
            totalDriverPay: order.originalDriverPrice || 0,
            driverPrice: order.originalDriverPrice || 0,
            mileage: order.originalMiles || 0,
            // Show full freight amount for original driver portion
            totalFreightAmount: order.totalFreightAmount,
          });
        } else {
          // Non-recovery order - add as-is
          result.push(order);
        }
      }
    });
    
    return result;
  }, [orders]);

  // Filter orders based on truck and driver filters
  const filteredOrders =
    expandedOrders?.filter((order) => {
      const matchesTruck = !truckFilter || order.truckNumber?.toLowerCase() === truckFilter.toLowerCase();

      const matchesDriver = !driverFilter || order.driverName?.toLowerCase().includes(driverFilter.toLowerCase());

      // Exclude orders with both freight amount and driver pay equal to 0
      const hasValue =
        (order.totalFreightAmount && order.totalFreightAmount !== 0) ||
        (order.totalDriverPay && order.totalDriverPay !== 0);

      return matchesTruck && matchesDriver && hasValue;
    }) || [];

  // Pagination - paginate individual orders first
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Group paginated orders by week (Monday-Sunday)
  const groupedByWeek = useMemo(() => {
    const groups: { [key: string]: any[] } = {};

    // Helper to parse date string without timezone conversion
    const parseDateNoTimezone = (dateStr: string): Date | null => {
      try {
        // Normalize the string - replace space with T for consistent parsing
        const normalizedStr = String(dateStr).replace(" ", "T");
        const datePart = normalizedStr.split("T")[0];
        if (!datePart) return null;
        
        const [year, month, day] = datePart.split("-").map(Number);
        if (!year || !month || !day) return null;
        
        // Create date at noon to avoid any DST edge cases
        return new Date(year, month - 1, day, 12, 0, 0);
      } catch (e) {
        return null;
      }
    };

    paginatedOrders.forEach((order) => {
      if (order.deliveryDate) {
        try {
          const deliveryDate = parseDateNoTimezone(String(order.deliveryDate));
          
          if (!deliveryDate || isNaN(deliveryDate.getTime())) {
            console.error("Invalid date:", order.deliveryDate);
            return;
          }

          const weekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 }); // Tuesday
          const weekKey = format(weekStart, "yyyy-MM-dd");

          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(order);
        } catch (e) {
          console.error("Error parsing date:", e, "for order:", order.deliveryDate);
        }
      }
    });

    // Sort weeks by date (newest first)
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => ({
        weekStart: weekKey,
        orders: groups[weekKey].sort((a, b) => {
          // Extract dates without timezone for sorting
          const getDateValue = (dateStr: string | null | undefined): number => {
            if (!dateStr) return 0;
            const normalizedStr = String(dateStr).replace(" ", "T");
            const datePart = normalizedStr.split("T")[0];
            return datePart ? new Date(datePart + "T12:00:00").getTime() : 0;
          };
          const dateA = getDateValue(a.deliveryDate) || getDateValue(a.pickupDate);
          const dateB = getDateValue(b.deliveryDate) || getDateValue(b.pickupDate);
          return dateB - dateA; // Newest first
        }),
      }));
  }, [paginatedOrders]);

  const exportWeekToExcel = async (week: any, weekStartDate: Date, weekEndDate: Date) => {
    try {
      // Get the first order to determine driver/truck info
      const firstOrder = week.orders[0];
      if (!firstOrder) {
        toast.error("No orders to export");
        return;
      }

      // Fetch driver and company info
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select(
          "name, company_id, company_name, agreement_start_date, weekly_payment, weeks_count, companies!drivers_company_id_fkey(name)",
        )
        .eq("id", firstOrder.driver1Id)
        .single();

      if (driverError) {
        console.error("Error fetching driver:", driverError);
      }

      const companyName = driver?.companies?.name || "";

      // Use template based on company name
      if (companyName === "BF Prime United LLC") {
        await exportBFPrimeTemplate(week, weekStartDate, weekEndDate, firstOrder, driver);
      } else if (
        companyName === "BF Prime Drivers LLC" ||
        companyName === "BF Prime Trucks LLC" ||
        companyName === "BF Prime LLC"
      ) {
        await exportBFPrimeDriversTemplate(week, weekStartDate, weekEndDate, firstOrder, driver);
      } else if (companyName === "Beverly Freight Inc") {
        await exportBeverlyFreightTemplate(week, weekStartDate, weekEndDate, firstOrder, driver);
      } else if (companyName === "BG Prime Inc") {
        await exportBGPrimeIncTemplate(week, weekStartDate, weekEndDate, firstOrder, driver);
      } else {
        // Use the old export method for other companies
        exportGenericExcel(week, weekStartDate, weekEndDate);
      }
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export to Excel");
    }
  };


  const exportBFPrimeDriversTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      // Load the BF Prime Drivers template
      const response = await fetch(new URL("../assets/templates/BF_Prime.xlsx", import.meta.url).toString());
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("Template worksheet not found");
      }

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      // Fetch and update invoice number from database
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bf_prime_drivers")
        .single();

      if (configError) {
        console.error("Error fetching invoice config:", configError);
        throw new Error("Failed to fetch invoice configuration");
      }

      const today = new Date();
      const lastMonday = new Date(configData.last_monday);
      const currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

      let invoiceNumber = configData.current_number;

      if (currentMonday > lastMonday) {
        invoiceNumber += 1;
        await supabase
          .from("invoice_number_config")
          .update({
            current_number: invoiceNumber,
            last_monday: currentMonday.toISOString(),
          })
          .eq("statement_type", "bf_prime_drivers");
      }

      // F3: Invoice number
      const f3Cell = worksheet.getCell("F3");
      f3Cell.value = invoiceNumber;
      f3Cell.font = { bold: true, size: 16 };

      // F4: Thursday date (2 weeks in the future)
      const thursday = addDays(weekStartDate, 18); // 14 days + 4 days to Thursday
      const f4Cell = worksheet.getCell("F4");
      f4Cell.value = format(thursday, "MM/dd/yyyy");
      f4Cell.font = { size: 16 };

      // B12: Week date range
      const b12Cell = worksheet.getCell("B12");
      b12Cell.value = `${format(weekStartDate, "MM/dd/yyyy")} - ${format(weekEndDate, "MM/dd/yyyy")}`;
      b12Cell.font = { bold: true, size: 16 };

      // K3: Agreement start date
      if (driver?.agreement_start_date) {
        const k3Cell = worksheet.getCell("K3");
        k3Cell.value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
        k3Cell.font = { size: 16 };
      }

      // F7: Driver's company name (the company the driver has/owns, NOT the company they drive for)
      const f7Cell = worksheet.getCell("F7");
      f7Cell.value = driver?.company_name || "";
      f7Cell.font = { size: 16 };

      // F5 AND K4: Truck number
      const truckNumber = firstOrder.truckNumber || "";
      const f5Cell = worksheet.getCell("F5");
      f5Cell.value = truckNumber;
      f5Cell.font = { size: 16 };
      const k4Cell = worksheet.getCell("K4");
      k4Cell.value = truckNumber;
      k4Cell.font = { size: 16 };

      // K5: Weekly payment/weeks count
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const k5Cell = worksheet.getCell("K5");
        k5Cell.value = `${weeksPassed}/${driver.weeks_count}`;
        k5Cell.font = { bold: true, size: 16 };
      }

      // J7: Driver name
      const j7Cell = worksheet.getCell("J7");
      j7Cell.value = driver?.name || "";
      j7Cell.font = { size: 16 };

      // Clear all shared formulas in the trips section first (rows 14-20)
      for (let row = 14; row <= 20; row++) {
        ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${row}`);
          if (cell.model.sharedFormula) {
            delete cell.model.sharedFormula;
          }
        });
      }

      // Trips Rows 14-20 - Only base driver pay (driverPrice), not totalDriverPay
      let currentRow = 14;
      sortedOrders.forEach((order: any) => {
        if (currentRow > 20) return;

        // A: Internal load number
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";

        // B: Pickup date
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);

        // C: Pickup city
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";

        // D: Pickup state
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";

        // E: Delivery date
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);

        // F: Delivery city
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";

        // G: Delivery state
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";

        // H: Mileage
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;

        // I: Driver pay - BASE ONLY (driverPrice, not totalDriverPay)
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.driverPrice) || 0;
        cellI.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply USD currency format to Trips section Column I (rows 14-20)
      for (let row = 14; row <= 20; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Apply USD currency format to Fuel section Column I (rows 48-66)
      for (let row = 48; row <= 66; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Collect positive additionals (Credits) from all orders
      const credits: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper
          });
        }
        const otherCharges = Number(order.otherChargesDriver) || 0;
        if (otherCharges > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges
          });
        }
      });

      // Write credits section (rows 25-27 for BF Prime Drivers)
      let creditsRow = 25;
      credits.forEach((credit) => {
        if (creditsRow > 27) return; // Credits section is 25-27
        worksheet.getCell(`B${creditsRow}`).value = credit.internalLoadNumber;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions
      const negativeAdditionals: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee
          });
        }
      });

      // Deductions section (rows 32-43 for BF Prime Drivers)
      // Fixed deductions at the start
      const deductions = [
        { row: 32, description: "Cargo Insurance", amount: 250.0 },
        { row: 33, description: "Trailer + Insurance", amount: 285.0 },
        { row: 34, description: "ELD", amount: 50.0 },
        { row: 35, description: "Pre-Pass", amount: 20.0 },
        { row: 36, description: "Truck Payment" },
        { row: 37, description: "Truck Insurance", amount: 195.0 },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const descCell = worksheet.getCell(`B${row}`);
        descCell.value = description;
        descCell.font = { bold: true, size: 16 };

        if (amount !== undefined) {
          const amtCell = worksheet.getCell(`J${row}`);
          amtCell.value = amount;
          amtCell.numFmt = "$#,##0.00";
        }
      });

      // Set J36 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j36Cell = worksheet.getCell("J36");
        j36Cell.value = driver.weekly_payment;
        j36Cell.numFmt = "$#,##0.00";
      }

      // Write negative additionals after fixed deductions (rows 38-43)
      let negativeRow = 38;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 43) return; // Deductions section ends at 43
        worksheet.getCell(`B${negativeRow}`).value = neg.internalLoadNumber;
        worksheet.getCell(`C${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write EFS deductions (cash advances and other requests) after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 43) return; // Deductions section ends at 43
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write fuel transactions (rows 48-66 for BF Prime)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate
      );
      writeFuelTransactionsToWorksheet(worksheet, fuelTransactions, 48, 66);

      // Generate filename
      const driverName = driver?.name?.replace(/\s+/g, "_") || "Unknown";
      const weekStart = format(weekStartDate, "MM-dd-yyyy");
      const weekEnd = format(weekEndDate, "MM-dd-yyyy");
      const filename = `${driverName}_Statement_${weekStart}_to_${weekEnd}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 73, 12);
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success("Statement exported successfully");
    } catch (error) {
      console.error("Error exporting BF Prime Drivers template:", error);
      toast.error("Failed to export statement");
    }
  };

  const exportBeverlyFreightTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      // Load the Beverly Freight Inc template
      const response = await fetch(new URL("../assets/templates/Beverly_Freight.xlsx", import.meta.url).toString());
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("Template worksheet not found");
      }

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      // Fetch and update invoice number from database
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "beverly_freight_inc")
        .single();

      if (configError) {
        console.error("Error fetching invoice config:", configError);
        throw new Error("Failed to fetch invoice configuration");
      }

      const today = new Date();
      const lastMonday = new Date(configData.last_monday);
      const currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

      let invoiceNumber = configData.current_number;

      if (currentMonday > lastMonday) {
        invoiceNumber += 1;
        await supabase
          .from("invoice_number_config")
          .update({
            current_number: invoiceNumber,
            last_monday: currentMonday.toISOString(),
          })
          .eq("statement_type", "beverly_freight_inc");
      }

      // F3: Invoice number (Statement #)
      const f3Cell = worksheet.getCell("F3");
      f3Cell.value = invoiceNumber;
      f3Cell.font = { bold: true, size: 16 };

      // F4: Thursday date (2 weeks in the future)
      const thursday = addDays(weekStartDate, 18); // 14 days + 4 days to Thursday
      const f4Cell = worksheet.getCell("F4");
      f4Cell.value = format(thursday, "MM/dd/yyyy");
      f4Cell.font = { size: 16 };

      // B12: Week date range (Trips: row)
      const b12Cell = worksheet.getCell("B12");
      b12Cell.value = `${format(weekStartDate, "MM/dd/yyyy")} - ${format(weekEndDate, "MM/dd/yyyy")}`;
      b12Cell.font = { bold: true, size: 16 };

      // K3: Agreement start date
      if (driver?.agreement_start_date) {
        const k3Cell = worksheet.getCell("K3");
        k3Cell.value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
        k3Cell.font = { size: 16 };
      }

      // F7: Driver's company name (the company the driver has/owns, NOT the company they drive for)
      const f7Cell = worksheet.getCell("F7");
      f7Cell.value = driver?.company_name || "";
      f7Cell.font = { size: 16 };

      // F5 AND K4: Truck number
      const truckNumber = firstOrder.truckNumber || "";
      const f5Cell = worksheet.getCell("F5");
      f5Cell.value = truckNumber;
      f5Cell.font = { size: 16 };
      const k4Cell = worksheet.getCell("K4");
      k4Cell.value = truckNumber;
      k4Cell.font = { size: 16 };

      // K5: Weekly payment/weeks count
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const k5Cell = worksheet.getCell("K5");
        k5Cell.value = `${weeksPassed}/${driver.weeks_count}`;
        k5Cell.font = { bold: true, size: 16 };
      }

      // J7: Driver name
      const j7Cell = worksheet.getCell("J7");
      j7Cell.value = driver?.name || "";
      j7Cell.font = { size: 16 };

      // Clear all shared formulas in the trips section first (rows 14-20)
      for (let row = 14; row <= 20; row++) {
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${row}`);
          if (cell.model.sharedFormula) {
            delete cell.model.sharedFormula;
          }
        });
      }

      // Trips Rows 14-20 - Only base driver pay (driverPrice), not totalDriverPay
      let currentRow = 14;
      sortedOrders.forEach((order: any) => {
        if (currentRow > 20) return;

        // A: Trip No. (Internal load number)
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";

        // B: Pickup date
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);

        // C: Pickup city
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";

        // D: Pickup state
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";

        // E: Delivery date
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);

        // F: Delivery city
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";

        // G: Delivery state
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";

        // H: Mileage
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;

        // I: Driver Pay - BASE ONLY (driverPrice, not totalDriverPay)
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.driverPrice) || 0;
        cellI.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply USD currency format to Trips section Column I (rows 14-20)
      for (let row = 14; row <= 20; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Apply USD currency format to Fuel section Column I (rows 49-63)
      for (let row = 49; row <= 63; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Set J column formulas for rows 14-20 (=SUM(I{row}*0.88))
      for (let row = 14; row <= 20; row++) {
        const cellJ = worksheet.getCell(`J${row}`);
        cellJ.value = { formula: `SUM(I${row}*0.88)` };
        cellJ.numFmt = "$#,##0.00";
      }

      // Collect positive additionals (Credits) from all orders
      const credits: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper
          });
        }
        const otherCharges = Number(order.otherChargesDriver) || 0;
        if (otherCharges > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges
          });
        }
      });

      // Write credits section (rows 25-27 for Beverly Freight)
      let creditsRow = 25;
      credits.forEach((credit) => {
        if (creditsRow > 27) return; // Credits section is 25-27
        worksheet.getCell(`B${creditsRow}`).value = credit.internalLoadNumber;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions
      const negativeAdditionals: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee
          });
        }
      });

      // Deductions section (rows 32-44 for Beverly Freight)
      const deductions = [
        { row: 32, description: "Cargo Insurance", amount: 250.0 },
        { row: 33, description: "Trailer + Insurance", amount: 285.0 },
        { row: 34, description: "ELD", amount: 50.0 },
        { row: 35, description: "Pre-Pass", amount: 20.0 },
        { row: 36, description: "Truck payment" },
        { row: 37, description: "Truck insurance", amount: 195.0 },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const descCell = worksheet.getCell(`B${row}`);
        descCell.value = description;
        descCell.font = { bold: true, size: 16 };

        if (amount !== undefined) {
          const amtCell = worksheet.getCell(`J${row}`);
          amtCell.value = amount;
          amtCell.numFmt = "$#,##0.00";
        }
      });

      // Set J36 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j36Cell = worksheet.getCell("J36");
        j36Cell.value = driver.weekly_payment;
        j36Cell.numFmt = "$#,##0.00";
      }

      // Write negative additionals after fixed deductions (rows 38-44)
      let negativeRow = 38;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 44) return; // Deductions section ends at 44
        worksheet.getCell(`B${negativeRow}`).value = neg.internalLoadNumber;
        worksheet.getCell(`C${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write EFS deductions (cash advances and other requests) after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 44) return; // Deductions section ends at 44
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write fuel transactions (rows 49-63 for Beverly Freight)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate
      );
      writeFuelTransactionsToWorksheet(worksheet, fuelTransactions, 49, 63);

      // Generate filename
      const driverName = driver?.name?.replace(/\s+/g, "_") || "Unknown";
      const weekStart = format(weekStartDate, "MM-dd-yyyy");
      const weekEnd = format(weekEndDate, "MM-dd-yyyy");
      const filename = `${driverName}_Beverly_Freight_Statement_${weekStart}_to_${weekEnd}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70, 12);
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success("Statement exported successfully");
    } catch (error) {
      console.error("Error exporting Beverly Freight template:", error);
      const message = error instanceof Error ? error.message : "Failed to export statement";
      toast.error(message);
    }
  };

  const exportBGPrimeIncTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      // Load the BG Prime Inc template
      const response = await fetch(new URL("../assets/templates/BG_Inc.xlsx", import.meta.url).toString());
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("Template worksheet not found");
      }

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      // Fetch and update invoice number from database
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bg_prime_inc")
        .single();

      let invoiceNumber = 1332; // Default starting number

      if (!configError && configData) {
        // Calculate the Monday of the week for weekStartDate
        const currentMonday = startOfWeek(weekStartDate, { weekStartsOn: 1 });
        const lastMonday = new Date(configData.last_monday);

        invoiceNumber = configData.current_number;

        // If it's a new week (different Monday), increment the invoice number
        if (currentMonday.getTime() !== lastMonday.getTime()) {
          invoiceNumber = configData.current_number + 1;

          // Update the database with new invoice number and Monday date
          await supabase
            .from("invoice_number_config")
            .update({
              current_number: invoiceNumber,
              last_monday: format(currentMonday, "yyyy-MM-dd"),
            })
            .eq("statement_type", "bg_prime_inc");
        }
      }

      // Find Thursday 2 weeks in the future
      const thursdayDate = addDays(weekStartDate, 18); // 14 days + 4 days to Thursday

      // C7: Statement number
      const c7Cell = worksheet.getCell("C7");
      c7Cell.value = invoiceNumber;

      // C8: Issue date (Thursday 2 weeks in future)
      const c8Cell = worksheet.getCell("C8");
      c8Cell.value = format(thursdayDate, "M/d/yyyy");

      // C9: Pay period (date range)
      const c9Cell = worksheet.getCell("C9");
      c9Cell.value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`;

      // F8: Driver's company name (the company the driver has/owns)
      const f8Cell = worksheet.getCell("F8");
      f8Cell.value = driver?.company_name || "";

      // F9: Driver name
      const f9Cell = worksheet.getCell("F9");
      f9Cell.value = driver?.name || firstOrder.driverName || "";

      // J8: Agreement start date
      if (driver?.agreement_start_date) {
        const j8Cell = worksheet.getCell("J8");
        j8Cell.value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      }

      // J9: Truck number
      const j9Cell = worksheet.getCell("J9");
      j9Cell.value = firstOrder.truckNumber || "";

      // J10: Agreement terms (weekly payment/weeks count)
      if (driver?.weekly_payment && driver?.weeks_count) {
        const j10Cell = worksheet.getCell("J10");
        j10Cell.value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;
      }

      // Clear the trip rows (rows 13-19) by directly setting values to null
      for (let row = 13; row <= 19; row++) {
        worksheet.getCell(`A${row}`).value = null;
        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
        worksheet.getCell(`F${row}`).value = null;
        worksheet.getCell(`G${row}`).value = null;
        worksheet.getCell(`H${row}`).value = null;
        worksheet.getCell(`I${row}`).value = null;
      }

      // Fill in trip details starting at row 13 - BASE ONLY (driverPrice, not totalDriverPay)
      let currentRow = 13;

      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;

        // Driver pay - BASE ONLY (driverPrice, not totalDriverPay)
        const driverPay = parseFloat(order.driverPrice) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = driverPay;
        cellI.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply USD currency format to Trips section Column I (rows 13-19)
      for (let row = 13; row <= 19; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Apply USD currency format to Fuel section Column I (rows 38-44)
      for (let row = 38; row <= 44; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Collect positive additionals (Credits) from all orders
      const credits: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper
          });
        }
        const otherCharges = Number(order.otherChargesDriver) || 0;
        if (otherCharges > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges
          });
        }
      });

      // Write credits section (rows 48-50 for BG Inc)
      let creditsRow = 48;
      credits.forEach((credit) => {
        if (creditsRow > 50) return; // Credits section is 48-50
        worksheet.getCell(`B${creditsRow}`).value = credit.internalLoadNumber;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions
      const negativeAdditionals: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee
          });
        }
      });
      const endDateFormatted = format(weekEndDate, "M/d/yyyy");
      const deductions = [
        { row: 24, description: "Cargo Insurance", amount: 285.0 },
        { row: 25, description: "Trailer + Insurance", amount: 285.0 },
        { row: 26, description: "ELD", amount: 50.0 },
        { row: 27, description: "Pre-Pass", amount: 20.0 },
        { row: 28, description: "Truck Payment" },
        { row: 29, description: "Truck Insurance", amount: 195.0 },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const cellB = worksheet.getCell(`B${row}`);
        cellB.value = description;
        cellB.font = { size: 11 };
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amount !== undefined) {
          const cellJ = worksheet.getCell(`J${row}`);
          cellJ.value = amount;
          cellJ.numFmt = "$#,##0.00";
        }
      });

      // Set weeks passed / total weeks for Truck Payment row
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

        const e28Cell = worksheet.getCell("E28");
        e28Cell.value = `${weeksPassed}/${driver.weeks_count}`;
        e28Cell.font = { bold: true, size: 11 };
      }

      // Set J28 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j28Cell = worksheet.getCell("J28");
        j28Cell.value = driver.weekly_payment;
        j28Cell.numFmt = "$#,##0.00";
      }

      // Write negative additionals after fixed deductions (rows 30-32)
      let negativeRow = 30;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 32) return; // Deductions section ends at 32
        worksheet.getCell(`B${negativeRow}`).value = neg.internalLoadNumber;
        worksheet.getCell(`C${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write EFS deductions (cash advances and other requests) after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 32) return; // Deductions section ends at 32
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write fuel transactions (rows 38-44 for BG Inc)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate
      );
      writeFuelTransactionsToWorksheet(worksheet, fuelTransactions, 38, 44);

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const driverName = driver?.name || firstOrder?.driverName || "";
      const driverInfo = driverName && typeof driverName === "string" ? `_${driverName.replace(/\s+/g, "-")}` : "";
      const filename = `BG_Prime_Inc_${weekRange}${driverInfo}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 61, 12);
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${week.orders.length} trips to Excel`);
    } catch (error) {
      console.error("Error exporting BG Prime Inc template:", error);
      toast.error("Failed to export statement");
    }
  };

  const exportBFPrimeTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      // Load the template
      const response = await fetch(new URL("../assets/templates/BF_Prime_United.xlsx", import.meta.url).toString());
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("Template worksheet not found");
      }

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      // Set row 12 to auto-fit (fit to data)
      worksheet.getRow(12).height = undefined; // Auto-fit

      // Fetch and update invoice number from database
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bf_prime_united")
        .single();

      if (configError) {
        console.error("Error fetching invoice config:", configError);
        throw new Error("Failed to fetch invoice configuration");
      }

      let invoiceNumber = configData.current_number;

      // Calculate the Monday of the week for weekStartDate
      const currentMonday = startOfWeek(weekStartDate, { weekStartsOn: 1 });
      const lastMonday = new Date(configData.last_monday);

      // If it's a new week (different Monday), increment the invoice number
      if (currentMonday.getTime() !== lastMonday.getTime()) {
        invoiceNumber = configData.current_number + 1;

        // Update the database with new invoice number and Monday date
        const { error: updateError } = await supabase
          .from("invoice_number_config")
          .update({
            current_number: invoiceNumber,
            last_monday: format(currentMonday, "yyyy-MM-dd"),
          })
          .eq("statement_type", "bf_prime_united");

        if (updateError) {
          console.error("Error updating invoice config:", updateError);
          throw new Error("Failed to update invoice configuration");
        }
      }

      // Find Thursday 2 weeks in the future
      const thursdayDate = addDays(weekStartDate, 18); // 14 days + 4 days to Thursday

      // Fill in header information
      worksheet.getCell("C2").value = invoiceNumber; // Trips invoice number
      worksheet.getCell("B3").value = format(thursdayDate, "M/d/yyyy"); // Thursday date (2 weeks in future)
      worksheet.getCell("B8").value = driver?.company_name || ""; // Company name from driver
      worksheet.getCell("F7").value = driver?.agreement_start_date
        ? format(new Date(driver.agreement_start_date), "M/d/yyyy")
        : ""; // Agreement start date

      // Weekly payment and weeks count in F9
      if (driver?.weekly_payment && driver?.weeks_count) {
        worksheet.getCell("F9").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;
      }
      worksheet.getCell("C4").value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`; // Date range (moved down 2)
      worksheet.getCell("B7").value = driver?.name || firstOrder.driverName || ""; // Driver name (moved down 1)
      worksheet.getCell("F8").value = firstOrder.truckNumber || ""; // Truck number (moved down 1)

      // Clear the trip rows (rows 13-19) by directly setting values to null
      for (let row = 13; row <= 19; row++) {
        worksheet.getCell(`A${row}`).value = null;
        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
        worksheet.getCell(`F${row}`).value = null;
        worksheet.getCell(`G${row}`).value = null;
        worksheet.getCell(`H${row}`).value = null;
        worksheet.getCell(`I${row}`).value = null;
      }

      // Fill in trip details starting at row 13 - BASE ONLY (driverPrice, not totalDriverPay)
      let currentRow = 13;

      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;

        // Driver pay - BASE ONLY (driverPrice, not totalDriverPay)
        const driverPay = order.driverPrice || 0;

        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(String(driverPay)) || 0;
        cellI.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply USD currency format to Trips section Column I (rows 13-19)
      for (let row = 13; row <= 19; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Apply USD currency format to Fuel section Column I (rows 23-34)
      for (let row = 23; row <= 34; row++) {
        const cell = worksheet.getCell(`I${row}`);
        cell.numFmt = "$#,##0.00";
      }

      // Collect positive additionals (Credits) from all orders
      const credits: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper
          });
        }
        const otherCharges = Number(order.otherChargesDriver) || 0;
        if (otherCharges > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges
          });
        }
      });

      // Write credits section (rows 52-54 for BF Prime United)
      let creditsRow = 52;
      credits.forEach((credit) => {
        if (creditsRow > 54) return; // Credits section is 52-54
        worksheet.getCell(`B${creditsRow}`).value = credit.internalLoadNumber;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions
      const negativeAdditionals: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee
          });
        }
      });
      const endDateFormatted = format(weekEndDate, "M/d/yyyy");
      const deductions = [
        { row: 39, description: "Cargo Insurance", amount: 285.0 },
        { row: 40, description: "Trailer + Insurance", amount: 285.0 },
        { row: 41, description: "ELD", amount: 50.0 },
        { row: 42, description: "Pre-Pass", amount: 20.0 },
        { row: 43, description: "Truck Payment" },
        { row: 44, description: "Truck Insurance", amount: 195.0 },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const cellB = worksheet.getCell(`B${row}`);
        cellB.value = description;
        cellB.font = { size: 16 };
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amount !== undefined) {
          const cellJ = worksheet.getCell(`J${row}`);
          cellJ.value = amount;
          cellJ.numFmt = "$#,##0.00";
        }
      });

      // Set E43: Calculate weeks passed from agreement_start_date
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

        const e43Cell = worksheet.getCell("E43");
        e43Cell.value = `${weeksPassed}/${driver.weeks_count}`;
        e43Cell.font = { bold: true, size: 16 };
      }

      // Set J43 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j43Cell = worksheet.getCell("J43");
        j43Cell.value = driver.weekly_payment;
        j43Cell.numFmt = "$#,##0.00";
      }

      // Write negative additionals after fixed deductions (rows 45-47)
      let negativeRow = 45;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 47) return; // Deductions section ends at 47
        worksheet.getCell(`B${negativeRow}`).value = neg.internalLoadNumber;
        worksheet.getCell(`C${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write EFS deductions (cash advances and other requests) after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 47) return; // Deductions section ends at 47
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write fuel transactions (rows 23-34 for BF Prime United)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate
      );
      writeFuelTransactionsToWorksheet(worksheet, fuelTransactions, 23, 34);

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const driverName = driver?.name || firstOrder?.driverName || "";
      const driverInfo = driverName && typeof driverName === "string" ? `_${driverName.replace(/\s+/g, "-")}` : "";
      const filename = `BF_Prime_${weekRange}${driverInfo}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 67, 12);
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${week.orders.length} trips to Excel`);
    } catch (error) {
      console.error("Error exporting BF Prime template:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportGenericExcel = (week: any, weekStartDate: Date, weekEndDate: Date) => {
    try {
      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);
      // Prepare data for Excel
      const excelData = sortedOrders.map((order: any) => ({
        "Truck #": order.truckNumber || "",
        "Load #": order.internalLoadNumber || "",
        "Pickup Date": formatDateDisplay(order.pickupDate),
        "Pickup City": order.pickupCity || "",
        "Pickup State": order.pickupState || "",
        "Delivery Date": formatDateDisplay(order.deliveryDate),
        "Delivery City": order.deliveryCity || "",
        "Delivery State": order.deliveryState || "",
        Miles: order.mileage || 0,
        "Driver Pay": order.totalDriverPay || 0,
        Driver: order.driverName || "",
        "Broker Name": order.brokerName || "",
        "Broker Load #": order.brokerLoadNumber || "",
        Invoiced: order.invoiced || "",
        "Freight Amount": order.totalFreightAmount || 0,
      }));

      // Calculate totals
      const totals = {
        "Truck #": "",
        "Load #": "",
        "Pickup Date": "",
        "Pickup City": "",
        "Pickup State": "",
        "Delivery Date": "",
        "Delivery City": "",
        "Delivery State": "TOTALS:",
        Miles: week.orders.reduce((acc: number, o: any) => acc + (o.mileage || 0), 0),
        "Driver Pay": week.orders.reduce((acc: number, o: any) => acc + (o.totalDriverPay || 0), 0),
        Driver: "",
        "Broker Name": "",
        "Broker Load #": "",
        Invoiced: "",
        "Freight Amount": week.orders.reduce((acc: number, o: any) => acc + (o.totalFreightAmount || 0), 0),
      };

      // Add totals row
      excelData.push(totals);

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      ws["!cols"] = [
        { wch: 10 }, // Truck #
        { wch: 10 }, // Load #
        { wch: 12 }, // Pickup Date
        { wch: 20 }, // Pickup City
        { wch: 12 }, // Pickup State
        { wch: 12 }, // Delivery Date
        { wch: 20 }, // Delivery City
        { wch: 12 }, // Delivery State
        { wch: 10 }, // Miles
        { wch: 12 }, // Driver Pay
        { wch: 25 }, // Driver
        { wch: 25 }, // Broker Name
        { wch: 15 }, // Broker Load #
        { wch: 10 }, // Invoiced
        { wch: 15 }, // Freight Amount
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Trips");

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const truckInfo = truckFilter ? `_Truck-${truckFilter}` : "";
      const filename = `Trips_Week_${weekRange}${truckInfo}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);

      toast.success(`Exported ${week.orders.length} trips to Excel`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportFinalStatement = async () => {
    try {
      // Require truck or driver filter
      if (!truckFilter && !driverFilter) {
        toast.error("Please filter by truck or driver first");
        return;
      }

      if (filteredOrders.length === 0) {
        toast.error("No orders found for selected filter");
        return;
      }

      // Get first order for driver lookup
      const firstOrder = filteredOrders[0];

      // Find the last paid week for this truck/driver
      let lastPaidWeekStart: Date | null = null;
      
      if (paidWeeksData) {
        const paidKeys = Object.entries(paidWeeksData)
          .filter(([key, isPaid]) => {
            const [truck, driver] = key.split("_");
            const matchesTruck = !truckFilter || truck.toLowerCase() === truckFilter.toLowerCase();
            const matchesDriver = !driverFilter || driver.toLowerCase().includes(driverFilter.toLowerCase());
            return isPaid && matchesTruck && matchesDriver;
          })
          .map(([key]) => {
            const parts = key.split("_");
            return parts[parts.length - 1]; // Get the week_start date
          })
          .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

        if (paidKeys.length > 0) {
          lastPaidWeekStart = new Date(paidKeys[0] + "T12:00:00");
        }
      }

      // Collect orders from last paid week to the most recent
      let finalOrders: any[];
      
      if (lastPaidWeekStart) {
        // Include orders from the last paid week onwards
        finalOrders = filteredOrders.filter((order) => {
          if (!order.deliveryDate) return false;
          const deliveryDate = new Date(order.deliveryDate);
          const orderWeekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 });
          return orderWeekStart >= lastPaidWeekStart!;
        });
      } else {
        // No paid weeks found, include all orders
        finalOrders = [...filteredOrders];
      }

      if (finalOrders.length === 0) {
        toast.error("No unpaid orders found");
        return;
      }

      // Sort orders by delivery date (oldest first for statement)
      finalOrders.sort((a, b) => {
        const dateA = new Date(a.deliveryDate || a.pickupDate).getTime();
        const dateB = new Date(b.deliveryDate || b.pickupDate).getTime();
        return dateA - dateB;
      });

      // Get date range
      const earliestDate = finalOrders.reduce((min, order) => {
        const d = new Date(order.deliveryDate || order.pickupDate);
        return d < min ? d : min;
      }, new Date(finalOrders[0].deliveryDate || finalOrders[0].pickupDate));
      
      const latestDate = finalOrders.reduce((max, order) => {
        const d = new Date(order.deliveryDate || order.pickupDate);
        return d > max ? d : max;
      }, new Date(finalOrders[0].deliveryDate || finalOrders[0].pickupDate));

      // Fetch driver and company info
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select(
          "name, company_id, company_name, agreement_start_date, weekly_payment, weeks_count, companies!drivers_company_id_fkey(name)",
        )
        .eq("id", firstOrder.driver1Id)
        .single();

      if (driverError) {
        console.error("Error fetching driver:", driverError);
      }

      const companyName = driver?.companies?.name || "";
      const weekData = { orders: finalOrders };

      // Use template based on company name
      if (companyName === "BF Prime United LLC") {
        await exportFinalBFPrimeTemplate(weekData, earliestDate, latestDate, firstOrder, driver);
      } else if (
        companyName === "BF Prime Drivers LLC" ||
        companyName === "BF Prime Trucks LLC" ||
        companyName === "BF Prime LLC"
      ) {
        await exportFinalBFPrimeDriversTemplate(weekData, earliestDate, latestDate, firstOrder, driver);
      } else if (companyName === "Beverly Freight Inc") {
        await exportFinalBeverlyFreightTemplate(weekData, earliestDate, latestDate, firstOrder, driver);
      } else if (companyName === "BG Prime Inc") {
        await exportFinalBGPrimeIncTemplate(weekData, earliestDate, latestDate, firstOrder, driver);
      } else {
        exportGenericExcel(weekData, earliestDate, latestDate);
      }
    } catch (error) {
      console.error("Error exporting final statement:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalBFPrimeDriversTemplate = async (week: any, startDate: Date, endDate: Date, firstOrder: any, driver: any) => {
    try {
      const response = await fetch(new URL("../assets/templates/BF_Prime.xlsx", import.meta.url).toString());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template not found");

      const orderCount = week.orders.length;
      const extraRowsNeeded = Math.max(0, orderCount - 7);
      const deductionStartRow = 32 + extraRowsNeeded;

      if (extraRowsNeeded > 0) worksheet.spliceRows(21, 0, ...Array(extraRowsNeeded).fill([]));

      const { data: configData } = await supabase.from("invoice_number_config").select("*").eq("statement_type", "bf_prime_drivers").single();
      worksheet.getCell("F3").value = `F-${configData?.current_number || 1000}`;
      worksheet.getCell("F4").value = format(new Date(), "MM/dd/yyyy");
      worksheet.getCell("B12").value = `${format(startDate, "MM/dd/yyyy")} - ${format(endDate, "MM/dd/yyyy")}`;
      if (driver?.agreement_start_date) worksheet.getCell("K3").value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
      worksheet.getCell("F7").value = driver?.companies?.name || driver?.company_name || "";
      worksheet.getCell("F5").value = firstOrder.truckNumber || "";
      worksheet.getCell("K4").value = firstOrder.truckNumber || "";
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor((new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000));
        worksheet.getCell("K5").value = `${weeksPassed}/${driver.weeks_count}`;
      }
      worksheet.getCell("J7").value = driver?.name || "";

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      let currentRow = 14;
      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.totalDriverPay) || 0;
        cellI.numFmt = "$#,##0.00";
        currentRow++;
      });

      const deductions = [{ offset: 0, desc: "Cargo Insurance", amt: 250 }, { offset: 1, desc: "Trailer + Insurance", amt: 285 }, { offset: 2, desc: "ELD", amt: 50 }, { offset: 3, desc: "Pre-Pass", amt: 20 }, { offset: 4, desc: "Truck Payment" }, { offset: 5, desc: "Truck Insurance", amt: 195 }];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        if (amt !== undefined) { const c = worksheet.getCell(`J${deductionStartRow + offset}`); c.value = amt; c.numFmt = "$#,##0.00"; }
      });
      if (driver?.weekly_payment) { const c = worksheet.getCell(`J${deductionStartRow + 4}`); c.value = driver.weekly_payment; c.numFmt = "$#,##0.00"; }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 73 + extraRowsNeeded, 12);
      const filename = `${(driver?.name || "Unknown").replace(/\s+/g, "_")}_Final_${format(startDate, "MM-dd-yyyy")}_to_${format(endDate, "MM-dd-yyyy")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) { console.error("Error:", error); toast.error("Failed to export final statement"); }
  };

  const exportFinalBeverlyFreightTemplate = async (week: any, startDate: Date, endDate: Date, firstOrder: any, driver: any) => {
    try {
      const response = await fetch(new URL("../assets/templates/Beverly_Freight.xlsx", import.meta.url).toString());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template not found");

      const orderCount = week.orders.length;
      const extraRowsNeeded = Math.max(0, orderCount - 7);
      const deductionStartRow = 32 + extraRowsNeeded;

      if (extraRowsNeeded > 0) worksheet.spliceRows(21, 0, ...Array(extraRowsNeeded).fill([]));

      const { data: configData } = await supabase.from("invoice_number_config").select("*").eq("statement_type", "beverly_freight_inc").single();
      worksheet.getCell("F3").value = `F-${configData?.current_number || 26198}`;
      worksheet.getCell("F4").value = format(new Date(), "MM/dd/yyyy");
      worksheet.getCell("B12").value = `${format(startDate, "MM/dd/yyyy")} - ${format(endDate, "MM/dd/yyyy")}`;
      if (driver?.agreement_start_date) worksheet.getCell("K3").value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
      worksheet.getCell("F7").value = driver?.companies?.name || driver?.company_name || "";
      worksheet.getCell("F5").value = firstOrder.truckNumber || "";
      worksheet.getCell("K4").value = firstOrder.truckNumber || "";
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor((new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000));
        worksheet.getCell("K5").value = `${weeksPassed}/${driver.weeks_count}`;
      }
      worksheet.getCell("J7").value = driver?.name || "";

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      let currentRow = 14;
      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.totalDriverPay) || 0;
        cellI.numFmt = "$#,##0.00";
        currentRow++;
      });

      for (let row = 14; row <= 14 + week.orders.length - 1; row++) {
        const cellJ = worksheet.getCell(`J${row}`);
        cellJ.value = { formula: `SUM(I${row}*0.88)` };
        cellJ.numFmt = "$#,##0.00";
      }

      const deductions = [{ offset: 0, desc: "Cargo Insurance", amt: 250 }, { offset: 1, desc: "Trailer + Insurance", amt: 285 }, { offset: 2, desc: "ELD", amt: 50 }, { offset: 3, desc: "Pre-Pass", amt: 20 }, { offset: 4, desc: "Truck payment" }, { offset: 5, desc: "Truck insurance", amt: 195 }];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        if (amt !== undefined) { const c = worksheet.getCell(`J${deductionStartRow + offset}`); c.value = amt; c.numFmt = "$#,##0.00"; }
      });
      if (driver?.weekly_payment) { const c = worksheet.getCell(`J${deductionStartRow + 4}`); c.value = driver.weekly_payment; c.numFmt = "$#,##0.00"; }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70 + extraRowsNeeded, 12);
      const filename = `${(driver?.name || "Unknown").replace(/\s+/g, "_")}_Beverly_Final_${format(startDate, "MM-dd-yyyy")}_to_${format(endDate, "MM-dd-yyyy")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) { console.error("Error:", error); toast.error("Failed to export final statement"); }
  };

  const exportFinalBGPrimeIncTemplate = async (week: any, startDate: Date, endDate: Date, firstOrder: any, driver: any) => {
    try {
      const response = await fetch(new URL("../assets/templates/BG_Inc.xlsx", import.meta.url).toString());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template not found");

      const orderCount = week.orders.length;
      const extraRowsNeeded = Math.max(0, orderCount - 7);
      const deductionStartRow = 24 + extraRowsNeeded;

      // Clear shared formulas in trip rows BEFORE splicing
      for (let row = 13; row <= 30; row++) {
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${row}`);
          if (cell.model && cell.model.sharedFormula) delete cell.model.sharedFormula;
          cell.value = null;
        });
      }

      if (extraRowsNeeded > 0) worksheet.spliceRows(20, 0, ...Array(extraRowsNeeded).fill([]));

      const { data: configData } = await supabase.from("invoice_number_config").select("*").eq("statement_type", "bg_prime_inc").maybeSingle();
      worksheet.getCell("C7").value = `F-${configData?.current_number || 1332}`;
      worksheet.getCell("C8").value = format(new Date(), "M/d/yyyy");
      worksheet.getCell("C9").value = `${format(startDate, "M/d/yyyy")}-${format(endDate, "M/d/yyyy")}`;
      worksheet.getCell("F8").value = driver?.name || firstOrder.driverName || "";
      if (driver?.agreement_start_date) worksheet.getCell("J8").value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      worksheet.getCell("J9").value = firstOrder.truckNumber || "";
      if (driver?.weekly_payment && driver?.weeks_count) worksheet.getCell("J10").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      let currentRow = 13;
      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.totalDriverPay) || 0;
        cellI.numFmt = "$#,##0.00";
        currentRow++;
      });

      const endDateFormatted = format(endDate, "M/d/yyyy");
      const deductions = [{ offset: 0, desc: "Cargo Insurance", amt: 285 }, { offset: 1, desc: "Trailer + Insurance", amt: 285 }, { offset: 2, desc: "ELD", amt: 50 }, { offset: 3, desc: "Pre-Pass", amt: 20 }, { offset: 4, desc: "Truck Payment" }, { offset: 5, desc: "Truck Insurance", amt: 195 }];
      deductions.forEach(({ offset, desc, amt }) => {
        const row = deductionStartRow + offset;
        // Clear any shared formulas on deduction cells too
        ["B", "I", "J", "E"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${row}`);
          if (cell.model && cell.model.sharedFormula) delete cell.model.sharedFormula;
        });
        worksheet.getCell(`B${row}`).value = desc;
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amt !== undefined) { const c = worksheet.getCell(`J${row}`); c.value = amt; c.numFmt = "$#,##0.00"; }
      });
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor((new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000));
        worksheet.getCell(`E${deductionStartRow + 4}`).value = `${weeksPassed}/${driver.weeks_count}`;
      }
      if (driver?.weekly_payment) { const c = worksheet.getCell(`J${deductionStartRow + 4}`); c.value = driver.weekly_payment; c.numFmt = "$#,##0.00"; }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 61 + extraRowsNeeded, 12);
      const filename = `BG_Prime_Final_${format(startDate, "MMM-d")}-${format(endDate, "MMM-d-yyyy")}_${(driver?.name || "Unknown").replace(/\s+/g, "-")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) { console.error("Error:", error); toast.error("Failed to export final statement"); }
  };

  const exportFinalBFPrimeTemplate = async (week: any, startDate: Date, endDate: Date, firstOrder: any, driver: any) => {
    try {
      const response = await fetch(new URL("../assets/templates/BF_Prime_United.xlsx", import.meta.url).toString());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template not found");

      const orderCount = week.orders.length;
      const extraRowsNeeded = Math.max(0, orderCount - 7);
      const deductionStartRow = 39 + extraRowsNeeded;

      if (extraRowsNeeded > 0) worksheet.spliceRows(35, 0, ...Array(extraRowsNeeded).fill([]));

      const { data: configData } = await supabase.from("invoice_number_config").select("*").eq("statement_type", "bf_prime_united").single();
      worksheet.getCell("C2").value = `F-${configData?.current_number || 8820}`;
      worksheet.getCell("B3").value = format(new Date(), "M/d/yyyy");
      worksheet.getCell("B8").value = driver?.company_name || "";
      if (driver?.agreement_start_date) worksheet.getCell("F7").value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      if (driver?.weekly_payment && driver?.weeks_count) worksheet.getCell("F9").value = `$${driver.weekly_payment}/${driver.weeks_count}`;
      worksheet.getCell("F4").value = driver?.name || "";
      worksheet.getCell("F6").value = firstOrder.truckNumber || "";
      worksheet.getCell("B5").value = `${format(startDate, "M/d/yyyy")}-${format(endDate, "M/d/yyyy")}`;

      // Sort orders ascending by date for statement export
      const sortedOrders = sortOrdersAscending(week.orders);

      let currentRow = 28;
      sortedOrders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = order.mileage || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = parseFloat(order.totalDriverPay) || 0;
        cellI.numFmt = "$#,##0.00";
        currentRow++;
      });

      const endDateFormatted = format(endDate, "M/d/yyyy");
      const deductions = [{ offset: 0, desc: "Cargo Insurance", amt: 285 }, { offset: 1, desc: "Trailer + Insurance", amt: 285 }, { offset: 2, desc: "ELD", amt: 50 }, { offset: 3, desc: "Pre-Pass", amt: 20 }, { offset: 4, desc: "Truck Payment" }, { offset: 5, desc: "Truck Insurance", amt: 195 }];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        worksheet.getCell(`I${deductionStartRow + offset}`).value = endDateFormatted;
        if (amt !== undefined) { const c = worksheet.getCell(`J${deductionStartRow + offset}`); c.value = amt; c.numFmt = "$#,##0.00"; }
      });
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor((new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000));
        worksheet.getCell(`E${deductionStartRow + 4}`).value = `${weeksPassed}/${driver.weeks_count}`;
      }
      if (driver?.weekly_payment) { const c = worksheet.getCell(`J${deductionStartRow + 4}`); c.value = driver.weekly_payment; c.numFmt = "$#,##0.00"; }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 67 + extraRowsNeeded, 12);
      const filename = `BF_Prime_Final_${format(startDate, "MMM-d")}-${format(endDate, "MMM-d-yyyy")}_${(driver?.name || "Unknown").replace(/\s+/g, "-")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) { console.error("Error:", error); toast.error("Failed to export final statement"); }
  };

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
        </PaginationItem>,
      );
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink onClick={() => setCurrentPage(i)} isActive={currentPage === i}>
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>,
      );
    }

    return items;
  };

  if (isLoading) {
    return (
      <div className="w-full px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-6 w-64 bg-muted animate-pulse rounded" />
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold">Trips</h1>
      </div>

      <Card className="bg-background">
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

      <Card className="w-full min-w-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            Trips ({filteredOrders.length} total, showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)})
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportFinalStatement}
            disabled={!truckFilter && !driverFilter}
            title={!truckFilter && !driverFilter ? "Filter by truck or driver first" : "Export final statement"}
            className="text-xs md:text-sm"
          >
            <FileDown className="h-4 w-4 mr-1 md:mr-2" />
            Final
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-2 md:p-6 relative overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-20">
                <TableRow className="bg-yellow-200 dark:bg-yellow-800 border-4 border-black border-b-4">
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Truck#</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Driver</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Load#</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Pickup Date</TableHead>
                  <TableHead className="w-40 bg-yellow-200 dark:bg-yellow-800">Pickup City</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Delivery Date</TableHead>
                  <TableHead className="w-40 bg-yellow-200 dark:bg-yellow-800">Delivery City</TableHead>
                  <TableHead className="w-16 bg-yellow-200 dark:bg-yellow-800">Miles</TableHead>
                  <TableHead className="w-36 bg-yellow-200 dark:bg-yellow-800">Broker Name</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Broker Load#</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Booked By</TableHead>
                  <TableHead className="w-24 bg-yellow-200 dark:bg-yellow-800">Driver Pay</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Freight Amount</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByWeek.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No trips found
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedByWeek.map((week, weekIndex) => {
                    const weekTotal = week.orders.reduce(
                      (acc, order) => ({
                        miles: acc.miles + (Number(order.mileage) || 0),
                        driverPay: acc.driverPay + (Number(order.totalDriverPay) || 0),
                        freightAmount: acc.freightAmount + (Number(order.totalFreightAmount) || 0),
                      }),
                      { miles: 0, driverPay: 0, freightAmount: 0 },
                    );

                      const weekStartDate = new Date(week.weekStart + "T12:00:00");
                      const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 2 });

                      // Get truck/driver info from first order for paid status
                      const weekTruckNumber = week.orders[0]?.truckNumber || "";
                      const weekDriverName = week.orders[0]?.driverName || "";
                      const weekIsPaid = isWeekPaid(weekTruckNumber, weekDriverName, week.weekStart);

                      return (
                        <Fragment key={`week-${week.weekStart}`}>
                          {/* Weekly Summary Row - Now appears FIRST */}
                          <TableRow className="bg-muted/50 font-semibold border-4 border-primary">
                            <TableCell colSpan={7} className="py-3">
                              <div className="flex items-center gap-4">
                                <span>Week: {format(weekStartDate, "MMM d")} - {format(weekEndDate, "MMM d, yyyy")}</span>
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`paid-${week.weekStart}`}
                                    checked={weekIsPaid}
                                    onCheckedChange={() => handlePaidToggle(weekTruckNumber, week.orders[0]?.truckId || "", weekDriverName, week.weekStart, week.orders)}
                                  />
                                  <label
                                    htmlFor={`paid-${week.weekStart}`}
                                    className={`text-sm cursor-pointer ${weekIsPaid ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                                  >
                                    {weekIsPaid ? "Paid" : "Paid"}
                                  </label>
                                </div>
                              </div>
                            </TableCell>
                          <TableCell className="py-3">{weekTotal.miles.toLocaleString()}</TableCell>
                          <TableCell colSpan={3} className="py-3"></TableCell>
                          <TableCell className="py-3">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(weekTotal.driverPay)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(weekTotal.freightAmount)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => exportWeekToExcel(week, weekStartDate, weekEndDate)}
                              title="Export week to Excel"
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Orders for this week */}
                        {week.orders.map((order, orderIndex) => {
                          // Background color rules - Recovery orders get purple background that overrides all other colors
                          const isRecovery = order.isRecovery;

                          const hasRedFees =
                            (order as any).lateFeeDriver > 0 ||
                            (order as any).noTrackingFeeDriver > 0 ||
                            (order as any).wrongAddressFeeDriver > 0;

                          const hasGreenFees = (order as any).detentionDriver > 0 || (order as any).layoverDriver > 0;

                          const hasYellowFees = (order as any).escortFee > 0 || (order as any).lumper > 0;

                          const hasOrangeCondition =
                            order.canceled ||
                            ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

                          const isEvenRow = orderIndex % 2 === 1;
                          const alternatingBg = isEvenRow ? "bg-muted/50 hover:bg-muted/50 dark:bg-muted/30 dark:hover:bg-muted/30" : "bg-background hover:bg-background";

                          const rowClassName = isRecovery
                            ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_90%)] dark:hover:bg-[hsl(270_50%_25%)]"
                            : hasRedFees
                              ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_90%)] dark:hover:bg-[hsl(0_62%_25%)]"
                              : hasGreenFees
                                ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_90%)] dark:hover:bg-[hsl(120_40%_25%)]"
                                : hasYellowFees
                                  ? "bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)] hover:bg-[hsl(45_93%_90%)] dark:hover:bg-[hsl(45_93%_30%)]"
                                  : hasOrangeCondition
                                    ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_90%)] dark:hover:bg-[hsl(25_75%_30%)]"
                                    : alternatingBg;

                          return (
                            <TableRow key={order.virtualId ?? `${order.id}_${order.transferSequence ?? "base"}`} className={`h-16 ${rowClassName}`}>
                              <TableCell className="font-medium">
                                <div className="line-clamp-2">{order.truckNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">
                                  {order.driverName}
                                  {order.transferBadge && (
                                    <Badge 
                                      variant="outline" 
                                      className={`ml-1 text-[10px] px-1 py-0 ${
                                        order.transferBadge === "Orig" 
                                          ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                                          : order.transferBadge === "Rec"
                                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                            : "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                                      }`}
                                    >
                                      {order.transferBadge}
                                    </Badge>
                                  )}
                                  {/* Legacy badges for orders without transferBadge */}
                                  {!order.transferBadge && order.isOriginalDriverPortion && (
                                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                      Orig
                                    </Badge>
                                  )}
                                  {!order.transferBadge && order.isRecoveryDriverPortion && (
                                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                      Rec
                                    </Badge>
                                  )}
                                  {order.transferNote && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{order.transferNote}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.internalLoadNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{formatDateDisplay(order.pickupDate)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">
                                  {order.pickupCity}
                                  {order.pickupCity && order.pickupState ? ", " : ""}
                                  {order.pickupState}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{formatDateDisplay(order.deliveryDate)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">
                                  {order.deliveryCity}
                                  {order.deliveryCity && order.deliveryState ? ", " : ""}
                                  {order.deliveryState}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.mileage?.toLocaleString() || "0"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.brokerName}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.brokerLoadNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.bookedBy}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                  {formatCurrency(order.totalDriverPay)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                  {formatCurrency(order.totalFreightAmount)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      localStorage.setItem("returnToTrips", "true");
                                      navigate(`/edit-order/${order.id}`);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {(() => {
                                    const additionals: string[] = [];
                                    if ((order as any).detentionDriver > 0) additionals.push(`Detention: ${formatCurrency((order as any).detentionDriver)}`);
                                    if ((order as any).layoverDriver > 0) additionals.push(`Layover: ${formatCurrency((order as any).layoverDriver)}`);
                                    if ((order as any).lateFeeDriver > 0) additionals.push(`Late Fee: ${formatCurrency((order as any).lateFeeDriver)}`);
                                    if ((order as any).noTrackingFeeDriver > 0) additionals.push(`No Tracking: ${formatCurrency((order as any).noTrackingFeeDriver)}`);
                                    if ((order as any).wrongAddressFeeDriver > 0) additionals.push(`Wrong Address: ${formatCurrency((order as any).wrongAddressFeeDriver)}`);
                                    if ((order as any).escortFee > 0) additionals.push(`Escort: ${formatCurrency((order as any).escortFee)}`);
                                    if ((order as any).lumper > 0) additionals.push(`Lumper: ${formatCurrency((order as any).lumper)}`);
                                    if ((order as any).lumperDriver > 0) additionals.push(`Lumper Driver: ${formatCurrency((order as any).lumperDriver)}`);
                                    if ((order as any).extraStopDriver > 0) additionals.push(`Extra Stop: ${formatCurrency((order as any).extraStopDriver)}`);
                                    if ((order as any).tonuDriver > 0) additionals.push(`TONU: ${formatCurrency((order as any).tonuDriver)}`);
                                    if ((order as any).otherChargesDriver > 0) additionals.push(`Other: ${formatCurrency((order as any).otherChargesDriver)}`);
                                    
                                    if (additionals.length === 0) return null;
                                    
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            <Info className="h-4 w-4 text-blue-500" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-3" align="start">
                                          <div className="text-sm font-semibold mb-2">Additional Charges</div>
                                          <div className="space-y-1">
                                            {additionals.map((item, idx) => (
                                              <div key={idx} className="text-sm">{item}</div>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  })()}
                                  {(() => {
                                    const dateChangeNotes = (order as any).dateChangeNotes;
                                    if (!dateChangeNotes || dateChangeNotes.trim() === '') return null;
                                    
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            <CalendarClock className="h-4 w-4 text-orange-500" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-3 max-w-xs" align="start">
                                          <div className="text-sm font-semibold mb-2">Reschedule Notes</div>
                                          <div className="text-sm">{dateChangeNotes}</div>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
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
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {renderPaginationItems()}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Paid Confirmation Dialog */}
      <AlertDialog open={paidConfirmDialog?.open ?? false} onOpenChange={(open) => !open && setPaidConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paidConfirmDialog?.newPaidStatus ? "Mark Week as Paid?" : "Mark Week as Unpaid?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {paidConfirmDialog?.newPaidStatus 
                ? "This will mark the week and its associated fuel transactions as paid."
                : "This will mark the week and its associated fuel transactions as unpaid."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPaidToggle}>
              {paidConfirmDialog?.newPaidStatus ? "Mark Paid" : "Mark Unpaid"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Trips;
