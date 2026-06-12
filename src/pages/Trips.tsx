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
import {
  Search,
  Loader2,
  FileDown,
  Edit,
  CalendarClock,
  ArrowLeftRight,
  Undo2,
  AlertCircle,
  X,
  Trash2,
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import moneyStackIcon from "@/assets/money-stack.png";
import { useTripsLazyOrders } from "@/hooks/useTripsLazyOrders";
import { StatementPreviewDialog, ScheduledDeduction } from "@/components/StatementPreviewDialog";
import { CellSelectionSummary } from "@/components/CellSelectionSummary";
import { useCellSelection } from "@/hooks/useCellSelection";
import { useState, useMemo, useEffect, Fragment, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, getDay, addDays } from "date-fns";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rebuildWorkbookClean } from "@/utils/excel/rebuildWorkbookClean";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAuth } from "@/hooks/useAuth";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import { formatInternalLoadNumber, parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import {
  useAssignmentHistory,
  AssignmentHistoryEntry,
  buildChangeDescription,
  extractDatePart,
} from "@/hooks/useAssignmentHistory";
import {
  calculateTenures,
  calculateCombinedDriverTenures,
  Tenure,
  formatTenureDateRange,
  formatTenureDuration,
} from "@/utils/tenureCalculator";
import { NestedDriverTripsDropdown, NestedDriverTripsInlineContent } from "@/components/NestedDriverTripsDropdown";

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
const fetchPreviousWeekLastDelivery = async (truckId: string, currentWeekMonday: Date): Promise<Date | null> => {
  // Calculate previous week range (Monday to Sunday before current week)
  const prevWeekMonday = addDays(currentWeekMonday, -7);
  const prevWeekSunday = addDays(currentWeekMonday, -1);

  // Query orders for this truck with deliveries in the previous week
  // NOTE: We don't rely on order.status here because delivery completion is represented by delivery_datetime.
  // Flat fetch (no joins) to avoid RLS amplification
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, delivery_datetime, truck_id")
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
      const lastDrop = dropStops.sort((a: any, b: any) => (b.datetime || "").localeCompare(a.datetime || ""))[0];
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
  currentWeekMonday: Date,
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
  endDate: Date,
): Promise<FuelTransaction[]> => {
  const { data, error } = await supabase
    .from("fuel_transactions")
    .select(
      "id, transaction_number, transaction_date, location_name, city, state, item, fees, unit_price, quantity, amount",
    )
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
  currentWeekMonday: Date,
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
  const fuelRange = calculateFuelDateRange(previousWeekLastDelivery, currentWeekLastDelivery, currentWeekMonday);

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
  endRow: number,
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
    const unitPrice = quantity === 1 || quantity === 1.0 ? amount : parseFloat(String(fuel.unit_price)) || 0;
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
  weekEndDate: Date,
): Promise<EfsDeduction[]> => {
  const deductions: EfsDeduction[] = [];

  if (!driverId) return deductions;

  const weekStartISO = format(weekStartDate, "yyyy-MM-dd");
  const weekEndISO = format(addDays(weekEndDate, 1), "yyyy-MM-dd"); // Include the end date

  // NOTE: Cash advances are now managed as driver_expenses (via StatementPreviewDialog deductions)
  // so we no longer fetch them separately here to avoid double-counting

  // Fetch EFS other requests for the driver within the week
  // EXCLUDE fuel requests since they go to the dedicated fuel section
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
      // Skip fuel requests - they are handled in the fuel section via fuel_transactions
      const purpose = (efs.purpose || "").toLowerCase();
      if (purpose === "fuel") return;

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
  const { roles, getPrimaryRole, profile, hasRole } = useAuth();
  const primaryRole = getPrimaryRole();

  // For dispatch users, filter to only show their booked orders and orders for drivers assigned to them
  const isDispatchOnly =
    hasRole("dispatch") &&
    !hasRole("afterhours") &&
    !hasRole("admin") &&
    !hasRole("manager") &&
    !hasRole("accounting") &&
    !hasRole("supervisor") &&
    !hasRole("safety");

  // Use Individual Mode context - applies filtering when toggle is ON
  const { individualMode } = useIndividualMode();

  // Apply filtering when Individual Mode is ON or user is dispatch-only
  const shouldFilterByUser = individualMode || isDispatchOnly;
  const orderFilterOptions = shouldFilterByUser
    ? { bookedBy: profile?.full_name || null, dispatcherUserId: profile?.user_id || null }
    : { bookedBy: null, dispatcherUserId: null };

  const [currentPage, setCurrentPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState(() => {
    return localStorage.getItem("trips_searchFilter") || "";
  });
  const [loadNumberSearch, setLoadNumberSearch] = useState("");
  const [invoicedDateFilter, setInvoicedDateFilter] = useState<Date | undefined>(undefined);
  const itemsPerPage = 50;

  // Statement preview dialog state
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [statementDialogData, setStatementDialogData] = useState<{
    week: any;
    weekStartDate: Date;
    weekEndDate: Date;
    driverId: string;
    driverName: string;
    truckNumber: string;
    truckId: string;
  } | null>(null);

  // Use lazy loading hook - only fetches on search if no global orders cached
  const {
    data: ordersRaw,
    isLoading,
    isLazyMode,
    hasGlobalOrders,
    updateOrderLocally,
  } = useTripsLazyOrders({ truckDriverSearch: searchFilter, loadNumberSearch });

  const queryClient = useQueryClient();

  // For dispatch-only users: fetch the IDs of drivers assigned to them so we can
  // restrict trips visibility to ONLY their assigned drivers/trucks (no booked_by, no others).
  const { data: dispatchAssignedDriverIds } = useQuery({
    queryKey: ["trips-dispatch-assigned-drivers", profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return [] as string[];
      const { data, error } = await supabase
        .from("drivers")
        .select("id")
        .eq("dispatcher_id", profile.user_id);
      if (error) throw error;
      return (data || []).map((d) => d.id);
    },
    enabled: isDispatchOnly && !!profile?.user_id,
    staleTime: 5 * 60 * 1000,
  });

  // Apply dispatch-only filter: keep only orders for drivers assigned to this dispatcher.
  // For all other roles, this is a no-op.
  const orders = useMemo(() => {
    if (!isDispatchOnly) return ordersRaw;
    if (!ordersRaw) return ordersRaw;
    const allowed = new Set(dispatchAssignedDriverIds || []);
    if (allowed.size === 0) return [];
    return ordersRaw.filter(
      (o: any) =>
        (o.driver1Id && allowed.has(o.driver1Id)) ||
        (o.driver2Id && allowed.has(o.driver2Id))
    );
  }, [ordersRaw, isDispatchOnly, dispatchAssignedDriverIds]);

  // Cell selection for Excel-like sum/average functionality
  const { selectedCellsArray, toggleCell, clearSelection, isSelected } = useCellSelection();

  // Track expanded nested driver trips
  const [expandedNestedTrips, setExpandedNestedTrips] = useState<Set<string>>(new Set());

  const toggleNestedTrips = useCallback((historyId: string) => {
    setExpandedNestedTrips((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(historyId)) {
        newSet.delete(historyId);
      } else {
        newSet.add(historyId);
      }
      return newSet;
    });
  }, []);

  // Check if user can move loads between weeks (managers, admins, accounting) - dispatch/supervisor cannot
  const canMoveLoads =
    primaryRole !== "dispatch" &&
    primaryRole !== "supervisor" &&
    (roles?.some((role) => ["manager", "admin", "accounting"].includes(role)) ?? false);

  // Check if user can see paid columns - dispatch/supervisor cannot
  const canSeePaidColumn = primaryRole !== "dispatch" && primaryRole !== "supervisor";
  // Check if user can toggle paid - manager/supervisor/dispatch cannot
  const canTogglePaid = primaryRole !== "dispatch" && primaryRole !== "supervisor" && primaryRole !== "manager";

  // Fetch week overrides
  const { data: weekOverrides } = useQuery({
    queryKey: ["order-week-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_week_overrides").select("*");

      if (error) throw error;

      // Convert to a map for quick lookup: order_id -> target_week_start
      const overrideMap: Record<string, string> = {};
      data?.forEach((row: any) => {
        overrideMap[row.order_id] = row.target_week_start;
      });
      return overrideMap;
    },
  });

  // Mutation to create/update week override
  const createWeekOverrideMutation = useMutation({
    mutationFn: async ({
      orderId,
      originalWeekStart,
      targetWeekStart,
    }: {
      orderId: string;
      originalWeekStart: string;
      targetWeekStart: string;
    }) => {
      const { error } = await supabase.from("order_week_overrides").upsert(
        {
          order_id: orderId,
          original_week_start: originalWeekStart,
          target_week_start: targetWeekStart,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        },
        {
          onConflict: "order_id",
        },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-week-overrides"] });
      toast.success("Load moved to different week");
    },
    onError: (error) => {
      console.error("Error moving load:", error);
      toast.error("Failed to move load");
    },
  });

  // Mutation to delete week override (revert to original week)
  const deleteWeekOverrideMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("order_week_overrides").delete().eq("order_id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-week-overrides"] });
      toast.success("Load returned to original week");
    },
    onError: (error) => {
      console.error("Error reverting load:", error);
      toast.error("Failed to revert load");
    },
  });

  // State for delete assignment history confirmation
  const [deleteHistoryConfirmDialog, setDeleteHistoryConfirmDialog] = useState<{
    historyEntryIds: string[];
    description: string;
  } | null>(null);

  // Mutation to delete assignment history entries (admin only)
  const deleteAssignmentHistoryMutation = useMutation({
    mutationFn: async (historyEntryIds: string[]) => {
      const { error } = await supabase.from("assignment_history").delete().in("id", historyEntryIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-history"] });
      toast.success("Assignment history entry deleted");
      setDeleteHistoryConfirmDialog(null);
    },
    onError: (error) => {
      console.error("Error deleting assignment history:", error);
      toast.error("Failed to delete assignment history entry");
    },
  });
  const { data: paidWeeksData } = useQuery({
    queryKey: ["trips-paid-status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips_paid_status").select("*");

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
    mutationFn: async ({
      truckNumber,
      truckId,
      driverName,
      weekStart,
      weekOrders,
      isPaid,
    }: {
      truckNumber: string;
      truckId: string;
      driverName: string;
      weekStart: string;
      weekOrders: any[];
      isPaid: boolean;
    }) => {
      // Update the trip paid status
      const { error } = await supabase.from("trips_paid_status").upsert(
        {
          truck_number: truckNumber || "unknown",
          driver_name: driverName || "unknown",
          week_start: weekStart,
          is_paid: isPaid,
        },
        {
          onConflict: "truck_number,driver_name,week_start",
        },
      );

      if (error) throw error;

      // Also update fuel transactions paid status
      if (truckNumber && truckId) {
        const currentWeekMonday = new Date(weekStart + "T12:00:00");

        // Get fuel transactions using the same logic as for statements
        const fuelTransactions = await fetchFuelTransactionsForStatement(
          truckNumber,
          truckId,
          weekOrders,
          currentWeekMonday,
        );

        // Update fuel transactions paid status
        if (fuelTransactions.length > 0) {
          const fuelIds = fuelTransactions.map((f) => f.id);
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

  // State for individual order paid confirmation dialog
  const [orderPaidConfirmDialog, setOrderPaidConfirmDialog] = useState<{
    open: boolean;
    orderId: string;
    currentPaid: boolean;
    loadNumber: string;
  } | null>(null);

  // Handle individual order paid status toggle
  const handleOrderPaidToggle = (orderId: string, currentPaid: boolean, loadNumber: string) => {
    setOrderPaidConfirmDialog({
      open: true,
      orderId,
      currentPaid,
      loadNumber,
    });
  };

  // Confirm individual order paid status change
  const confirmOrderPaidToggle = async () => {
    if (primaryRole === "manager" || primaryRole === "supervisor") {
      toast.error("Managers and supervisors cannot change paid status");
      setOrderPaidConfirmDialog(null);
      return;
    }
    if (!orderPaidConfirmDialog) return;

    try {
      const newPaidStatus = !orderPaidConfirmDialog.currentPaid;
      const { error } = await supabase
        .from("orders")
        .update({ paid: newPaidStatus })
        .eq("id", orderPaidConfirmDialog.orderId);

      if (error) throw error;

      toast.success(`Load marked as ${newPaidStatus ? "paid" : "unpaid"}`);
      // Optimistic cache update across all orders caches
      const cache = queryClient.getQueryCache();
      const orderQueries = cache.findAll({ queryKey: ["orders"], exact: false });
      orderQueries.forEach((query) => {
        queryClient.setQueryData(query.queryKey, (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((o: any) => (o.id === orderPaidConfirmDialog.orderId ? { ...o, paid: newPaidStatus } : o));
        });
      });
      // Also update the Trips-local data for immediate UI feedback
      updateOrderLocally(orderPaidConfirmDialog.orderId, { paid: newPaidStatus });
    } catch (error) {
      console.error("Error updating paid status:", error);
      toast.error("Failed to update paid status");
    } finally {
      setOrderPaidConfirmDialog(null);
    }
  };

  // Show confirmation dialog before toggling paid status
  const handlePaidToggle = (
    truckNumber: string,
    truckId: string,
    driverName: string,
    weekStart: string,
    weekOrders: any[],
  ) => {
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
    if (primaryRole === "manager" || primaryRole === "supervisor") {
      toast.error("Managers and supervisors cannot change paid status");
      setPaidConfirmDialog(null);
      return;
    }
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

  // Save filter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("trips_searchFilter", searchFilter);
  }, [searchFilter]);

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
        const legacyIsRecoveryLoad =
          !!order.originalDriver1Id &&
          ((order.originalDriverPrice && order.originalDriverPrice > 0) ||
            (order.originalMiles && order.originalMiles > 0));

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
            totalFreightAmountNoLumper: order.totalFreightAmountNoLumper,
          });
        }

        // Add legacy Rec (seq 1) if not in order_transfers
        if (legacyIsRecoveryLoad && !existingSeq.has(1) && !addedSequences.has(1)) {
          addedSequences.add(1);
          // Get recovery driver info from recovery_history if available
          const recoveryHistory =
            Array.isArray(order.recoveryHistory) && order.recoveryHistory.length > 0 ? order.recoveryHistory[0] : null;
          const recDriverName = recoveryHistory?.recoveryDriver1?.name || recoveryHistory?.recoveryDriver1Name;
          const recTruckNumber = recoveryHistory?.recoveryTruck?.truck_number || recoveryHistory?.recoveryTruckNumber;
          const recTrailerNumber =
            recoveryHistory?.recoveryTrailer?.trailer_number || recoveryHistory?.recoveryTrailerNumber;

          // Use recovery_date for legacy Rec segment if available
          const recDeliveryDate = order.recoveryDate || order.deliveryDate;

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
        transfers.forEach((transfer: any, idx: number) => {
          const seq = Number(transfer.sequence_number);
          if (addedSequences.has(seq)) return; // Skip if already added
          addedSequences.add(seq);

          const isOriginal = seq === 0;
          const badge = isOriginal ? "Orig" : seq === 1 ? "Rec" : `Transfer ${seq}`;

          // Chain logic: handoff data is stored on the originating transfer record
          // So current transfer's handoff = this segment's delivery point
          // Previous transfer's handoff = this segment's pickup point (for non-original)
          const prevTransfer = idx > 0 ? transfers[idx - 1] : null;

          // DELIVERY: current transfer's handoff location/date, or order's delivery if no handoff
          const segDeliveryCity = transfer.transfer_city || order.deliveryCity;
          const segDeliveryState = transfer.transfer_state || order.deliveryState;
          const segDeliveryDate = transfer.transfer_datetime || order.deliveryDate;

          // PICKUP: original uses order pickup; others use previous transfer's handoff
          const segPickupCity = isOriginal ? order.pickupCity : prevTransfer?.transfer_city || order.pickupCity;
          const segPickupState = isOriginal ? order.pickupState : prevTransfer?.transfer_state || order.pickupState;
          const segPickupDate = isOriginal ? order.pickupDate : prevTransfer?.transfer_datetime || order.pickupDate;
          const segPickupDatetime = isOriginal
            ? order.pickupDatetime
            : prevTransfer?.transfer_datetime || order.pickupDatetime;

          const driverName = isOriginal
            ? order.originalDriver1Name ||
              order.originalDriver2Name ||
              transfer.driver1?.name ||
              transfer.manual_driver_name ||
              order.driverName
            : transfer.driver1?.name || transfer.manual_driver_name || order.driverName;

          const driver1Name = isOriginal
            ? order.originalDriver1Name || transfer.driver1?.name || transfer.manual_driver_name
            : transfer.driver1?.name || transfer.manual_driver_name;

          const driver2Name = isOriginal ? order.originalDriver2Name || transfer.driver2?.name : transfer.driver2?.name;

          const truckId = isOriginal ? order.originalTruckId || transfer.truck_id : transfer.truck_id;
          const truckNumber = isOriginal
            ? order.originalTruckNumber ||
              transfer.truck?.truck_number ||
              transfer.manual_truck_number ||
              order.truckNumber
            : transfer.truck?.truck_number || transfer.manual_truck_number || order.truckNumber;

          const trailerId = isOriginal ? order.originalTrailerId || transfer.trailer_id : transfer.trailer_id;
          const trailerNumber = isOriginal
            ? order.originalTrailerNumber ||
              transfer.trailer?.trailer_number ||
              transfer.manual_trailer_number ||
              order.trailerNumber
            : transfer.trailer?.trailer_number || transfer.manual_trailer_number || order.trailerNumber;

          const mileage = isOriginal ? (transfer.miles ?? order.originalMiles ?? 0) : (transfer.miles ?? 0);
          const driverPay = isOriginal
            ? (transfer.driver_price ?? order.originalDriverPrice ?? 0)
            : (transfer.driver_price ?? 0);

          segments.push({
            ...order,
            virtualId: `${order.id}_transfer_${seq}`,
            transferSequence: seq,
            transferBadge: badge,
            isOriginalDriverPortion: isOriginal,
            isRecoveryDriverPortion: seq === 1,
            driver1Id: isOriginal ? order.originalDriver1Id || transfer.driver1_id : transfer.driver1_id,
            driver2Id: isOriginal ? order.originalDriver2Id || transfer.driver2_id : transfer.driver2_id,
            driverName,
            driver1Name,
            driver2Name,
            truckId,
            truckNumber,
            trailerId,
            trailerNumber,
            mileage,
            totalDriverPay: driverPay,
            driverPrice: driverPay,
            // Chained pickup/delivery overrides
            pickupCity: segPickupCity,
            pickupState: segPickupState,
            pickupDate: segPickupDate,
            pickupDatetime: segPickupDatetime,
            deliveryCity: segDeliveryCity,
            deliveryState: segDeliveryState,
            deliveryDatetime: segDeliveryDate,
            deliveryDate: segDeliveryDate,
          });
        });

        segments
          .sort((a, b) => (a.transferSequence ?? 0) - (b.transferSequence ?? 0))
          .forEach((seg) => result.push(seg));
      } else {
        // Legacy: Split into Orig/Rec only if the order is still marked as recovery.
        // Some revert flows may leave original_* fields populated, but those should NOT
        // create extra trip rows once is_recovery is false.
        const isRecoveryLoad =
          !!order.isRecovery &&
          !!order.originalDriver1Id &&
          ((order.originalDriverPrice && order.originalDriverPrice > 0) ||
            (order.originalMiles && order.originalMiles > 0));

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
            transferNote: `Driver: ${order.driverName || "N/A"}, Truck: ${order.truckNumber || "N/A"}, Trailer: ${order.trailerNumber || "N/A"}`,
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
            totalFreightAmountNoLumper: order.totalFreightAmountNoLumper,
          });
        } else {
          // Non-recovery order - add as-is
          result.push(order);
        }
      }
    });

    return result;
  }, [orders]);

  // Filter orders based on combined search (truck number or driver name)
  // For load# search: two-pass (keep all segments of matching load)
  // For truck#/driver search: independent per-segment filtering
  const filteredOrders = useMemo(() => {
    if (!expandedOrders) return [];

    const searchLower = searchFilter.toLowerCase().trim();
    const loadSearchLower = loadNumberSearch.toLowerCase().trim();
    const parsedSearchNumber = loadSearchLower ? parseInternalLoadNumber(loadSearchLower) : null;
    const isNumericSearch = /^\d+$/.test(searchLower);
    const isLoadSearch = !!loadSearchLower;

    return expandedOrders.filter((order) => {
      const matchesTruck = isNumericSearch
        ? order.truckNumber?.toLowerCase() === searchLower
        : order.truckNumber?.toLowerCase().includes(searchLower);
      const matchesSearch = !searchLower || matchesTruck || order.driverName?.toLowerCase().includes(searchLower);

      const formattedInternalLoad = formatInternalLoadNumber(order.internalLoadNumber, order.companyName);
      const matchesLoadNumber =
        !loadSearchLower ||
        formattedInternalLoad.toLowerCase().includes(loadSearchLower) ||
        order.internalLoadNumber?.toString().includes(loadSearchLower) ||
        (parsedSearchNumber !== null && order.internalLoadNumber === parsedSearchNumber) ||
        order.brokerLoadNumber?.toLowerCase().includes(loadSearchLower) ||
        order.loadNumber?.toLowerCase().includes(loadSearchLower);

      let matchesInvoicedDate = true;
      if (invoicedDateFilter) {
        const dateToCheck = order.invoicedAt || order.deliveryDate;
        if (!dateToCheck) {
          matchesInvoicedDate = false;
        } else {
          const normalizedStr = String(dateToCheck).replace(" ", "T");
          const datePart = normalizedStr.split("T")[0];
          if (!datePart) {
            matchesInvoicedDate = false;
          } else {
            const [year, month, day] = datePart.split("-").map(Number);
            matchesInvoicedDate =
              year === invoicedDateFilter.getFullYear() &&
              month === invoicedDateFilter.getMonth() + 1 &&
              day === invoicedDateFilter.getDate();
          }
        }
      }

      const hasValue =
        (order.totalFreightAmountNoLumper && order.totalFreightAmountNoLumper !== 0) ||
        (order.totalDriverPay && order.totalDriverPay !== 0);

      return matchesSearch && matchesLoadNumber && matchesInvoicedDate && hasValue;
    });
  }, [expandedOrders, searchFilter, loadNumberSearch, invoicedDateFilter]);

  // Determine if filtering by truck number or driver name for assignment history
  const filterInfo = useMemo(() => {
    const searchLower = searchFilter.toLowerCase().trim();
    if (!searchLower || filteredOrders.length === 0) {
      return {
        filterType: null as "truck" | "driver" | null,
        entityId: null as string | null,
        companyName: null as string | null,
      };
    }

    // Check if the search matches a truck number
    const matchedByTruck = filteredOrders.find((order) => order.truckNumber?.toLowerCase().includes(searchLower));

    // Check if the search matches a driver name
    const matchedByDriver = filteredOrders.find((order) => order.driverName?.toLowerCase().includes(searchLower));

    // Determine filter type - prefer exact match, prioritize truck if both match
    if (matchedByTruck && matchedByTruck.truckNumber?.toLowerCase() === searchLower) {
      return {
        filterType: "truck" as const,
        entityId: matchedByTruck.truckId,
        companyName: matchedByTruck.driverCompanyName || matchedByTruck.companyName,
      };
    }
    if (matchedByDriver && matchedByDriver.driverName?.toLowerCase() === searchLower) {
      return {
        filterType: "driver" as const,
        entityId: matchedByDriver.driver1Id,
        companyName: matchedByDriver.driverCompanyName || matchedByDriver.companyName,
      };
    }

    // Fallback to partial match
    if (matchedByTruck) {
      return {
        filterType: "truck" as const,
        entityId: matchedByTruck.truckId,
        companyName: matchedByTruck.driverCompanyName || matchedByTruck.companyName,
      };
    }
    if (matchedByDriver) {
      return {
        filterType: "driver" as const,
        entityId: matchedByDriver.driver1Id,
        companyName: matchedByDriver.driverCompanyName || matchedByDriver.companyName,
      };
    }

    return { filterType: null, entityId: null, companyName: null };
  }, [searchFilter, filteredOrders]);

  // Fetch assignment history based on filter type
  const { data: assignmentHistory = [] } = useAssignmentHistory(
    filterInfo.filterType === "truck" ? "truck" : "driver",
    filterInfo.entityId,
  );

  // Fetch terminated drivers AND their notes in a SINGLE query for faster display
  // This eliminates the delay caused by sequential queries
  const { data: terminatedDriversWithNotes = [] } = useQuery({
    queryKey: [
      "terminated-drivers-with-notes-for-trips",
      filterInfo.filterType,
      filterInfo.entityId,
      assignmentHistory.length,
    ],
    queryFn: async () => {
      // Only fetch when filtering by driver or truck
      if (!filterInfo.filterType || !filterInfo.entityId) return [];

      // Fetch drivers with their termination notes in a single query
      let query = supabase
        .from("drivers")
        .select(
          `
          id,
          name,
          first_name,
          last_name,
          termination_date,
          driver_termination_notes (
            id,
            note,
            created_at
          )
        `,
        )
        .eq("is_active", false)
        .not("termination_date", "is", null);

      // If filtering by driver, only get that specific driver
      if (filterInfo.filterType === "driver") {
        query = query.eq("id", filterInfo.entityId);
      }

      const { data, error } = await query.order("termination_date", { ascending: false });

      if (error) {
        console.error("Error fetching terminated drivers:", error);
        return [];
      }

      let filteredData = data || [];

      // If filtering by truck, we need to find drivers that were assigned to that truck
      if (filterInfo.filterType === "truck" && filteredData.length > 0) {
        // Get drivers that were ever assigned to this truck from assignment history
        const driverIdsFromHistory = assignmentHistory
          .filter((h) => h.driver1_id || h.driver2_id || h.old_driver1_id || h.old_driver2_id)
          .flatMap((h) => [h.driver1_id, h.driver2_id, h.old_driver1_id, h.old_driver2_id])
          .filter(Boolean);

        const uniqueDriverIds = [...new Set(driverIdsFromHistory)];
        filteredData = filteredData.filter((d) => uniqueDriverIds.includes(d.id));
      }

      return filteredData;
    },
    enabled: !!filterInfo.filterType && !!filterInfo.entityId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Extract terminated drivers list (for backwards compatibility)
  const terminatedDrivers = useMemo(() => {
    return terminatedDriversWithNotes.map((d) => ({
      id: d.id,
      name: d.name,
      first_name: d.first_name,
      last_name: d.last_name,
      termination_date: d.termination_date,
    }));
  }, [terminatedDriversWithNotes]);

  // Create a map of driver_id to their most recent termination note (extracted from combined query)
  const terminationNotesByDriverId = useMemo(() => {
    const map: Record<string, string> = {};
    terminatedDriversWithNotes.forEach((driver) => {
      const notes = (driver.driver_termination_notes as any[]) || [];
      if (notes.length > 0) {
        // Sort by created_at descending and take the first (most recent)
        const sortedNotes = [...notes].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        map[driver.id] = sortedNotes[0].note;
      }
    });
    return map;
  }, [terminatedDriversWithNotes]);

  // Convert assignment history into tenure-based entries (like truck history dialog)
  // This shows 1 entry per tenure period, not individual events
  const historyEntriesByWeek = useMemo(() => {
    if (!filterInfo.filterType || assignmentHistory.length === 0) return {};

    // Filter to relevant change types
    const filtered = assignmentHistory.filter(
      (entry) =>
        entry.change_type === "driver_assignment" ||
        entry.change_type === "trailer_assignment" ||
        entry.change_type === "assignment_change",
    );

    // Calculate tenures using the same logic as truck history dialog
    let tenures: Tenure[] =
      filterInfo.filterType === "truck"
        ? calculateCombinedDriverTenures(filtered) // For truck, show driver tenures
        : calculateTenures(filtered, "truck"); // For driver, show truck tenures

    // Filter out assignments that lasted 1 day or less (unless current)
    tenures = tenures.filter((tenure) => tenure.endDate === null || tenure.durationDays >= 2);

    // Group tenures by week (using start date)
    const byWeek: { [weekKey: string]: Tenure[] } = {};
    tenures.forEach((tenure) => {
      if (!tenure.startDate) return;

      const entryDate = new Date(tenure.startDate + "T12:00:00");
      const weekStart = startOfWeek(entryDate, { weekStartsOn: 2 });
      const weekKey = format(weekStart, "yyyy-MM-dd");
      if (!byWeek[weekKey]) byWeek[weekKey] = [];
      byWeek[weekKey].push(tenure);
    });

    return byWeek;
  }, [filterInfo.filterType, assignmentHistory]);

  // Group terminated drivers by week for display as red rows
  const terminationsByWeek = useMemo(() => {
    if (!filterInfo.filterType || terminatedDrivers.length === 0) return {};

    const byWeek: { [weekKey: string]: typeof terminatedDrivers } = {};
    terminatedDrivers.forEach((driver) => {
      if (!driver.termination_date) return;

      const datePart = extractDatePart(driver.termination_date);
      if (!datePart) return;

      const entryDate = new Date(datePart + "T12:00:00");
      const weekStart = startOfWeek(entryDate, { weekStartsOn: 2 });
      const weekKey = format(weekStart, "yyyy-MM-dd");
      if (!byWeek[weekKey]) byWeek[weekKey] = [];
      byWeek[weekKey].push(driver);
    });

    return byWeek;
  }, [filterInfo.filterType, terminatedDrivers]);

  // Pagination - paginate individual orders first
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Group paginated orders by week (Monday-Sunday), respecting week overrides
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

          // Calculate original week
          const originalWeekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 }); // Tuesday
          const originalWeekKey = format(originalWeekStart, "yyyy-MM-dd");

          // Check if this order has a week override
          const overrideWeekKey = weekOverrides?.[order.id];
          const weekKey = overrideWeekKey || originalWeekKey;

          // Store original week info on order for undo functionality
          const orderWithMeta = {
            ...order,
            _originalWeekKey: originalWeekKey,
            _hasWeekOverride: !!overrideWeekKey,
          };

          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(orderWithMeta);
        } catch (e) {
          console.error("Error parsing date:", e, "for order:", order.deliveryDate);
        }
      }
    });

    // Include week keys that only contain history or termination entries
    // (otherwise weeks where the only order was filtered out — e.g. $0 freight —
    // would silently drop the termination/history rows).
    const allWeekKeys = new Set<string>([
      ...Object.keys(groups),
      ...Object.keys(historyEntriesByWeek || {}),
      ...Object.keys(terminationsByWeek || {}),
    ]);

    const weekGroups = Array.from(allWeekKeys)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => {
        if (!groups[weekKey]) groups[weekKey] = [];
        // Get tenure entries for this week (already consolidated like truck history dialog)
        const weekTenures = historyEntriesByWeek[weekKey] || [];

        // Convert tenures to display items
        const historyAsItems = weekTenures.map((tenure: Tenure) => {
          const isCurrent = tenure.endDate === null;
          const duration = formatTenureDuration(tenure.durationDays);
          const durationText = isCurrent ? `current-${duration}` : duration;

          let changeDescription: string;

          if (filterInfo.filterType === "truck") {
            // Filtering by truck - showing driver changes on this truck
            // Note: We don't have info about driver's previous truck when querying by truck
            const driverName = tenure.entityName || "Unassigned";
            changeDescription = `Driver change: ${driverName} (${durationText})`;
          } else {
            // Filtering by driver - showing truck changes for this driver
            const newTruck = tenure.entityName || "Unassigned";
            // For driver filter, oldEntityName is the previous truck number from old_truck_number
            if (tenure.oldEntityName && tenure.oldEntityName !== newTruck) {
              changeDescription = `Truck change to ${newTruck} from ${tenure.oldEntityName} (${durationText})`;
            } else {
              changeDescription = `Truck: ${newTruck} (${durationText})`;
            }
          }

          return {
            _isHistoryEntry: true,
            // Use tenure start date + entity as unique ID
            _historyId: `${tenure.startDate}-${tenure.entityId || "none"}`,
            _historyDate: tenure.startDate,
            _historyDateDisplay: tenure.startDate ? format(new Date(tenure.startDate + "T12:00:00"), "MM/dd/yyyy") : "",
            _changeDescription: changeDescription,
            _reason: tenure.endReason,
            _changedAt: tenure.startDate, // Use start date for sorting
            _changedByName: tenure.changedByName,
            // For sorting purposes - treat as the date
            deliveryDate: tenure.startDate,
            // Store entity info for nested trips dropdown (when filtering by truck, entity is driver)
            _entityType: filterInfo.filterType === "truck" ? "driver" : "truck",
            _entityName: tenure.entityName || "Unassigned",
            _entityId: tenure.entityId,
            // Store the underlying history entry IDs for deletion
            _historyEntryIds: tenure.historyEntryIds || [],
          };
        });

        // Get terminated drivers for this week and convert to red row items
        const weekTerminations = terminationsByWeek[weekKey] || [];
        const terminationAsItems = weekTerminations.map((driver) => {
          const datePart = extractDatePart(driver.termination_date);
          const driverName = driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
          // Get termination note for this driver, fallback to generic message
          const terminationNote = terminationNotesByDriverId[driver.id] || "Driver has been terminated";

          return {
            _isTerminationEntry: true,
            // Use stable unique ID from database
            _terminationId: driver.id,
            _terminationDate: datePart,
            _terminationDateDisplay: datePart ? format(new Date(datePart + "T12:00:00"), "MM/dd/yyyy") : "",
            _terminationDriverName: driverName,
            _terminationDescription: `Driver Terminated: ${driverName}`,
            _terminationNote: terminationNote,
            // For sorting purposes - treat as the date
            deliveryDate: datePart,
          };
        });

        // Merge orders, history entries, and termination entries
        const allItems = [...groups[weekKey], ...historyAsItems, ...terminationAsItems];

        // HARDENED: Sort by date (newest first) with secondary sort for stability
        // - Primary: Date (descending)
        // - Secondary: Timestamp precision for same-day items (for history entries)
        // - Tertiary: ID for absolute stability
        allItems.sort((a, b) => {
          // Primary sort: by date
          const getDateValue = (item: any): number => {
            const dateStr = item.deliveryDate || item.pickupDate;
            if (!dateStr) return 0;
            const normalizedStr = String(dateStr).replace(" ", "T");
            const datePart = normalizedStr.split("T")[0];
            return datePart ? new Date(datePart + "T12:00:00").getTime() : 0;
          };
          const dateA = getDateValue(a);
          const dateB = getDateValue(b);

          if (dateA !== dateB) {
            return dateB - dateA; // Newest first
          }

          // Secondary sort: For items on the same day, use full timestamp if available
          const getTimestamp = (item: any): number => {
            if (item._isHistoryEntry && item._changedAt) {
              return new Date(item._changedAt).getTime();
            }
            // For termination entries, use termination date (end of day)
            if (item._isTerminationEntry && item._terminationDate) {
              return new Date(item._terminationDate + "T23:59:59").getTime();
            }
            // For orders, use delivery datetime with time component
            const dt = item.deliveryDatetime || item.deliveryDate;
            if (dt) return new Date(String(dt).replace(" ", "T")).getTime();
            return 0;
          };
          const tsA = getTimestamp(a);
          const tsB = getTimestamp(b);

          if (tsA !== tsB) {
            return tsB - tsA; // Newest first
          }

          // Tertiary sort: By ID for absolute stability
          const idA = a._historyId || a._terminationId || a.id || a.virtualId || "";
          const idB = b._historyId || b._terminationId || b.id || b.virtualId || "";
          return idB.localeCompare(idA);
        });

        return {
          weekStart: weekKey,
          orders: allItems,
        };
      });

    return weekGroups;
  }, [
    paginatedOrders,
    weekOverrides,
    historyEntriesByWeek,
    terminationsByWeek,
    filterInfo.filterType,
    terminationNotesByDriverId,
  ]);

  // Handle drag end for moving loads between weeks
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;

      // No destination = dropped outside
      if (!destination) return;

      // Dropped in same week = no change
      if (destination.droppableId === source.droppableId) return;

      // Find the order being moved
      const orderId = draggableId.split("_drag_")[0];
      const sourceWeekKey = source.droppableId.replace("week-", "");
      const targetWeekKey = destination.droppableId.replace("week-", "");

      // Find original week for this order
      const sourceWeek = groupedByWeek.find((w) => w.weekStart === sourceWeekKey);
      const order = sourceWeek?.orders.find((o: any) => o.id === orderId || o.virtualId?.startsWith(orderId));

      if (!order) return;

      const originalWeekKey = order._originalWeekKey || sourceWeekKey;

      // Create or update the week override
      createWeekOverrideMutation.mutate({
        orderId: order.id,
        originalWeekStart: originalWeekKey,
        targetWeekStart: targetWeekKey,
      });
    },
    [groupedByWeek, createWeekOverrideMutation],
  );

  // Handle reverting a load to its original week
  const handleRevertToOriginalWeek = useCallback(
    (orderId: string) => {
      deleteWeekOverrideMutation.mutate(orderId);
    },
    [deleteWeekOverrideMutation],
  );

  const exportWeekToExcel = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    scheduledDeductions: ScheduledDeduction[] = [],
  ) => {
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
          "name, company_id, company_name, agreement_start_date, weekly_payment, weeks_count, is_company_driver, cents_per_mile, companies!drivers_company_id_fkey(name)",
        )
        .eq("id", firstOrder.driver1Id)
        .single();

      if (driverError) {
        console.error("Error fetching driver:", driverError);
      }

      const companyName = driver?.companies?.name || "";

      // Override company based on driver_company_history for the statement week.
      // The historical company assignment determines which template to use, not the driver's current company.
      let resolvedCompanyName = companyName;
      try {
        // Use the company active at the start of the statement week.
        const { data: historyRows } = await supabase
          .from("driver_company_history")
          .select("company_name_snapshot, started_at, ended_at")
          .eq("driver_id", firstOrder.driver1Id)
          .lte("started_at", weekStartDate.toISOString())
          .or(`ended_at.is.null,ended_at.gte.${weekStartDate.toISOString()}`)
          .order("started_at", { ascending: false })
          .limit(1);
        const snapshot = historyRows?.[0]?.company_name_snapshot;
        if (snapshot) {
          resolvedCompanyName = snapshot;
        }
      } catch (e) {
        console.warn("driver_company_history lookup failed; falling back to current company", e);
      }

      // Check if driver is a company driver - use company driver template regardless of company
      if (driver?.is_company_driver) {
        await exportCompanyDriverTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else if (resolvedCompanyName === "BF Prime United LLC") {
        await exportBFPrimeTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else if (
        resolvedCompanyName === "BF Prime Drivers LLC" ||
        resolvedCompanyName === "BF Prime Trucks LLC" ||
        resolvedCompanyName === "BF Prime LLC"
      ) {
        await exportBFPrimeDriversTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else if (resolvedCompanyName === "Beverly Freight Inc") {
        await exportBeverlyFreightTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else if (resolvedCompanyName === "BG Prime Inc") {
        await exportBGPrimeIncTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else if (resolvedCompanyName === "United Enterprise Solutions INC") {
        await exportUnitedEnterpriseSolutionsTemplate(
          week,
          weekStartDate,
          weekEndDate,
          firstOrder,
          driver,
          scheduledDeductions,
        );
      } else if (resolvedCompanyName === "AP Silver Trans LLC") {
        await exportAPSilverTransTemplate(week, weekStartDate, weekEndDate, firstOrder, driver, scheduledDeductions);
      } else {
        // Use the old export method for other companies
        exportGenericExcel(week, weekStartDate, weekEndDate);
      }
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export to Excel");
    }
  };

  // Company Driver Template Export
  const exportCompanyDriverTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
    scheduledDeductions: ScheduledDeduction[] = [],
  ) => {
    try {
      // Load the Company Driver template
      const response = await fetch(new URL("../assets/templates/Company_Driver.xlsx", import.meta.url).toString());
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
        .eq("statement_type", "company_driver")
        .single();

      let invoiceNumber = 23108; // Default starting number from template

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
            .eq("statement_type", "company_driver");
        }
      }

      // Find Thursday 2 weeks in the future
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursdayDate = addDays(weekStartDate, 16);

      // F3: Statement number
      const f3Cell = worksheet.getCell("F3");
      f3Cell.value = invoiceNumber;

      // F4: Date (Thursday)
      const f4Cell = worksheet.getCell("F4");
      f4Cell.value = format(thursdayDate, "M/d/yy");

      // F5: Unit# (Truck number)
      const f5Cell = worksheet.getCell("F5");
      f5Cell.value = firstOrder.truckNumber || "";

      // F7: Company (Driver's company_name from drivers table, NOT the company they're assigned to)
      const f7Cell = worksheet.getCell("F7");
      f7Cell.value = driver?.company_name || "";

      // J3: cents_per_mile as dollars (e.g., 0.60 for 60 cents)
      const j3Cell = worksheet.getCell("J3");
      const centsPerMile = driver?.cents_per_mile || 0;
      j3Cell.value = `$${(centsPerMile / 100).toFixed(2)}`;

      // J7: Driver name
      const j7Cell = worksheet.getCell("J7");
      j7Cell.value = driver?.name || "";

      // B12: Date range of that week
      const b12Cell = worksheet.getCell("B12");
      b12Cell.value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`;

      // Clear the trip rows (rows 14-19) by directly setting values to null
      for (let row = 14; row <= 19; row++) {
        worksheet.getCell(`A${row}`).value = null;
        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
        worksheet.getCell(`F${row}`).value = null;
        worksheet.getCell(`G${row}`).value = null;
        worksheet.getCell(`H${row}`).value = null;
        worksheet.getCell(`I${row}`).value = null;
        worksheet.getCell(`J${row}`).value = null;
      }

      // Trips Rows 14-19
      let currentRow = 14;
      sortedOrders.forEach((order: any) => {
        if (currentRow > 19) return;

        // A: Internal load number
        worksheet.getCell(`A${currentRow}`).value = formatInternalLoadNumber(
          order.internalLoadNumber,
          order.companyName,
        );

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

        // J: Total miles (mileage)
        const cellJ = worksheet.getCell(`J${currentRow}`);
        cellJ.value = parseFloat(String(order.mileage)) || 0;

        currentRow++;
      });

      // Collect positive additionals (Credits) from all orders for rows 27-31
      const credits: Array<{
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
          });
        }
      });

      // Write credits section (rows 27-31)
      let creditsRow = 27;
      credits.forEach((credit) => {
        if (creditsRow > 31) return;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions (rows 37-40)
      const negativeAdditionals: Array<{
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0) {
          negativeAdditionals.push({
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
          });
        }
      });

      // Write deductions section (rows 37-40)
      const endDateFormatted = format(weekEndDate, "M/d/yy");
      let deductionsRow = 37;
      negativeAdditionals.forEach((neg) => {
        if (deductionsRow > 40) return;
        worksheet.getCell(`C${deductionsRow}`).value = neg.type;
        worksheet.getCell(`I${deductionsRow}`).value = endDateFormatted;
        const amtCell = worksheet.getCell(`J${deductionsRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        deductionsRow++;
      });

      // Fetch and write EFS deductions (cash advances and other requests) after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate,
      );
      efsDeductions.forEach((efs) => {
        if (deductionsRow > 40) return;
        worksheet.getCell(`C${deductionsRow}`).value = efs.description;
        worksheet.getCell(`I${deductionsRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${deductionsRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        deductionsRow++;
      });

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      // Credits go to credits section, expenses/yearly go to deductions section
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (after existing credits, rows 27-31)
        let creditsRowCD = 27;
        credits.forEach(() => creditsRowCD++); // Skip existing credits
        creditDeductions.forEach((credit) => {
          if (creditsRowCD > 31) return;
          worksheet.getCell(`C${creditsRowCD}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRowCD}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${creditsRowCD}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRowCD++;
        });

        // Write expense/yearly deductions
        expenseDeductions.forEach((deduction) => {
          if (deductionsRow > 40) return;
          worksheet.getCell(`C${deductionsRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${deductionsRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${deductionsRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          deductionsRow++;
        });
      }

      // Fetch and write fuel transactions (rows 45-54 based on template structure)
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
      );
      writeFuelTransactionsToWorksheet(worksheet, fuelTransactions, 45, 54);

      // Generate filename
      const driverName = driver?.name?.replace(/\s+/g, "_") || "Unknown";
      const weekStart = format(weekStartDate, "MM-dd-yyyy");
      const weekEnd = format(weekEndDate, "MM-dd-yyyy");
      const filename = `${driverName}_Company_Driver_Statement_${weekStart}_to_${weekEnd}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 60, 12);
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

      toast.success("Company driver statement exported successfully");
    } catch (error) {
      console.error("Error exporting Company Driver template:", error);
      toast.error("Failed to export company driver statement");
    }
  };

  const exportBFPrimeDriversTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
    scheduledDeductions: ScheduledDeduction[] = [],
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
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursday = addDays(weekStartDate, 16);
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
        worksheet.getCell(`A${currentRow}`).value = formatInternalLoadNumber(
          order.internalLoadNumber,
          order.companyName,
        );

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
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
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
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
          });
        }
      });

      // Deductions section (rows 32-43 for BF Prime Drivers)
      // Fixed deductions at the start - date should be week end date
      const endDateFormatted = format(weekEndDate, "M/d");
      const deductions = [
        { row: 32, description: "Cargo Insurance", amount: 285.0 },
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

        // Set week end date in column I for fixed deductions
        worksheet.getCell(`I${row}`).value = endDateFormatted;

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
        weekEndDate,
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

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      // Credits go to credits section, expenses/yearly go to deductions section
      if (scheduledDeductions.length > 0) {
        // Separate credits from deductions
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (after existing credits)
        creditDeductions.forEach((credit) => {
          if (creditsRow > 31) return; // Credits section ends at 31
          worksheet.getCell(`C${creditsRow}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${creditsRow}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRow++;
        });

        // Write expense/yearly deductions to deductions section
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 43) return; // Deductions section ends at 43
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fetch and write fuel transactions (rows 48-66 for BF Prime)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
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
    scheduledDeductions: ScheduledDeduction[] = [],
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
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursday = addDays(weekStartDate, 16);
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
        worksheet.getCell(`A${currentRow}`).value = formatInternalLoadNumber(
          order.internalLoadNumber,
          order.companyName,
        );

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
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
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
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
          });
        }
      });

      // Deductions section (rows 32-44 for Beverly Freight)
      const deductions = [
        { row: 32, description: "Cargo Insurance", amount: 285.0 },
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
        weekEndDate,
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

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      // Credits go to credits section, expenses/yearly go to deductions section
      const endDateFormattedBF = format(weekEndDate, "M/d/yy");
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (rows 27-31 for Beverly)
        creditDeductions.forEach((credit) => {
          if (creditsRow > 31) return;
          worksheet.getCell(`C${creditsRow}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRow}`).value = endDateFormattedBF;
          const amtCell = worksheet.getCell(`J${creditsRow}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRow++;
        });

        // Write expense/yearly deductions
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 44) return;
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = endDateFormattedBF;
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fetch and write fuel transactions (rows 49-63 for Beverly Freight)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
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
    scheduledDeductions: ScheduledDeduction[] = [],
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
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursdayDate = addDays(weekStartDate, 16);

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
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
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
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
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
        worksheet.getCell(`B${row}`).value = description;
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
        weekEndDate,
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

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      // Credits go to credits section, expenses/yearly go to deductions section
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (rows 19-21 for BG Inc)
        creditDeductions.forEach((credit) => {
          if (creditsRow > 21) return;
          worksheet.getCell(`C${creditsRow}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${creditsRow}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRow++;
        });

        // Write expense/yearly deductions
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 32) return;
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fetch and write fuel transactions (rows 38-44 for BG Inc)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
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

  // Helper to write fuel transactions for United Enterprise Solutions template
  // Uses different column layout: A=transaction_number, B=date, C=location, D=city, E=state, F=fees, H=unit_price, I=qty, J=amount
  const writeFuelTransactionsForUES = (
    worksheet: ExcelJS.Worksheet,
    fuelTransactions: FuelTransaction[],
    startRow: number,
    endRow: number,
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

      // G: item (skip in UES template per user spec)

      // H: unit_price - set to amount when quantity is 1, rounded to 2 decimals
      const quantity = parseFloat(String(fuel.quantity)) || 0;
      const amount = parseFloat(String(fuel.amount)) || 0;
      const unitPrice = quantity === 1 || quantity === 1.0 ? amount : parseFloat(String(fuel.unit_price)) || 0;
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

  const exportUnitedEnterpriseSolutionsTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
    scheduledDeductions: ScheduledDeduction[] = [],
  ) => {
    try {
      // Load the United Enterprise Solutions template
      const response = await fetch(
        new URL("../assets/templates/United_Enterprise_Solutions.xlsx", import.meta.url).toString(),
      );
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
        .eq("statement_type", "united_enterprise_solutions")
        .single();

      let invoiceNumber = 8725; // Default starting number from template

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
            .eq("statement_type", "united_enterprise_solutions");
        }
      }

      // Find Thursday 2 weeks in the future
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursdayDate = addDays(weekStartDate, 16);

      // C2: Issue date (Thursday 2 weeks in future)
      const c2Cell = worksheet.getCell("C2");
      c2Cell.value = format(thursdayDate, "M/d/yy");

      // C3: Pay period (date range)
      const c3Cell = worksheet.getCell("C3");
      c3Cell.value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`;

      // C4: Invoice number
      const c4Cell = worksheet.getCell("C4");
      c4Cell.value = invoiceNumber;

      // C6: Driver name
      const c6Cell = worksheet.getCell("C6");
      c6Cell.value = driver?.name || firstOrder.driverName || "";

      // C7: Driver's company name (the company the driver has/owns)
      const c7Cell = worksheet.getCell("C7");
      c7Cell.value = driver?.company_name || "";

      // C8: Agreement start date
      if (driver?.agreement_start_date) {
        const c8Cell = worksheet.getCell("C8");
        c8Cell.value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      }

      // C9: Truck number
      const c9Cell = worksheet.getCell("C9");
      c9Cell.value = firstOrder.truckNumber || "";

      // C10: Agreement terms (weekly payment/weeks count)
      if (driver?.weekly_payment && driver?.weeks_count) {
        const c10Cell = worksheet.getCell("C10");
        c10Cell.value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;
      }

      // Clear the trip rows (rows 13-20) by directly setting values to null
      for (let row = 13; row <= 20; row++) {
        worksheet.getCell(`A${row}`).value = null;
        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
        worksheet.getCell(`F${row}`).value = null;
        worksheet.getCell(`G${row}`).value = null;
        worksheet.getCell(`H${row}`).value = null;
        worksheet.getCell(`I${row}`).value = null;
        worksheet.getCell(`J${row}`).value = null;
      }

      // Fill in trip details starting at row 13 - BASE ONLY (driverPrice, not totalDriverPay)
      let currentRow = 13;

      sortedOrders.forEach((order: any) => {
        if (currentRow > 20) return;

        // A: Trip # (Internal load number)
        worksheet.getCell(`A${currentRow}`).value = formatInternalLoadNumber(
          order.internalLoadNumber,
          order.companyName,
        );

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

        // I: Freight Amount (driver pay)
        const driverPay = parseFloat(order.driverPrice) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = driverPay;
        cellI.numFmt = "$#,##0.00";

        // J: Freight Amount (88%) - formula
        const cellJ = worksheet.getCell(`J${currentRow}`);
        cellJ.value = { formula: `I${currentRow}*0.88` };
        cellJ.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply USD currency format to Trips section columns I and J (rows 13-20)
      for (let row = 13; row <= 20; row++) {
        worksheet.getCell(`I${row}`).numFmt = "$#,##0.00";
        worksheet.getCell(`J${row}`).numFmt = "$#,##0.00";
      }

      // Deductions section (rows 25-33)
      const endDateFormatted = format(weekEndDate, "M/d/yyyy");
      const deductions = [
        { row: 25, description: "Cargo Insurance", amount: 285.0 },
        { row: 26, description: "Trailer + Insurance", amount: 285.0 },
        { row: 27, description: "ELD", amount: 50.0 },
        { row: 28, description: "Pre-Pass", amount: 20.0 },
        { row: 29, description: "Truck Payment" },
        { row: 30, description: "Truck Insurance", amount: 195.0 },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const cellB = worksheet.getCell(`B${row}`);
        cellB.value = description;
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amount !== undefined) {
          const cellJ = worksheet.getCell(`J${row}`);
          cellJ.value = amount;
          cellJ.numFmt = "$#,##0.00";
        }
      });

      // Set J29 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j29Cell = worksheet.getCell("J29");
        j29Cell.value = driver.weekly_payment;
        j29Cell.numFmt = "$#,##0.00";
      }

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
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
          });
        }
      });

      // Write negative additionals after fixed deductions (rows 31-33)
      let negativeRow = 31;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 33) return;
        worksheet.getCell(`B${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Fetch and write EFS deductions after negative additionals
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate,
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 33) return;
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      // Credits go to credits section, expenses/yearly go to deductions section
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (will be added to rows 36-38 below)
        // Store for later when we write the credits section
        creditDeductions.forEach((credit) => {
          credits.push({
            type: `Credit: ${credit.explanation}`,
            deliveryDate: format(weekEndDate, "M/d/yy"),
            amount: credit.deductionAmount,
          });
        });

        // Write expense/yearly deductions
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 33) return;
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = format(weekEndDate, "M/d/yy");
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fetch and write fuel transactions (rows 39-54)
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
      );
      writeFuelTransactionsForUES(worksheet, fuelTransactions, 39, 54);

      // Collect positive additionals (Credits) from all orders
      const credits: Array<{
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];

      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0) {
          credits.push({
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
          });
        }
      });

      // Write credits section (rows 58-60)
      let creditsRow = 58;
      credits.forEach((credit) => {
        if (creditsRow > 60) return;
        worksheet.getCell(`B${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const driverName = driver?.name || firstOrder?.driverName || "";
      const driverInfo = driverName && typeof driverName === "string" ? `_${driverName.replace(/\s+/g, "-")}` : "";
      const filename = `United_Enterprise_Solutions_${weekRange}${driverInfo}.xlsx`;

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70, 12);
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
      console.error("Error exporting United Enterprise Solutions template:", error);
      toast.error("Failed to export statement");
    }
  };

  const exportAPSilverTransTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
    scheduledDeductions: ScheduledDeduction[] = [],
  ) => {
    try {
      const response = await fetch(new URL("../assets/templates/AP_Silver_Trans.xlsx", import.meta.url).toString());
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template worksheet not found");

      const sortedOrders = sortOrdersAscending(week.orders);

      // Invoice number from DB
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "ap_silver_trans")
        .single();

      let invoiceNumber = 547;
      if (!configError && configData) {
        const currentMonday = startOfWeek(weekStartDate, { weekStartsOn: 1 });
        const lastMonday = new Date(configData.last_monday);
        invoiceNumber = configData.current_number;
        if (currentMonday.getTime() !== lastMonday.getTime()) {
          invoiceNumber = configData.current_number + 1;
          await supabase
            .from("invoice_number_config")
            .update({ current_number: invoiceNumber, last_monday: format(currentMonday, "yyyy-MM-dd") })
            .eq("statement_type", "ap_silver_trans");
        }
      }

      // Thursday 2 weeks in the future from week start (Tuesday)
      const thursdayDate = addDays(weekStartDate, 16);

      // D2: Issue date (Thursday)
      worksheet.getCell("D2").value = format(thursdayDate, "M/d/yy");
      // D3: Pay period
      worksheet.getCell("D3").value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`;
      // D4: Invoice number
      worksheet.getCell("D4").value = invoiceNumber;

      // C6: Driver name
      worksheet.getCell("C6").value = driver?.name || firstOrder.driverName || "";
      // C7: Driver's company name (company_name field from drivers table)
      worksheet.getCell("C7").value = driver?.company_name || "";
      // C8: Agreement start date (centered)
      if (driver?.agreement_start_date) {
        const c8Cell = worksheet.getCell("C8");
        c8Cell.value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
        c8Cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      // C9: Truck number
      worksheet.getCell("C9").value = firstOrder.truckNumber || "";
      // Preserve borders on E6-E10
      for (let r = 6; r <= 10; r++) {
        const eCell = worksheet.getCell(`E${r}`);
        if (!eCell.border) {
          eCell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }
      }
      // C10: Agreement terms
      if (driver?.weekly_payment && driver?.weeks_count) {
        worksheet.getCell("C10").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;
      }

      // Clear trip rows 13-19
      for (let row = 13; row <= 19; row++) {
        for (const col of ["A", "B", "C", "E", "F", "H", "I", "J"]) {
          worksheet.getCell(`${col}${row}`).value = null;
        }
      }

      // Fill trips (rows 13-19)
      // A=Trip#, B=Pickup Date, C=Pickup Location (city, state), E=Delivery Date, F=Delivery Location, H=Mileage, I=Freight Amount, J=Freight Amount (88%)
      let currentRow = 13;
      sortedOrders.forEach((order: any) => {
        if (currentRow > 19) return;
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = parseFloat(String(order.mileage)) || 0;

        const driverPay = parseFloat(order.driverPrice) || 0;
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = driverPay;
        cellI.numFmt = "$#,##0.00";

        // 88% of freight
        const cellJ = worksheet.getCell(`J${currentRow}`);
        cellJ.value = driverPay * 0.88;
        cellJ.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Apply currency format to trip rows
      for (let row = 13; row <= 19; row++) {
        worksheet.getCell(`I${row}`).numFmt = "$#,##0.00";
        worksheet.getCell(`J${row}`).numFmt = "$#,##0.00";
      }

      // Collect credits (positive additionals) for Credits section (rows 58-60)
      const credits: Array<{ internalLoadNumber: string; type: string; deliveryDate: string; amount: number }> = [];
      sortedOrders.forEach((order: any) => {
        const detention = Number(order.detentionDriver) || 0;
        if (detention > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Detention",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: detention,
          });
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0)
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
          });
      });

      let creditsRow = 58;
      credits.forEach((credit) => {
        if (creditsRow > 60) return;
        worksheet.getCell(`C${creditsRow}`).value = credit.type;
        worksheet.getCell(`I${creditsRow}`).value = credit.deliveryDate;
        const amtCell = worksheet.getCell(`J${creditsRow}`);
        amtCell.value = credit.amount;
        amtCell.numFmt = "$#,##0.00";
        creditsRow++;
      });

      // Collect negative additionals for deductions section
      const negativeAdditionals: Array<{
        internalLoadNumber: string;
        type: string;
        deliveryDate: string;
        amount: number;
      }> = [];
      sortedOrders.forEach((order: any) => {
        const lateFee = Math.abs(Number(order.lateFeeDriver) || 0);
        if (lateFee > 0)
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Late Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lateFee,
          });
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0)
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0)
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0)
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
          });
      });

      // Fixed deductions (rows 25-33)
      const endDateFormatted = format(weekEndDate, "MM/dd/yyyy");
      const deductions = [
        { row: 25, description: "Cargo Insurance", amount: 285.0 },
        { row: 26, description: "Trailer + Insurance", amount: 285.0 },
        { row: 27, description: "ELD", amount: 50.0 },
        { row: 28, description: "Pre-Pass", amount: 20.0 },
        { row: 29, description: "Truck Payment" },
        { row: 30, description: "Truck Insurance", amount: 195.0 },
      ];
      deductions.forEach(({ row, description, amount }) => {
        worksheet.getCell(`B${row}`).value = description;
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amount !== undefined) {
          const cellJ = worksheet.getCell(`J${row}`);
          cellJ.value = amount;
          cellJ.numFmt = "$#,##0.00";
        }
      });

      // Truck payment weeks info
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        worksheet.getCell("E29").value = `${weeksPassed}/${driver.weeks_count}`;
        worksheet.getCell("E29").font = { bold: true, size: 11 };
      }
      if (driver?.weekly_payment) {
        const j29Cell = worksheet.getCell("J29");
        j29Cell.value = driver.weekly_payment;
        j29Cell.numFmt = "$#,##0.00";
      }

      // Write negative additionals after fixed deductions
      let negativeRow = 31;
      negativeAdditionals.forEach((neg) => {
        if (negativeRow > 33) return;
        worksheet.getCell(`B${negativeRow}`).value = neg.internalLoadNumber;
        worksheet.getCell(`C${negativeRow}`).value = neg.type;
        worksheet.getCell(`I${negativeRow}`).value = neg.deliveryDate;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = neg.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // EFS deductions
      const efsDeductions = await fetchEfsDeductionsForStatement(
        firstOrder.driver1Id || "",
        weekStartDate,
        weekEndDate,
      );
      efsDeductions.forEach((efs) => {
        if (negativeRow > 33) return;
        worksheet.getCell(`B${negativeRow}`).value = efs.description;
        worksheet.getCell(`I${negativeRow}`).value = efs.date;
        const amtCell = worksheet.getCell(`J${negativeRow}`);
        amtCell.value = efs.amount;
        amtCell.numFmt = "$#,##0.00";
        negativeRow++;
      });

      // Scheduled deductions from Stuff
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");
        creditDeductions.forEach((credit) => {
          if (creditsRow > 60) return;
          worksheet.getCell(`C${creditsRow}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${creditsRow}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRow++;
        });
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 33) return;
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fuel transactions (rows 39-54)
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
      );
      writeFuelTransactionsForUES(worksheet, fuelTransactions, 39, 54);

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const driverName = driver?.name || firstOrder?.driverName || "";
      const driverInfo = driverName && typeof driverName === "string" ? `_${driverName.replace(/\s+/g, "-")}` : "";
      const filename = `AP_Silver_Trans_${weekRange}${driverInfo}.xlsx`;

      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70, 12);
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
      console.error("Error exporting AP Silver Trans template:", error);
      toast.error("Failed to export statement");
    }
  };

  const exportBFPrimeTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
    scheduledDeductions: ScheduledDeduction[] = [],
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
      // Week starts on Tuesday, so Thursday is +2 days, then +14 days for 2 weeks = 16 total
      const thursdayDate = addDays(weekStartDate, 16);

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
            amount: detention,
          });
        }
        const layover = Number(order.layoverDriver) || 0;
        if (layover > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Layover",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: layover,
          });
        }
        const tonu = Number(order.tonuDriver) || 0;
        if (tonu > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "TONU",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: tonu,
          });
        }
        const extraStop = Number(order.extraStopDriver) || 0;
        if (extraStop > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Extra Stop",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: extraStop,
          });
        }
        const lumper = Number(order.lumperDriver) || 0;
        if (lumper > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Lumper",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: lumper,
          });
        }
        const otherAdditionals = Number((order as any).otherAdditionalsDriver) || 0;
        if (otherAdditionals > 0) {
          credits.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherAdditionalsReason || "Other Additionals",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherAdditionals,
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
            amount: lateFee,
          });
        }
        const noTrackingFee = Math.abs(Number(order.noTrackingFeeDriver) || 0);
        if (noTrackingFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "No Tracking Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: noTrackingFee,
          });
        }
        const wrongAddressFee = Math.abs(Number(order.wrongAddressFeeDriver) || 0);
        if (wrongAddressFee > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: "Wrong Address Fee",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: wrongAddressFee,
          });
        }
        const otherCharges = Math.abs(Number(order.otherChargesDriver) || 0);
        if (otherCharges > 0) {
          negativeAdditionals.push({
            internalLoadNumber: order.internalLoadNumber || "",
            type: (order as any).otherChargesReason || "Other Charges",
            deliveryDate: formatDateDisplay(order.deliveryDate),
            amount: otherCharges,
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
        weekEndDate,
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

      // Write scheduled deductions (from driver expenses in Stuff) after EFS deductions
      if (scheduledDeductions.length > 0) {
        const creditDeductions = scheduledDeductions.filter((d) => d.expenseType === "credit");
        const expenseDeductions = scheduledDeductions.filter((d) => d.expenseType !== "credit");

        // Write credits to credits section (rows 52-54 for BF Prime United)
        creditDeductions.forEach((credit) => {
          if (creditsRow > 54) return;
          worksheet.getCell(`C${creditsRow}`).value = `Credit: ${credit.explanation}`;
          worksheet.getCell(`I${creditsRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${creditsRow}`);
          amtCell.value = credit.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          creditsRow++;
        });

        // Write expense/yearly deductions
        expenseDeductions.forEach((deduction) => {
          if (negativeRow > 47) return;
          worksheet.getCell(`B${negativeRow}`).value = `Scheduled: ${deduction.explanation}`;
          worksheet.getCell(`I${negativeRow}`).value = endDateFormatted;
          const amtCell = worksheet.getCell(`J${negativeRow}`);
          amtCell.value = deduction.deductionAmount;
          amtCell.numFmt = "$#,##0.00";
          negativeRow++;
        });
      }

      // Fetch and write fuel transactions (rows 23-34 for BF Prime United)
      // Uses new logic: prev week last delivery to current week last delivery - 1
      const fuelTransactions = await fetchFuelTransactionsForStatement(
        firstOrder.truckNumber || "",
        firstOrder.truckId || "",
        week.orders,
        weekStartDate,
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
        "Freight Amount": order.totalFreightAmountNoLumper || 0,
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
        "Freight Amount": week.orders.reduce((acc: number, o: any) => acc + (o.totalFreightAmountNoLumper || 0), 0),
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
      const filterInfo = searchFilter ? `_${searchFilter}` : "";
      const filename = `Trips_Week_${weekRange}${filterInfo}.xlsx`;

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
      // Require search filter
      if (!searchFilter) {
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
            const searchLower = searchFilter.toLowerCase().trim();
            const matchesSearch =
              !searchLower || truck.toLowerCase().includes(searchLower) || driver.toLowerCase().includes(searchLower);
            return isPaid && matchesSearch;
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
      const earliestDate = finalOrders.reduce(
        (min, order) => {
          const d = new Date(order.deliveryDate || order.pickupDate);
          return d < min ? d : min;
        },
        new Date(finalOrders[0].deliveryDate || finalOrders[0].pickupDate),
      );

      const latestDate = finalOrders.reduce(
        (max, order) => {
          const d = new Date(order.deliveryDate || order.pickupDate);
          return d > max ? d : max;
        },
        new Date(finalOrders[0].deliveryDate || finalOrders[0].pickupDate),
      );

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
      } else if (companyName === "AP Silver Trans LLC") {
        await exportFinalAPSilverTransTemplate(weekData, earliestDate, latestDate, firstOrder, driver);
      } else {
        exportGenericExcel(weekData, earliestDate, latestDate);
      }
    } catch (error) {
      console.error("Error exporting final statement:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalBFPrimeDriversTemplate = async (
    week: any,
    startDate: Date,
    endDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
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

      const { data: configData } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bf_prime_drivers")
        .single();
      worksheet.getCell("F3").value = `F-${configData?.current_number || 1000}`;
      worksheet.getCell("F4").value = format(new Date(), "MM/dd/yyyy");
      worksheet.getCell("B12").value = `${format(startDate, "MM/dd/yyyy")} - ${format(endDate, "MM/dd/yyyy")}`;
      if (driver?.agreement_start_date)
        worksheet.getCell("K3").value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
      worksheet.getCell("F7").value = driver?.companies?.name || driver?.company_name || "";
      worksheet.getCell("F5").value = firstOrder.truckNumber || "";
      worksheet.getCell("K4").value = firstOrder.truckNumber || "";
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor(
          (new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
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

      const deductions = [
        { offset: 0, desc: "Cargo Insurance", amt: 285 },
        { offset: 1, desc: "Trailer + Insurance", amt: 285 },
        { offset: 2, desc: "ELD", amt: 50 },
        { offset: 3, desc: "Pre-Pass", amt: 20 },
        { offset: 4, desc: "Truck Payment" },
        { offset: 5, desc: "Truck Insurance", amt: 195 },
      ];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        if (amt !== undefined) {
          const c = worksheet.getCell(`J${deductionStartRow + offset}`);
          c.value = amt;
          c.numFmt = "$#,##0.00";
        }
      });
      if (driver?.weekly_payment) {
        const c = worksheet.getCell(`J${deductionStartRow + 4}`);
        c.value = driver.weekly_payment;
        c.numFmt = "$#,##0.00";
      }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 73 + extraRowsNeeded, 12);
      const filename = `${(driver?.name || "Unknown").replace(/\s+/g, "_")}_Final_${format(startDate, "MM-dd-yyyy")}_to_${format(endDate, "MM-dd-yyyy")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalBeverlyFreightTemplate = async (
    week: any,
    startDate: Date,
    endDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
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

      const { data: configData } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "beverly_freight_inc")
        .single();
      worksheet.getCell("F3").value = `F-${configData?.current_number || 26198}`;
      worksheet.getCell("F4").value = format(new Date(), "MM/dd/yyyy");
      worksheet.getCell("B12").value = `${format(startDate, "MM/dd/yyyy")} - ${format(endDate, "MM/dd/yyyy")}`;
      if (driver?.agreement_start_date)
        worksheet.getCell("K3").value = format(new Date(driver.agreement_start_date), "MM/dd/yyyy");
      worksheet.getCell("F7").value = driver?.companies?.name || driver?.company_name || "";
      worksheet.getCell("F5").value = firstOrder.truckNumber || "";
      worksheet.getCell("K4").value = firstOrder.truckNumber || "";
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor(
          (new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
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

      const deductions = [
        { offset: 0, desc: "Cargo Insurance", amt: 285 },
        { offset: 1, desc: "Trailer + Insurance", amt: 285 },
        { offset: 2, desc: "ELD", amt: 50 },
        { offset: 3, desc: "Pre-Pass", amt: 20 },
        { offset: 4, desc: "Truck payment" },
        { offset: 5, desc: "Truck insurance", amt: 195 },
      ];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        if (amt !== undefined) {
          const c = worksheet.getCell(`J${deductionStartRow + offset}`);
          c.value = amt;
          c.numFmt = "$#,##0.00";
        }
      });
      if (driver?.weekly_payment) {
        const c = worksheet.getCell(`J${deductionStartRow + 4}`);
        c.value = driver.weekly_payment;
        c.numFmt = "$#,##0.00";
      }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70 + extraRowsNeeded, 12);
      const filename = `${(driver?.name || "Unknown").replace(/\s+/g, "_")}_Beverly_Final_${format(startDate, "MM-dd-yyyy")}_to_${format(endDate, "MM-dd-yyyy")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalBGPrimeIncTemplate = async (
    week: any,
    startDate: Date,
    endDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
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

      const { data: configData } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bg_prime_inc")
        .maybeSingle();
      worksheet.getCell("C7").value = `F-${configData?.current_number || 1332}`;
      worksheet.getCell("C8").value = format(new Date(), "M/d/yyyy");
      worksheet.getCell("C9").value = `${format(startDate, "M/d/yyyy")}-${format(endDate, "M/d/yyyy")}`;
      worksheet.getCell("F8").value = driver?.name || firstOrder.driverName || "";
      if (driver?.agreement_start_date)
        worksheet.getCell("J8").value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      worksheet.getCell("J9").value = firstOrder.truckNumber || "";
      if (driver?.weekly_payment && driver?.weeks_count)
        worksheet.getCell("J10").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;

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
      const deductions = [
        { offset: 0, desc: "Cargo Insurance", amt: 285 },
        { offset: 1, desc: "Trailer + Insurance", amt: 285 },
        { offset: 2, desc: "ELD", amt: 50 },
        { offset: 3, desc: "Pre-Pass", amt: 20 },
        { offset: 4, desc: "Truck Payment" },
        { offset: 5, desc: "Truck Insurance", amt: 195 },
      ];
      deductions.forEach(({ offset, desc, amt }) => {
        const row = deductionStartRow + offset;
        // Clear any shared formulas on deduction cells too
        ["B", "I", "J", "E"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${row}`);
          if (cell.model && cell.model.sharedFormula) delete cell.model.sharedFormula;
        });
        worksheet.getCell(`B${row}`).value = desc;
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amt !== undefined) {
          const c = worksheet.getCell(`J${row}`);
          c.value = amt;
          c.numFmt = "$#,##0.00";
        }
      });
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor(
          (new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        worksheet.getCell(`E${deductionStartRow + 4}`).value = `${weeksPassed}/${driver.weeks_count}`;
      }
      if (driver?.weekly_payment) {
        const c = worksheet.getCell(`J${deductionStartRow + 4}`);
        c.value = driver.weekly_payment;
        c.numFmt = "$#,##0.00";
      }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 61 + extraRowsNeeded, 12);
      const filename = `BG_Prime_Final_${format(startDate, "MMM-d")}-${format(endDate, "MMM-d-yyyy")}_${(driver?.name || "Unknown").replace(/\s+/g, "-")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalBFPrimeTemplate = async (
    week: any,
    startDate: Date,
    endDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
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

      const { data: configData } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bf_prime_united")
        .single();
      worksheet.getCell("C2").value = `F-${configData?.current_number || 8820}`;
      worksheet.getCell("B3").value = format(new Date(), "M/d/yyyy");
      worksheet.getCell("B8").value = driver?.company_name || "";
      if (driver?.agreement_start_date)
        worksheet.getCell("F7").value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      if (driver?.weekly_payment && driver?.weeks_count)
        worksheet.getCell("F9").value = `$${driver.weekly_payment}/${driver.weeks_count}`;
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
      const deductions = [
        { offset: 0, desc: "Cargo Insurance", amt: 285 },
        { offset: 1, desc: "Trailer + Insurance", amt: 285 },
        { offset: 2, desc: "ELD", amt: 50 },
        { offset: 3, desc: "Pre-Pass", amt: 20 },
        { offset: 4, desc: "Truck Payment" },
        { offset: 5, desc: "Truck Insurance", amt: 195 },
      ];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        worksheet.getCell(`I${deductionStartRow + offset}`).value = endDateFormatted;
        if (amt !== undefined) {
          const c = worksheet.getCell(`J${deductionStartRow + offset}`);
          c.value = amt;
          c.numFmt = "$#,##0.00";
        }
      });
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor(
          (new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        worksheet.getCell(`E${deductionStartRow + 4}`).value = `${weeksPassed}/${driver.weeks_count}`;
      }
      if (driver?.weekly_payment) {
        const c = worksheet.getCell(`J${deductionStartRow + 4}`);
        c.value = driver.weekly_payment;
        c.numFmt = "$#,##0.00";
      }

      // Nuclear option: rebuild workbook from scratch with only the data we need
      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 67 + extraRowsNeeded, 12);
      const filename = `BF_Prime_Final_${format(startDate, "MMM-d")}-${format(endDate, "MMM-d-yyyy")}_${(driver?.name || "Unknown").replace(/\s+/g, "-")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to export final statement");
    }
  };

  const exportFinalAPSilverTransTemplate = async (
    week: any,
    startDate: Date,
    endDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      const response = await fetch(new URL("../assets/templates/AP_Silver_Trans.xlsx", import.meta.url).toString());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Template not found");

      const orderCount = week.orders.length;
      const extraRowsNeeded = Math.max(0, orderCount - 7);

      if (extraRowsNeeded > 0) worksheet.spliceRows(20, 0, ...Array(extraRowsNeeded).fill([]));

      const { data: configData } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "ap_silver_trans")
        .single();
      worksheet.getCell("D4").value = configData?.current_number || 547;
      worksheet.getCell("D2").value = format(new Date(), "M/d/yy");
      worksheet.getCell("D3").value = `${format(startDate, "M/d/yyyy")}-${format(endDate, "M/d/yyyy")}`;
      worksheet.getCell("C6").value = driver?.name || "";
      worksheet.getCell("C7").value = driver?.company_name || "";
      if (driver?.agreement_start_date)
        worksheet.getCell("C8").value = format(new Date(driver.agreement_start_date), "M/d/yyyy");
      worksheet.getCell("C9").value = firstOrder.truckNumber || "";
      if (driver?.weekly_payment && driver?.weeks_count)
        worksheet.getCell("C10").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;

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
        cellI.value = parseFloat(order.driverPrice) || 0;
        cellI.numFmt = "$#,##0.00";
        const cellJ = worksheet.getCell(`J${currentRow}`);
        cellJ.value = (parseFloat(order.driverPrice) || 0) * 0.88;
        cellJ.numFmt = "$#,##0.00";
        currentRow++;
      });

      const deductionStartRow = 25 + extraRowsNeeded;
      const endDateFormatted = format(endDate, "M/d/yy");
      const deductions = [
        { offset: 0, desc: "Cargo Insurance", amt: 285.0 },
        { offset: 1, desc: "Trailer + Insurance", amt: 285.0 },
        { offset: 2, desc: "ELD", amt: 50.0 },
        { offset: 3, desc: "Pre-Pass", amt: 20.0 },
        { offset: 4, desc: "Truck Payment" },
        { offset: 5, desc: "Truck Insurance", amt: 195.0 },
      ];
      deductions.forEach(({ offset, desc, amt }) => {
        worksheet.getCell(`B${deductionStartRow + offset}`).value = desc;
        worksheet.getCell(`I${deductionStartRow + offset}`).value = endDateFormatted;
        if (amt !== undefined) {
          const c = worksheet.getCell(`J${deductionStartRow + offset}`);
          c.value = amt;
          c.numFmt = "$#,##0.00";
        }
      });
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const weeksPassed = Math.floor(
          (new Date().getTime() - new Date(driver.agreement_start_date).getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        worksheet.getCell(`E${deductionStartRow + 4}`).value = `${weeksPassed}/${driver.weeks_count}`;
      }
      if (driver?.weekly_payment) {
        const c = worksheet.getCell(`J${deductionStartRow + 4}`);
        c.value = driver.weekly_payment;
        c.numFmt = "$#,##0.00";
      }

      const cleanWorkbook = await rebuildWorkbookClean(workbook, 1, 70 + extraRowsNeeded, 12);
      const filename = `AP_Silver_Final_${format(startDate, "MMM-d")}-${format(endDate, "MMM-d-yyyy")}_${(driver?.name || "Unknown").replace(/\s+/g, "-")}.xlsx`;
      const buffer = await cleanWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Final statement exported with ${week.orders.length} trips`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to export final statement");
    }
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

  // NOTE: Removed loading skeleton - we now show "0 trips" during loading instead of flickering skeletons
  // The UI will display current data (or empty state) while new data loads in the background

  // Show empty state when in lazy mode and no search active
  const hasActiveSearch = searchFilter?.trim().length >= 2 || loadNumberSearch?.trim().length >= 2;
  const showEmptyPrompt = isLazyMode && !hasActiveSearch && (!orders || orders.length === 0);

  if (showEmptyPrompt) {
    return (
      <div className="w-full px-2 py-4 md:py-6 space-y-4 md:space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl md:text-3xl font-bold">Trips</h1>
        </div>

        <Card className="bg-background">
          <CardHeader>
            <CardTitle>Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="relative w-full max-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Truck # / Driver..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8"
                />
              </div>
              <div className="relative w-full max-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Internal# / Broker Load#..."
                  value={loadNumberSearch}
                  onChange={(e) => {
                    setLoadNumberSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background">
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Search for Trips</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enter a truck number or driver name to load their trips, or search by load number to find a specific
              order.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-2 py-4 md:py-6 space-y-4 md:space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold">Trips</h1>
      </div>

      <Card className="bg-background">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-full max-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Truck # / Driver..."
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>
            <div className="relative w-full max-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Internal# / Broker Load#..."
                value={loadNumberSearch}
                onChange={(e) => {
                  setLoadNumberSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2 w-full max-w-[220px]">
              <DatePicker
                date={invoicedDateFilter}
                onDateChange={(date) => {
                  setInvoicedDateFilter(date);
                  setCurrentPage(1);
                }}
                placeholder="Invoiced date..."
                className="w-full"
              />
              {invoicedDateFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    setInvoicedDateFilter(undefined);
                    setCurrentPage(1);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full min-w-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            Trips ({filteredOrders.length} total, showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)})
            {filterInfo.companyName && searchFilter && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">— {filterInfo.companyName}</span>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportFinalStatement}
            disabled={!searchFilter}
            title={!searchFilter ? "Filter by truck or driver first" : "Export final statement"}
            className="text-xs md:text-sm"
          >
            <FileDown className="h-4 w-4 mr-1 md:mr-2" />
            Final
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="p-2 md:p-6 relative overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 z-20">
                  <TableRow className="bg-yellow-200 dark:bg-yellow-800 border-4 border-black border-b-4">
                    {canMoveLoads && (
                      <TableHead className="w-[32px] min-w-[32px] max-w-[32px] bg-yellow-200 dark:bg-yellow-800"></TableHead>
                    )}
                    <TableHead className="w-[80px] min-w-[80px] max-w-[80px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Truck#
                    </TableHead>
                    <TableHead className="w-[120px] min-w-[120px] max-w-[120px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Driver
                    </TableHead>
                    <TableHead className="w-[70px] min-w-[70px] max-w-[70px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Load#
                    </TableHead>
                    <TableHead className="w-[110px] min-w-[110px] max-w-[110px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Pickup Date
                    </TableHead>
                    <TableHead className="w-[140px] min-w-[140px] max-w-[140px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Pickup City
                    </TableHead>
                    <TableHead className="w-[115px] min-w-[115px] max-w-[115px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Delivery Date
                    </TableHead>
                    <TableHead className="w-[140px] min-w-[140px] max-w-[140px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Delivery City
                    </TableHead>
                    <TableHead className="w-[70px] min-w-[70px] max-w-[70px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Miles
                    </TableHead>
                    <TableHead className="w-[140px] min-w-[140px] max-w-[140px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Broker Name
                    </TableHead>
                    <TableHead className="w-[110px] min-w-[110px] max-w-[110px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Broker Load#
                    </TableHead>

                    <TableHead className="w-[90px] min-w-[90px] max-w-[90px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Stop Amt
                    </TableHead>
                    <TableHead className="w-[120px] min-w-[120px] max-w-[120px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Freight Amt
                    </TableHead>
                    {canSeePaidColumn && (
                      <TableHead className="w-[40px] min-w-[40px] max-w-[40px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap text-center">
                        Paid
                      </TableHead>
                    )}
                    <TableHead className="w-[80px] min-w-[80px] max-w-[80px] bg-yellow-200 dark:bg-yellow-800 whitespace-nowrap">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByWeek.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canMoveLoads ? (canSeePaidColumn ? 14 : 13) : canSeePaidColumn ? 13 : 12}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No trips found
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedByWeek.map((week, weekIndex) => {
                      // Filter out history and termination entries for totals calculation
                      const actualOrders = week.orders.filter((o: any) => !o._isHistoryEntry && !o._isTerminationEntry);
                      const weekTotal = actualOrders.reduce(
                        (acc: any, order: any) => ({
                          miles: acc.miles + (Number(order.mileage) || 0),
                          driverPay: acc.driverPay + (Number(order.totalDriverPay) || 0),
                          freightAmount: acc.freightAmount + (Number(order.totalFreightAmountNoLumper) || 0),
                        }),
                        { miles: 0, driverPay: 0, freightAmount: 0 },
                      );

                      const weekStartDate = new Date(week.weekStart + "T12:00:00");
                      const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 2 });

                      // Get truck/driver info from first actual order (not history entry) for paid status
                      const firstActualOrder = actualOrders[0];
                      const weekTruckNumber = firstActualOrder?.truckNumber || "";
                      const weekDriverName = firstActualOrder?.driverName || "";
                      const weekIsPaid = isWeekPaid(weekTruckNumber, weekDriverName, week.weekStart);

                      return (
                        <Fragment key={`week-${week.weekStart}`}>
                          {/* Weekly Summary Row - Now appears FIRST */}
                          <TableRow className="bg-muted/50 font-semibold border-4 border-primary">
                            <TableCell colSpan={canMoveLoads ? 8 : 7} className="py-3">
                              <div className="flex items-center gap-4">
                                <span>
                                  Week: {format(weekStartDate, "MMM d")} - {format(weekEndDate, "MMM d, yyyy")}
                                </span>
                                {canSeePaidColumn && (
                                  <div className="flex items-center gap-2">
                                    {canTogglePaid ? (
                                      <>
                                        <Checkbox
                                          id={`paid-${week.weekStart}`}
                                          checked={weekIsPaid}
                                          onCheckedChange={() =>
                                            handlePaidToggle(
                                              weekTruckNumber,
                                              firstActualOrder?.truckId || "",
                                              weekDriverName,
                                              week.weekStart,
                                              actualOrders,
                                            )
                                          }
                                        />
                                        <label
                                          htmlFor={`paid-${week.weekStart}`}
                                          className={`text-sm cursor-pointer ${weekIsPaid ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                                        >
                                          {weekIsPaid ? "Paid" : "Paid"}
                                        </label>
                                      </>
                                    ) : (
                                      <span
                                        className={`text-sm ${weekIsPaid ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                                      >
                                        {weekIsPaid ? "✓ Paid" : "Unpaid"}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {canMoveLoads && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    <ArrowLeftRight className="h-3 w-3 inline mr-1" />
                                    Drag loads to move weeks
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={`py-3 cursor-pointer select-none transition-colors ${
                                isSelected(`week-miles-${week.weekStart}`)
                                  ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() => toggleCell(`week-miles-${week.weekStart}`, weekTotal.miles, "miles")}
                            >
                              {weekTotal.miles.toLocaleString()}
                            </TableCell>
                            <TableCell colSpan={2} className="py-3"></TableCell>
                            <TableCell
                              className={`py-3 cursor-pointer select-none transition-colors ${
                                isSelected(`week-driver-${week.weekStart}`)
                                  ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() =>
                                toggleCell(
                                  `week-driver-${week.weekStart}`,
                                  weekTotal.driverPay,
                                  "driverPay",
                                  weekTotal.miles,
                                )
                              }
                            >
                              <div className="font-semibold text-green-600 dark:text-green-400">
                                {formatCurrency(weekTotal.driverPay)}
                              </div>
                            </TableCell>
                            <TableCell
                              className={`py-3 cursor-pointer select-none transition-colors ${
                                isSelected(`week-freight-${week.weekStart}`)
                                  ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() =>
                                toggleCell(
                                  `week-freight-${week.weekStart}`,
                                  weekTotal.freightAmount,
                                  "freightAmount",
                                  weekTotal.miles,
                                  weekTotal.driverPay,
                                )
                              }
                            >
                              <div className="font-semibold text-green-600 dark:text-green-400">
                                {formatCurrency(weekTotal.freightAmount)}
                              </div>
                            </TableCell>
                            {canSeePaidColumn && <TableCell className="py-3"></TableCell>}
                            <TableCell className="py-3">
                              {canSeePaidColumn && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    // Get the first actual order (not history/termination entries)
                                    const firstActualOrder = actualOrders.find(
                                      (o: any) => !o._isHistoryEntry && !o._isTerminationEntry,
                                    );
                                    if (!firstActualOrder) {
                                      toast.error("No orders to export");
                                      return;
                                    }
                                    setStatementDialogData({
                                      week: { ...week, orders: actualOrders },
                                      weekStartDate,
                                      weekEndDate,
                                      driverId: firstActualOrder.driver1Id || "",
                                      driverName: firstActualOrder.driverName || "Unknown",
                                      truckNumber: firstActualOrder.truckNumber || "",
                                      truckId: firstActualOrder.truck?.id || "",
                                    });
                                    setStatementDialogOpen(true);
                                  }}
                                  title="Export week to Excel"
                                >
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Drop zone indicator - shown when dragging over this week */}
                          <Droppable
                            droppableId={`week-${week.weekStart}`}
                            isDropDisabled={!canMoveLoads}
                            renderClone={(provided, snapshot, rubric) => {
                              const draggedOrder = week.orders[rubric.source.index];
                              return (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="bg-card border-2 border-primary rounded-md p-3 shadow-xl opacity-90"
                                >
                                  <div className="font-medium">
                                    {draggedOrder?.truckNumber} - {draggedOrder?.driverName}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Load #
                                    {formatInternalLoadNumber(
                                      draggedOrder?.internalLoadNumber,
                                      draggedOrder?.companyName,
                                    )}
                                  </div>
                                </div>
                              );
                            }}
                          >
                            {(provided, snapshot) => (
                              <Fragment>
                                {/* Drop indicator row - visible when dragging over */}
                                {snapshot.isDraggingOver && (
                                  <TableRow className="bg-blue-100 dark:bg-blue-900/50 border-2 border-dashed border-blue-500 animate-pulse">
                                    <TableCell
                                      colSpan={canMoveLoads ? (canSeePaidColumn ? 15 : 14) : canSeePaidColumn ? 14 : 13}
                                      className="py-4 text-center"
                                    >
                                      <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                                        <ArrowLeftRight className="h-4 w-4" />
                                        Drop here to move load to this week
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                                {/* Hidden droppable target - needed for proper drop detection */}
                                <tr
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={snapshot.isDraggingOver ? "bg-blue-50 dark:bg-blue-950" : ""}
                                >
                                  <td
                                    colSpan={canMoveLoads ? (canSeePaidColumn ? 15 : 14) : canSeePaidColumn ? 14 : 13}
                                    style={{ padding: 0, height: snapshot.isDraggingOver ? "4px" : "0px" }}
                                  />
                                </tr>
                                {week.orders.map((order, orderIndex) => {
                                  // Check if this is a history entry (merged in during grouping)
                                  if (order._isHistoryEntry) {
                                    const historyKey = `history-${week.weekStart}-${order._historyId}`;
                                    const isExpanded = expandedNestedTrips.has(historyKey);
                                    const canShowNestedTrips =
                                      order._entityType === "driver" &&
                                      order._entityName &&
                                      order._entityName !== "Unassigned";
                                    const totalColSpan = canMoveLoads
                                      ? canSeePaidColumn
                                        ? 15
                                        : 14
                                      : canSeePaidColumn
                                        ? 14
                                        : 13;

                                    return (
                                      <Fragment key={historyKey}>
                                        <TableRow className="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-l-yellow-500">
                                          {canMoveLoads && <TableCell></TableCell>}
                                          <TableCell className="text-sm font-semibold">
                                            {order._historyDateDisplay}
                                          </TableCell>
                                          <TableCell colSpan={4} className="text-sm font-medium">
                                            <div className="flex items-center gap-2">
                                              <span>{order._changeDescription}</span>
                                              {/* Show toggle button to expand driver's trips inline */}
                                              {canShowNestedTrips && (
                                                <NestedDriverTripsDropdown
                                                  driverName={order._entityName}
                                                  driverId={order._entityId}
                                                  onSearchDriver={(name) => {
                                                    setSearchFilter(name);
                                                    setCurrentPage(1);
                                                  }}
                                                  isOpen={isExpanded}
                                                  onToggle={() => toggleNestedTrips(historyKey)}
                                                />
                                              )}
                                              {/* Show dash for non-driver entries */}
                                              {!canShowNestedTrips && <span className="text-muted-foreground">—</span>}
                                            </div>
                                          </TableCell>
                                          <TableCell colSpan={canSeePaidColumn ? 7 : 6} className="text-sm">
                                            {order._reason || "—"}
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {/* Delete button for admins */}
                                            {hasRole("admin") &&
                                              order._historyEntryIds &&
                                              order._historyEntryIds.length > 0 && (
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                                  onClick={() =>
                                                    setDeleteHistoryConfirmDialog({
                                                      historyEntryIds: order._historyEntryIds,
                                                      description: order._changeDescription,
                                                    })
                                                  }
                                                  title="Delete assignment history entry"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              )}
                                          </TableCell>
                                        </TableRow>
                                        {/* Render inline driver trips content when expanded */}
                                        {isExpanded && canShowNestedTrips && (
                                          <NestedDriverTripsInlineContent
                                            driverName={order._entityName}
                                            driverId={order._entityId}
                                            assignmentDate={order._historyDate}
                                            onSearchDriver={(name) => {
                                              setSearchFilter(name);
                                              setCurrentPage(1);
                                              toggleNestedTrips(historyKey);
                                            }}
                                            onEditOrder={(orderId) => {
                                              localStorage.setItem("returnToTrips", "true");
                                              navigate(`/edit-order/${orderId}`);
                                            }}
                                            onOrderPaidToggle={handleOrderPaidToggle}
                                            colSpan={totalColSpan}
                                            showMoveColumn={canMoveLoads}
                                            showPaidColumn={canSeePaidColumn}
                                          />
                                        )}
                                      </Fragment>
                                    );
                                  }

                                  // Check if this is a termination entry (driver terminated - red row)
                                  if (order._isTerminationEntry) {
                                    return (
                                      <TableRow
                                        key={`termination-${week.weekStart}-${order._terminationId}`}
                                        className="bg-red-100 dark:bg-red-900/50 border-l-4 border-l-red-500"
                                      >
                                        {canMoveLoads && <TableCell></TableCell>}
                                        <TableCell className="text-sm font-semibold text-red-700 dark:text-red-300">
                                          {order._terminationDateDisplay}
                                        </TableCell>
                                        <TableCell
                                          colSpan={4}
                                          className="text-sm font-medium text-red-700 dark:text-red-300"
                                        >
                                          {order._terminationDescription}
                                        </TableCell>
                                        <TableCell
                                          colSpan={canSeePaidColumn ? 8 : 7}
                                          className="text-sm text-red-600 dark:text-red-400"
                                        >
                                          {order._terminationNote}
                                        </TableCell>
                                        <TableCell></TableCell>
                                      </TableRow>
                                    );
                                  }

                                  // Background color rules - Based on total freight vs freight amount
                                  const isRecovery = order.isRecovery;
                                  const freightAmount = Number(order.freightAmount) || 0;
                                  const totalFreight = Number(order.totalFreightAmountNoLumper) || 0;
                                  const hasAdditionalPay = totalFreight > freightAmount;
                                  const hasReducedPay = totalFreight < freightAmount;

                                  const hasOrangeCondition =
                                    order.canceled ||
                                    ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

                                  const isEvenRow = orderIndex % 2 === 1;
                                  const alternatingBg = isEvenRow
                                    ? "bg-muted/50 hover:bg-muted/50 dark:bg-muted/30 dark:hover:bg-muted/30"
                                    : "bg-background hover:bg-background";

                                  // Add blue border if order has week override
                                  const hasWeekOverride = order._hasWeekOverride;
                                  const weekOverrideBorder = hasWeekOverride ? "ring-2 ring-blue-500 ring-inset" : "";

                                  const rowClassName = isRecovery
                                    ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_90%)] dark:hover:bg-[hsl(270_50%_25%)]"
                                    : hasReducedPay
                                      ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_90%)] dark:hover:bg-[hsl(0_62%_25%)]"
                                      : hasAdditionalPay
                                        ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_90%)] dark:hover:bg-[hsl(120_40%_25%)]"
                                        : hasOrangeCondition
                                          ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_90%)] dark:hover:bg-[hsl(25_75%_30%)]"
                                          : alternatingBg;

                                  const draggableId = `${order.id}_drag_${order.transferSequence ?? "base"}`;

                                  return (
                                    <Draggable
                                      key={order.virtualId ?? `${order.id}_${order.transferSequence ?? "base"}`}
                                      draggableId={draggableId}
                                      index={orderIndex}
                                      isDragDisabled={!canMoveLoads}
                                    >
                                      {(dragProvided, dragSnapshot) => (
                                        <TableRow
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          className={`h-16 ${rowClassName} ${weekOverrideBorder} ${dragSnapshot.isDragging ? "opacity-50 bg-primary/20" : ""}`}
                                        >
                                          {canMoveLoads && (
                                            <TableCell className="w-8 p-1">
                                              <div className="flex flex-col items-center gap-0.5">
                                                <div
                                                  {...dragProvided.dragHandleProps}
                                                  className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
                                                  title="Drag to move to different week"
                                                >
                                                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                                                </div>
                                                {hasWeekOverride && (
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 p-0"
                                                    onClick={() => handleRevertToOriginalWeek(order.id)}
                                                    title="Return to original week"
                                                  >
                                                    <Undo2 className="h-3 w-3 text-blue-500" />
                                                  </Button>
                                                )}
                                              </div>
                                            </TableCell>
                                          )}
                                          <TableCell className="font-medium">
                                            <div className="line-clamp-2">{order.truckNumber}</div>
                                          </TableCell>
                                          <TableCell>
                                            <div className="line-clamp-2">
                                              {order.driverName}
                                              {hasWeekOverride && (
                                                <Badge
                                                  variant="outline"
                                                  className="ml-1 text-[10px] px-1 py-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                                  title={`Originally in week of ${order._originalWeekKey}`}
                                                >
                                                  Moved
                                                </Badge>
                                              )}
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
                                                <Badge
                                                  variant="outline"
                                                  className="ml-1 text-[10px] px-1 py-0 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                                                >
                                                  Orig
                                                </Badge>
                                              )}
                                              {!order.transferBadge && order.isRecoveryDriverPortion && (
                                                <Badge
                                                  variant="outline"
                                                  className="ml-1 text-[10px] px-1 py-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                                >
                                                  Rec
                                                </Badge>
                                              )}
                                              {order.transferNote && (
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                  {order.transferNote}
                                                </div>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <div className="line-clamp-2">
                                              {formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}
                                            </div>
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
                                          <TableCell
                                            className={`cursor-pointer select-none transition-colors ${
                                              isSelected(`order-miles-${order.virtualId ?? order.id}`)
                                                ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                                : "hover:bg-muted/50"
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleCell(
                                                `order-miles-${order.virtualId ?? order.id}`,
                                                Number(order.mileage) || 0,
                                                "miles",
                                              );
                                            }}
                                          >
                                            <div className="line-clamp-2">{order.mileage?.toLocaleString() || "0"}</div>
                                          </TableCell>
                                          <TableCell>
                                            <div className="line-clamp-2">{order.brokerName}</div>
                                          </TableCell>
                                          <TableCell>
                                            <div className="line-clamp-2">{order.brokerLoadNumber}</div>
                                          </TableCell>
                                          <TableCell
                                            className={`cursor-pointer select-none transition-colors ${
                                              isSelected(`order-driver-${order.virtualId ?? order.id}`)
                                                ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                                : "hover:bg-muted/50"
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleCell(
                                                `order-driver-${order.virtualId ?? order.id}`,
                                                Number(order.totalDriverPay) || 0,
                                                "driverPay",
                                                Number(order.mileage) || 0,
                                              );
                                            }}
                                          >
                                            <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                              {formatCurrency(order.totalDriverPay)}
                                            </div>
                                          </TableCell>
                                          <TableCell
                                            className={`cursor-pointer select-none transition-colors ${
                                              isSelected(`order-freight-${order.virtualId ?? order.id}`)
                                                ? "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 ring-inset"
                                                : "hover:bg-muted/50"
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleCell(
                                                `order-freight-${order.virtualId ?? order.id}`,
                                                Number(order.totalFreightAmountNoLumper) || 0,
                                                "freightAmount",
                                                Number(order.mileage) || 0,
                                                Number(order.totalDriverPay) || 0,
                                              );
                                            }}
                                          >
                                            <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                              {formatCurrency(order.totalFreightAmountNoLumper)}
                                            </div>
                                          </TableCell>
                                          {canSeePaidColumn && (
                                            <TableCell className="text-center">
                                              <div className="flex justify-center">
                                                {canTogglePaid ? (
                                                  <Checkbox
                                                    checked={order.paid === true}
                                                    onCheckedChange={() =>
                                                      handleOrderPaidToggle(
                                                        order.id,
                                                        order.paid === true,
                                                        order.loadNumber,
                                                      )
                                                    }
                                                    aria-label={`Mark load ${order.loadNumber} as ${order.paid ? "unpaid" : "paid"}`}
                                                  />
                                                ) : (
                                                  <span className="text-sm">{order.paid ? "✓" : "—"}</span>
                                                )}
                                              </div>
                                            </TableCell>
                                          )}
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
                                                const freightAmount = Number(order.freightAmount) || 0;
                                                const totalFreight = Number(order.totalFreightAmountNoLumper) || 0;
                                                const difference = totalFreight - freightAmount;

                                                if (difference === 0) return null;

                                                const isPositive = difference > 0;

                                                // Build itemized breakdown for freight-side and driver-side
                                                const freightItems: { label: string; value: number }[] = [];
                                                const driverItems: { label: string; value: number }[] = [];

                                                // Freight amounts
                                                const detention = Number((order as any).detention) || 0;
                                                const layover = Number((order as any).layover) || 0;
                                                const tonu = Number((order as any).tonu) || 0;
                                                const extraStop = Number((order as any).extraStop) || 0;
                                                const lateFee = Number((order as any).lateFee) || 0;
                                                const noTrackingFee = Number((order as any).noTrackingFee) || 0;
                                                const wrongAddressFee = Number((order as any).wrongAddressFee) || 0;
                                                const escortFee = Number((order as any).escortFee) || 0;
                                                const lumper = Number((order as any).lumper) || 0;
                                                const otherCharges = Number((order as any).otherCharges) || 0;
                                                const otherAdditionals = Number((order as any).otherAdditionals) || 0;

                                                // Driver amounts
                                                const detentionDriver = Number((order as any).detentionDriver) || 0;
                                                const layoverDriver = Number((order as any).layoverDriver) || 0;
                                                const tonuDriver = Number((order as any).tonuDriver) || 0;
                                                const extraStopDriver = Number((order as any).extraStopDriver) || 0;
                                                const lateFeeDriver = Number((order as any).lateFeeDriver) || 0;
                                                const noTrackingFeeDriver =
                                                  Number((order as any).noTrackingFeeDriver) || 0;
                                                const wrongAddressFeeDriver =
                                                  Number((order as any).wrongAddressFeeDriver) || 0;
                                                const lumperDriver = Number((order as any).lumperDriver) || 0;
                                                const otherChargesDriver =
                                                  Number((order as any).otherChargesDriver) || 0;
                                                const otherAdditionalsDriver =
                                                  Number((order as any).otherAdditionalsDriver) || 0;

                                                // Base driver pay
                                                const driverPrice = Number((order as any).driverPrice) || 0;
                                                const totalDriverPay = Number((order as any).totalDriverPay) || 0;

                                                // Build freight items - late fee, no tracking, wrong address, other charges are deductions (negative)
                                                if (detention !== 0)
                                                  freightItems.push({ label: "Detention", value: detention });
                                                if (layover !== 0)
                                                  freightItems.push({ label: "Layover", value: layover });
                                                if (tonu !== 0) freightItems.push({ label: "TONU", value: tonu });
                                                if (extraStop !== 0)
                                                  freightItems.push({ label: "Extra Stop", value: extraStop });
                                                if (lateFee !== 0)
                                                  freightItems.push({ label: "Late Fee", value: -lateFee });
                                                if (noTrackingFee !== 0)
                                                  freightItems.push({ label: "No Tracking", value: -noTrackingFee });
                                                if (wrongAddressFee !== 0)
                                                  freightItems.push({
                                                    label: "Wrong Address",
                                                    value: -wrongAddressFee,
                                                  });
                                                if (escortFee !== 0)
                                                  freightItems.push({ label: "Escort", value: escortFee });
                                                if (lumper !== 0) freightItems.push({ label: "Lumper", value: lumper });
                                                if (otherCharges !== 0) {
                                                  const reason = String((order as any).otherChargesReason || "").trim();
                                                  freightItems.push({
                                                    label: reason || "Other Charges",
                                                    value: -otherCharges,
                                                  });
                                                }
                                                if (otherAdditionals !== 0) {
                                                  const reason = String(
                                                    (order as any).otherAdditionalsReason || "",
                                                  ).trim();
                                                  freightItems.push({
                                                    label: reason || "Other Additionals",
                                                    value: otherAdditionals,
                                                  });
                                                }

                                                // Build driver items - late fee, no tracking, wrong address are deductions (negative)
                                                if (detentionDriver !== 0)
                                                  driverItems.push({ label: "Detention", value: detentionDriver });
                                                if (layoverDriver !== 0)
                                                  driverItems.push({ label: "Layover", value: layoverDriver });
                                                if (tonuDriver !== 0)
                                                  driverItems.push({ label: "TONU", value: tonuDriver });
                                                if (extraStopDriver !== 0)
                                                  driverItems.push({ label: "Extra Stop", value: extraStopDriver });
                                                if (lateFeeDriver !== 0)
                                                  driverItems.push({ label: "Late Fee", value: -lateFeeDriver });
                                                if (noTrackingFeeDriver !== 0)
                                                  driverItems.push({
                                                    label: "No Tracking",
                                                    value: -noTrackingFeeDriver,
                                                  });
                                                if (wrongAddressFeeDriver !== 0)
                                                  driverItems.push({
                                                    label: "Wrong Address",
                                                    value: -wrongAddressFeeDriver,
                                                  });
                                                if (lumperDriver !== 0)
                                                  driverItems.push({ label: "Lumper", value: lumperDriver });
                                                if (otherChargesDriver !== 0) {
                                                  const reason = String((order as any).otherChargesReason || "").trim();
                                                  driverItems.push({
                                                    label: reason || "Other Charges",
                                                    value: -otherChargesDriver,
                                                  });
                                                }
                                                if (otherAdditionalsDriver !== 0) {
                                                  const reason = String(
                                                    (order as any).otherAdditionalsReason || "",
                                                  ).trim();
                                                  driverItems.push({
                                                    label: reason || "Other Additionals",
                                                    value: otherAdditionalsDriver,
                                                  });
                                                }

                                                const driverDifference = totalDriverPay - driverPrice;
                                                const hasDriverItems = driverItems.length > 0;

                                                return (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
                                                        <img
                                                          src={moneyStackIcon}
                                                          alt={isPositive ? "Additional pay" : "Reduced pay"}
                                                          className={`h-5 w-5 object-contain ${!isPositive ? "grayscale brightness-75 hue-rotate-180" : ""}`}
                                                        />
                                                      </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-3 max-w-sm" align="start">
                                                      <div className="text-sm font-semibold mb-2">
                                                        {isPositive ? "Additional Pay" : "Reduced Pay"}
                                                      </div>

                                                      {/* Freight Section */}
                                                      <div className="space-y-1 text-sm">
                                                        <div className="font-medium text-muted-foreground">
                                                          Company (Freight)
                                                        </div>
                                                        <div>Base: {formatCurrency(freightAmount)}</div>
                                                        {freightItems.map((item, idx) => {
                                                          const sign = item.value >= 0 ? "+" : "-";
                                                          return (
                                                            <div key={idx} className="text-muted-foreground pl-2">
                                                              {item.label}: {sign}
                                                              {formatCurrency(Math.abs(item.value))}
                                                            </div>
                                                          );
                                                        })}
                                                        <div className="pt-1 border-t">
                                                          Total: {formatCurrency(totalFreight)}
                                                        </div>
                                                        <div
                                                          className={`font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}
                                                        >
                                                          Difference: {isPositive ? "+" : ""}
                                                          {formatCurrency(difference)}
                                                        </div>
                                                      </div>

                                                      {/* Driver Section - only show if there are driver items */}
                                                      {hasDriverItems && (
                                                        <div className="space-y-1 text-sm mt-3 pt-3 border-t">
                                                          <div className="font-medium text-muted-foreground">
                                                            Stop Amt
                                                          </div>
                                                          <div>Base: {formatCurrency(driverPrice)}</div>
                                                          {driverItems.map((item, idx) => {
                                                            const sign = item.value >= 0 ? "+" : "-";
                                                            return (
                                                              <div key={idx} className="text-muted-foreground pl-2">
                                                                {item.label}: {sign}
                                                                {formatCurrency(Math.abs(item.value))}
                                                              </div>
                                                            );
                                                          })}
                                                          <div className="pt-1 border-t">
                                                            Total: {formatCurrency(totalDriverPay)}
                                                          </div>
                                                          <div
                                                            className={`font-semibold ${driverDifference >= 0 ? "text-green-500" : "text-red-500"}`}
                                                          >
                                                            Difference: {driverDifference >= 0 ? "+" : ""}
                                                            {formatCurrency(driverDifference)}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </PopoverContent>
                                                  </Popover>
                                                );
                                              })()}
                                              {/* Rescheduled icon */}
                                              {(order as any).dateChangeNotes &&
                                                (order as any).dateChangeNotes.trim() !== "" && (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
                                                        <CalendarClock className="h-5 w-5 text-orange-500" />
                                                      </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-3 max-w-xs" align="start">
                                                      <div className="text-sm font-semibold mb-2">Rescheduled</div>
                                                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                                        {(order as any).dateChangeNotes}
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                )}
                                              {/* Missing POD icon - hide for canceled loads */}
                                              {!order.canceled && (!order.podFiles || order.podFiles.length === 0) && (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
                                                      <AlertCircle
                                                        className="h-5 w-5 text-red-600 fill-red-100"
                                                        strokeWidth={2.5}
                                                      />
                                                    </Button>
                                                  </PopoverTrigger>
                                                  <PopoverContent className="w-auto p-3 max-w-xs" align="start">
                                                    <div className="text-sm font-semibold text-red-500">
                                                      POD Missing
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                      No proof of delivery uploaded for this load.
                                                    </div>
                                                  </PopoverContent>
                                                </Popover>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {provided.placeholder}
                              </Fragment>
                            )}
                          </Droppable>
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </DragDropContext>

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

      {/* Individual Order Paid Confirmation Dialog */}
      <AlertDialog
        open={orderPaidConfirmDialog?.open ?? false}
        onOpenChange={(open) => !open && setOrderPaidConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              {orderPaidConfirmDialog?.currentPaid
                ? "Are you sure you want to mark this load as unpaid?"
                : "Are you sure you want to mark this load as paid?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOrderPaidToggle}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Assignment History Confirmation Dialog (Admin Only) */}
      <AlertDialog
        open={!!deleteHistoryConfirmDialog}
        onOpenChange={(open) => !open && setDeleteHistoryConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment History?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the history entry: "{deleteHistoryConfirmDialog?.description}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteHistoryConfirmDialog?.historyEntryIds) {
                  deleteAssignmentHistoryMutation.mutate(deleteHistoryConfirmDialog.historyEntryIds);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Statement Preview Dialog */}
      {statementDialogData && (
        <StatementPreviewDialog
          open={statementDialogOpen}
          onOpenChange={(open) => {
            setStatementDialogOpen(open);
            if (!open) setStatementDialogData(null);
          }}
          driverId={statementDialogData.driverId}
          driverName={statementDialogData.driverName}
          truckNumber={statementDialogData.truckNumber}
          weekStart={format(statementDialogData.weekStartDate, "MM/dd/yyyy")}
          weekEnd={format(statementDialogData.weekEndDate, "MM/dd/yyyy")}
          onExport={async (scheduledDeductions) => {
            await exportWeekToExcel(
              statementDialogData.week,
              statementDialogData.weekStartDate,
              statementDialogData.weekEndDate,
              scheduledDeductions,
            );
          }}
          onMarkWeekPaid={async () => {
            // Mark the week as paid when exporting statement
            const weekStartStr = format(statementDialogData.weekStartDate, "yyyy-MM-dd");
            await togglePaidMutation.mutateAsync({
              truckNumber: statementDialogData.truckNumber,
              truckId: statementDialogData.truckId,
              driverName: statementDialogData.driverName,
              weekStart: weekStartStr,
              weekOrders: statementDialogData.week.orders || [],
              isPaid: true,
            });
          }}
        />
      )}

      {/* Cell Selection Summary - Excel-like sum/average popup */}
      <CellSelectionSummary selectedCellsArray={selectedCellsArray} onClear={clearSelection} />
    </div>
  );
};

export default Trips;
