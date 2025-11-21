import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  FileText,
  Edit,
  Loader2,
  Download,
  Lock,
  LockOpen,
  XCircle,
  Calculator,
  Undo2,
  Info,
  Mail,
} from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useDriverEmailLog } from "@/hooks/useDriverEmailLog";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { diagnoseLoadMiles } from "@/utils/diagnoseLoad";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { z } from "zod";
import { useDragPan } from "@/hooks/useDragPan";
import { formatCurrency } from "@/lib/utils";
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
const Orders = () => {
  useDragPan();
  const navigate = useNavigate();
  const { hasRole, getPrimaryRole, profile } = useAuthContext();
  const primaryRole = getPrimaryRole();
  const queryClient = useQueryClient();
  const { data: emailLogMap } = useDriverEmailLog();
  
  console.log('📬 Orders page - emailLogMap:', emailLogMap);
  console.log('📬 Orders page - emailLogMap size:', emailLogMap?.size);

  // Debug navigation function with filter persistence
  const navigateToEditOrder = (orderId: string) => {
    console.log("=== NAVIGATION DEBUG ===");
    console.log("Order ID to navigate to:", orderId);
    console.log("Order ID type:", typeof orderId);
    console.log("Current location:", window.location.href);

    if (!orderId) {
      console.error("Order ID is missing!");
      return;
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      console.error("Invalid order ID format:", orderId);
      return;
    }

    // Save current filter state to localStorage
    const filterState = {
      searchTerm,
      companyFilter,
      truckCompanyFilter,
      bookedByFilter,
      missingDocsFilter,
      truckFilter,
      driverFilter,
      lockedNotInvoicedFilter,
      dateRange: dateRange
        ? {
            from: dateRange.from?.toISOString(),
            to: dateRange.to?.toISOString(),
          }
        : undefined,
      currentPage,
    };
    localStorage.setItem("ordersFilterState", JSON.stringify(filterState));
    localStorage.setItem("returnToOrders", "true");

    const targetUrl = `/edit-order/${orderId}`;
    console.log("Target URL:", targetUrl);

    // Try navigation with fallback to window.location
    try {
      console.log("Attempting React Router navigation...");
      navigate(targetUrl);
      console.log("React Router navigation completed");
    } catch (error) {
      console.error("Navigation failed, using window.location:", error);
      window.location.href = targetUrl;
    }
    console.log("=== END NAVIGATION DEBUG ===");
  };
  // Auto-set bookedBy filter for dispatchers (but not afterhours or safety)
  const isDispatcher = primaryRole === "dispatch";

  // Check if user has only dispatch role (afterhours and safety excluded from auto-filter)
  const isDispatchOnly =
    hasRole("dispatch") &&
    !hasRole("afterhours") &&
    !hasRole("admin") &&
    !hasRole("manager") &&
    !hasRole("accounting") &&
    !hasRole("supervisor") &&
    !hasRole("safety");

  // For dispatch users, pass their name to filter at the database level
  // Use null instead of undefined to prevent double fetch when profile loads
  const orderFilterOptions = isDispatchOnly ? { bookedBy: profile?.full_name || null } : { bookedBy: null };

  // Check if user can cancel orders (includes both dispatch and afterhours)
  const canCancelOrders =
    (hasRole("dispatch") || hasRole("afterhours")) &&
    !hasRole("admin") &&
    !hasRole("manager") &&
    !hasRole("accounting") &&
    !hasRole("supervisor");
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all-companies");
  const [truckCompanyFilter, setTruckCompanyFilter] = useState("all-truck-companies");
  const [bookedByFilter, setBookedByFilter] = useState("all-users");
  const [missingDocsFilter, setMissingDocsFilter] = useState("all");
  const [truckFilter, setTruckFilter] = useState("all-trucks");
  const [driverFilter, setDriverFilter] = useState("all-drivers");
  const [brokerFilter, setBrokerFilter] = useState("all-brokers");
  const [lockedNotInvoicedFilter, setLockedNotInvoicedFilter] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState("");
  const [showLegendDialog, setShowLegendDialog] = useState(false);
  const [cancelFormData, setCancelFormData] = useState({
    tonu: "",
    driverRate: "",
    dhMiles: "",
    notes: "",
  });
  const [recalculatingOrder, setRecalculatingOrder] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);
  const ORDERS_PER_PAGE = 100;

  // Restore filter state from localStorage on mount
  useEffect(() => {
    const shouldRestore = localStorage.getItem("returnToOrders");
    if (shouldRestore === "true") {
      const savedState = localStorage.getItem("ordersFilterState");
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          setSearchTerm(state.searchTerm || "");
          setCompanyFilter(state.companyFilter || "all-companies");
          setTruckCompanyFilter(state.truckCompanyFilter || "all-truck-companies");
          setBookedByFilter(state.bookedByFilter || "all-booked-by");
          setMissingDocsFilter(state.missingDocsFilter || "all");
          setTruckFilter(state.truckFilter || "all-trucks");
          setDriverFilter(state.driverFilter || "all-drivers");
          setBrokerFilter(state.brokerFilter || "all-brokers");
          setLockedNotInvoicedFilter(state.lockedNotInvoicedFilter || false);
          if (state.dateRange) {
            setDateRange({
              from: state.dateRange.from ? new Date(state.dateRange.from) : undefined,
              to: state.dateRange.to ? new Date(state.dateRange.to) : undefined,
            });
          }
          setCurrentPage(state.currentPage || 1);
          setHasRestoredFilters(true);
        } catch (error) {
          console.error("Error restoring filter state:", error);
        }
      }
      // Clear the flags
      localStorage.removeItem("returnToOrders");
      localStorage.removeItem("ordersFilterState");
    }
  }, []);

  // Set bookedBy filter for dispatchers when profile loads (only if not restoring)
  // Exclude safety role from auto-filter
  useEffect(() => {
    if (!hasRestoredFilters && isDispatcher && profile?.full_name && !hasRole("safety")) {
      setBookedByFilter(profile.full_name);
    }
  }, [isDispatcher, profile?.full_name, hasRole, hasRestoredFilters]);

  const { data: orders, isLoading, error, refetch } = useOrders(orderFilterOptions);

  const { data: companies } = useCompanies();

  // Refetch data when returning to this page or when window gains focus
  useEffect(() => {
    refetch();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refetch();
      }
    };

    const handleFocus = () => {
      refetch();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refetch]);

  // Filter orders based on search term and filters
  const filteredOrders =
    orders?.filter((order) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        (order.internalLoadNumber?.toString() || "").toLowerCase().includes(searchLower) ||
        (order.truckNumber?.toString() || "").toLowerCase().includes(searchLower) ||
        (order.driverName?.toLowerCase() || "").includes(searchLower) ||
        (order.brokerName?.toLowerCase() || "").includes(searchLower) ||
        (order.brokerLoadNumber?.toString() || "").toLowerCase().includes(searchLower);
      const matchesCompany = !companyFilter || companyFilter === "all-companies" || order.bookedByCompanyName === companyFilter;
      const matchesTruckCompany =
        !truckCompanyFilter ||
        truckCompanyFilter === "all-truck-companies" ||
        order.truckCompanyName === truckCompanyFilter;

      // For dispatch users, respect the filter but default to their own loads
      const matchesBookedBy =
        !bookedByFilter ||
        bookedByFilter === "all-booked-by" ||
        bookedByFilter === "all-users" ||
        order.bookedBy === bookedByFilter;

      const matchesTruck = !truckFilter || truckFilter === "all-trucks" || order.truckNumber === truckFilter;
      const matchesDriver = !driverFilter || driverFilter === "all-drivers" || order.driverName === driverFilter;
      const matchesBroker = !brokerFilter || brokerFilter === "all-brokers" || order.brokerName === brokerFilter;

      let matchesMissingDocs = true;
      if (missingDocsFilter !== "all") {
        if (missingDocsFilter === "missing-rc") {
          matchesMissingDocs = order.rcFiles?.length === 0;
        } else if (missingDocsFilter === "missing-bol") {
          matchesMissingDocs = order.bolFiles?.length === 0;
        } else if (missingDocsFilter === "missing-pod") {
          matchesMissingDocs = order.podFiles?.length === 0;
        } else if (missingDocsFilter === "complete") {
          matchesMissingDocs = (order.rcFiles?.length || 0) > 0 && (order.podFiles?.length || 0) > 0;
        } else if (missingDocsFilter === "canceled") {
          matchesMissingDocs = order.canceled === true;
        }
      }

      // Date filtering based on delivery date
      let matchesDate = true;
      if (dateRange?.from && order.deliveryDate) {
        const orderDeliveryDate = new Date(order.deliveryDate.split(" - ")[0]);
        const orderDateOnly = new Date(
          orderDeliveryDate.getFullYear(),
          orderDeliveryDate.getMonth(),
          orderDeliveryDate.getDate(),
        );

        if (dateRange.to) {
          // Date range filtering
          const fromDateOnly = new Date(
            dateRange.from.getFullYear(),
            dateRange.from.getMonth(),
            dateRange.from.getDate(),
          );
          const toDateOnly = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
          matchesDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
        } else {
          // Single date filtering
          const selectedDateOnly = new Date(
            dateRange.from.getFullYear(),
            dateRange.from.getMonth(),
            dateRange.from.getDate(),
          );
          matchesDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
        }
      }

      // Filter for locked but not invoiced loads with freight amount > 0
      const matchesLockedNotInvoiced =
        !lockedNotInvoicedFilter || (order.locked && !order.invoiced && (order.totalFreightAmount || 0) > 0);

      return (
        matchesSearch &&
        matchesCompany &&
        matchesTruckCompany &&
        matchesBookedBy &&
        matchesTruck &&
        matchesDriver &&
        matchesBroker &&
        matchesMissingDocs &&
        matchesDate &&
        matchesLockedNotInvoiced
      );
    }) || [];

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    companyFilter,
    truckCompanyFilter,
    bookedByFilter,
    truckFilter,
    driverFilter,
    brokerFilter,
    missingDocsFilter,
    dateRange,
    lockedNotInvoicedFilter,
  ]);

  // Early returns after all hooks
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-lg border">
          <div className="h-12 bg-muted animate-pulse rounded-t-lg" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-t">
              <div className="h-6 w-6 bg-muted animate-pulse rounded" />
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              <div className="h-6 w-48 bg-muted animate-pulse rounded flex-1" />
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading loads: {error.message}</p>
        </div>
      </div>
    );
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
  const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
  const endIndex = startIndex + ORDERS_PER_PAGE;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Get unique companies and booked by values for filters
  const uniqueCompanies = [...new Set(orders?.map((order) => order.bookedByCompanyName) || [])].filter(Boolean);
  const uniqueTruckCompanies = [...new Set(orders?.map((order) => order.truckCompanyName) || [])].filter(Boolean);
  const uniqueBookedBy = [...new Set(orders?.map((order) => order.bookedBy) || [])].filter(Boolean);
  const uniqueTrucks = [...new Set(orders?.map((order) => order.truckNumber) || [])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const uniqueDrivers = [...new Set(orders?.map((order) => order.driverName) || [])].filter(Boolean).sort();
  const uniqueBrokers = [...new Set(orders?.map((order) => order.brokerName) || [])].filter(Boolean).sort();
  const exportToExcel = () => {
    if (!filteredOrders.length) return;
    const exportData = filteredOrders.map((order) => ({
      "Truck #": order.truckNumber,
      "Load #": order.internalLoadNumber,
      "Pickup Date": order.pickupDate,
      "Pickup City": order.pickupCity,
      "Pickup State": order.pickupState,
      "Delivery Date": order.deliveryDate,
      "Delivery City": order.deliveryCity,
      "Delivery State": order.deliveryState,
      Miles: order.mileage,
      "Driver Pay": (order as any).totalDriverPay,
      Driver: order.driverName,
      "Broker Name": order.brokerName,
      "Broker Load #": order.brokerLoadNumber,
      Invoiced: order.invoiced,
      "Total Freight": order.totalFreightAmount,
      Notes: order.notes,
      Company: order.companyName,
      "Booked By": order.bookedBy,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `orders_${new Date().toISOString().split("T")[0]}.xlsx`);
  };
  const toggleOrderLock = async (orderId: string, currentLockStatus: boolean) => {
    try {
      const { error } = await supabase.from("orders").update({ locked: !currentLockStatus }).eq("id", orderId);

      if (error) throw error;

      toast.success(`Load ${!currentLockStatus ? "locked" : "unlocked"} successfully`);

      // Refresh orders list
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      console.error("Error toggling order lock:", error);
      toast.error("Failed to update load lock status");
    }
  };

  const recalculateMiles = async (internalLoadNumber: number, orderId: string) => {
    setRecalculatingOrder(orderId);
    try {
      const result = await diagnoseLoadMiles(internalLoadNumber);

      if (result.success) {
        toast.success(
          `Recalculated: ${result.currentMiles} → ${result.calculatedMiles} miles (diff: ${result.difference})`,
        );
        window.location.reload();
      } else {
        toast.error("Failed to recalculate miles");
      }
    } catch (error) {
      console.error("Error recalculating miles:", error);
      toast.error("Failed to recalculate miles");
    } finally {
      setRecalculatingOrder(null);
    }
  };

  const generateInvoices = async () => {
    if (!filteredOrders.length) return;
    try {
      const processedOrderIds = await generateInvoicePDF(filteredOrders);

      // Update invoiced status for all orders that were successfully processed
      if (processedOrderIds.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update({
            invoiced: true,
          })
          .in("id", processedOrderIds);
        if (error) {
          console.error("Error updating invoice status:", error);
          toast.error("Failed to update invoice status");
        } else {
          console.log(`Successfully updated ${processedOrderIds.length} orders as invoiced`);
          toast.success(`${processedOrderIds.length} orders marked as invoiced`);
          // Refresh orders data to show updated status
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }
      }
    } catch (error) {
      console.error("Error generating invoices:", error);
      toast.error("Failed to generate invoices");
    }
  };

  const cancelSchema = z.object({
    tonu: z
      .string()
      .min(1, "TONU is required")
      .transform((val) => parseFloat(val)),
    driverRate: z
      .string()
      .min(1, "Driver rate is required")
      .transform((val) => parseFloat(val)),
    dhMiles: z
      .string()
      .min(1, "DH miles is required")
      .transform((val) => parseInt(val)),
    notes: z.string().min(1, "Notes are required"),
  });

  const openCancelDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
    setCancelDialogOpen(true);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrderId) return;

    try {
      // Validate inputs
      const validated = cancelSchema.parse(cancelFormData);

      // First, get current order values to backup
      const { data: currentOrder, error: fetchError } = await supabase
        .from("orders")
        .select("freight_amount, driver_price, loaded_miles, dh_miles, tonu, tonu_driver, notes")
        .eq("id", selectedOrderId)
        .single();

      if (fetchError) throw fetchError;

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Save backup of original values
      const { error: backupError } = await supabase.from("canceled_orders_backup").insert({
        order_id: selectedOrderId,
        canceled_by: user?.id,
        original_freight_amount: currentOrder.freight_amount,
        original_driver_price: currentOrder.driver_price,
        original_loaded_miles: currentOrder.loaded_miles,
        original_dh_miles: currentOrder.dh_miles,
        original_tonu: currentOrder.tonu,
        original_tonu_driver: currentOrder.tonu_driver,
        original_notes: currentOrder.notes,
        cancel_tonu: validated.tonu,
        cancel_driver_rate: validated.driverRate,
        cancel_dh_miles: validated.dhMiles,
        cancel_notes: validated.notes,
      });

      if (backupError) throw backupError;

      // Update order with cancel values
      const { error } = await supabase
        .from("orders")
        .update({
          tonu: validated.tonu,
          tonu_driver: validated.tonu,
          driver_price: validated.driverRate,
          dh_miles: validated.dhMiles,
          notes: validated.notes,
          freight_amount: 0,
          loaded_miles: 0,
          canceled: true,
        })
        .eq("id", selectedOrderId);

      if (error) throw error;

      toast.success("Load cancelled successfully");
      setCancelDialogOpen(false);
      setSelectedOrderId(null);
      setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });

      // Refresh orders list
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error("Error cancelling order:", error);
        toast.error("Failed to cancel load");
      }
    }
  };

  const handleRevertCancellation = async (orderId: string) => {
    if (!confirm("Are you sure you want to revert this cancellation? This will restore all original values.")) {
      return;
    }

    try {
      // Get the backup data
      const { data: backup, error: fetchError } = await supabase
        .from("canceled_orders_backup")
        .select("*")
        .eq("order_id", orderId)
        .order("canceled_at", { ascending: false })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;
      if (!backup) {
        toast.error("No backup found for this order");
        return;
      }

      // Restore original values
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          freight_amount: backup.original_freight_amount,
          driver_price: backup.original_driver_price,
          loaded_miles: backup.original_loaded_miles,
          dh_miles: backup.original_dh_miles,
          tonu: backup.original_tonu,
          tonu_driver: backup.original_tonu_driver,
          notes: backup.original_notes,
          canceled: false,
        })
        .eq("id", orderId);

      if (updateError) throw updateError;

      // Delete the backup record
      const { error: deleteError } = await supabase.from("canceled_orders_backup").delete().eq("id", backup.id);

      if (deleteError) console.error("Error deleting backup:", deleteError);

      toast.success("Load cancellation reverted successfully");

      // Refresh orders list
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      console.error("Error reverting cancellation:", error);
      toast.error("Failed to revert cancellation");
    }
  };
  return (
    <div className="h-full w-full">
      <div className="space-y-6 p-6 max-w-none">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Loads</h1>
          <div className="flex gap-2">
            {(primaryRole === "admin" || primaryRole === "accounting" || primaryRole === "manager") && (
              <>
                <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length}>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </Button>
                <Button variant="outline" onClick={generateInvoices} disabled={!filteredOrders.length}>
                  <FileText className="mr-2 h-4 w-4" />
                  INVOICE
                </Button>
              </>
            )}
            <Button onClick={() => navigate("/new-order")}>
              <FileText className="mr-2 h-4 w-4" />
              New Load
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowLegendDialog(true)} title="Color Legend">
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card className="w-fit min-w-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CardTitle className="shrink-0">All Loads</CardTitle>
              </div>

              <ScrollArea className="w-full">
                <div className="flex gap-4 items-center pb-4">
                  <div className="relative w-[288px] shrink-0">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search loads..."
                      className="pl-10 w-full"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <DateRangePicker
                    date={dateRange}
                    onDateChange={setDateRange}
                    placeholder="Filter by delivery date"
                    className="w-[288px] shrink-0"
                  />

                  <Combobox
                    value={truckFilter}
                    onValueChange={setTruckFilter}
                    placeholder="Filter by Truck"
                    searchPlaceholder="Search trucks..."
                    options={[
                      { value: "all-trucks", label: "All Trucks" },
                      ...uniqueTrucks.map((truck) => ({ value: truck, label: truck })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={companyFilter}
                    onValueChange={setCompanyFilter}
                    placeholder="Filter by Company"
                    searchPlaceholder="Search companies..."
                    options={[
                      { value: "all-companies", label: "All Companies" },
                      ...uniqueCompanies.map((company) => ({ value: company, label: company })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={truckCompanyFilter}
                    onValueChange={setTruckCompanyFilter}
                    placeholder="Filter by Truck Company"
                    searchPlaceholder="Search truck companies..."
                    options={[
                      { value: "all-truck-companies", label: "All Truck Companies" },
                      ...uniqueTruckCompanies.map((company) => ({ value: company, label: company })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={bookedByFilter}
                    onValueChange={setBookedByFilter}
                    placeholder="Filter by Booked By"
                    searchPlaceholder="Search users..."
                    options={[
                      { value: "all-users", label: "All Users" },
                      ...uniqueBookedBy.map((user) => ({ value: user, label: user })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={driverFilter}
                    onValueChange={setDriverFilter}
                    placeholder="Filter by Driver"
                    searchPlaceholder="Search drivers..."
                    options={[
                      { value: "all-drivers", label: "All Drivers" },
                      ...uniqueDrivers.map((driver) => ({ value: driver, label: driver })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={brokerFilter}
                    onValueChange={setBrokerFilter}
                    placeholder="Filter by Broker"
                    searchPlaceholder="Search brokers..."
                    options={[
                      { value: "all-brokers", label: "All Brokers" },
                      ...uniqueBrokers.map((broker) => ({ value: broker, label: broker })),
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Combobox
                    value={missingDocsFilter}
                    onValueChange={setMissingDocsFilter}
                    placeholder="Filter by Missing Docs"
                    searchPlaceholder="Search status..."
                    options={[
                      { value: "all", label: "All Orders" },
                      { value: "complete", label: "Complete (RC + POD)" },
                      { value: "missing-rc", label: "Missing RC" },
                      { value: "missing-bol", label: "Missing BOL" },
                      { value: "missing-pod", label: "Missing POD" },
                      { value: "canceled", label: "Canceled Loads" },
                    ]}
                    className="w-[192px] shrink-0"
                  />

                  <Button
                    variant={lockedNotInvoicedFilter ? "default" : "outline"}
                    onClick={() => setLockedNotInvoicedFilter(!lockedNotInvoicedFilter)}
                    className="w-[160px] shrink-0"
                  >
                    {lockedNotInvoicedFilter ? (
                      <>
                        <LockOpen className="mr-2 h-3.5 w-3.5 shrink-0" />
                        Hide Locked
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-3.5 w-3.5 shrink-0" />
                        Show Locked
                      </>
                    )}
                  </Button>
                </div>
              </ScrollArea>
            </div>
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
                    <TableHead className="w-20">Notes</TableHead>
                    <TableHead className="w-28">Freight Amount</TableHead>
                    <TableHead className="w-28">Company</TableHead>
                    <TableHead className="w-24">Booked By</TableHead>
                    <TableHead className="w-24">RC</TableHead>
                    <TableHead className="w-24">POD</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                        No orders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((order, index) => {
                      // Background color rules - Recovery orders get purple background that overrides all other colors
                      const isRecovery = (order as any).isRecovery;

                      const hasRedFees =
                        (order as any).lateFeeDriver > 0 ||
                        (order as any).noTrackingFeeDriver > 0 ||
                        (order as any).wrongAddressFeeDriver > 0;

                      const hasGreenFees = (order as any).detentionDriver > 0 || (order as any).layoverDriver > 0;

                      const hasYellowFees = order.escortFee > 0 || (order as any).lumper > 0;

                      const hasOrangeCondition =
                        order.canceled ||
                        ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

                      const isEvenRow = index % 2 === 1;
                      const alternatingBg = isEvenRow ? "bg-muted/30" : "";
                      
                      const rowClassName = isRecovery
                        ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)]"
                        : hasRedFees
                          ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)]"
                          : hasGreenFees
                            ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)]"
                            : hasYellowFees
                              ? "bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)]"
                              : hasOrangeCondition
                                ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)]"
                                : alternatingBg;

                      return (
                        <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                          <TableCell className="w-20 font-medium">{order.truckNumber}</TableCell>
                          <TableCell className="w-20">
                            <div className="flex items-center gap-1">
                              {hasRole("admin") && emailLogMap?.has(order.id) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Email sent to driver</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {order.internalLoadNumber}
                            </div>
                          </TableCell>
                          <TableCell className="w-32 p-0">
                            <div className="h-full p-4">
                              {order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}
                            </div>
                          </TableCell>
                          <TableCell className="w-28 p-0">
                            <div className="h-full p-4 line-clamp-2">{order.pickupCity}</div>
                          </TableCell>
                          <TableCell className="w-20 p-0">
                            <div className="h-full p-4">{order.pickupState}</div>
                          </TableCell>
                          <TableCell className="w-32 p-0">
                            <div className="h-full p-4">
                              {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}
                            </div>
                          </TableCell>
                          <TableCell className="w-28 p-0">
                            <div className="h-full p-4 line-clamp-2">{order.deliveryCity}</div>
                          </TableCell>
                          <TableCell className="w-20 p-0">
                            <div className="h-full p-4">{order.deliveryState}</div>
                          </TableCell>
                          <TableCell className="w-16">{order.mileage?.toLocaleString() || "0"}</TableCell>
                          <TableCell className="w-24">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency((order as any).totalDriverPay)}
                            </div>
                          </TableCell>
                          <TableCell className="w-32">
                            <div className="line-clamp-2">{order.driverName}</div>
                          </TableCell>
                          <TableCell className="w-36">
                            <div className="line-clamp-2">{order.brokerName}</div>
                          </TableCell>
                          <TableCell className="w-28">{order.brokerLoadNumber}</TableCell>
                          <TableCell className="w-20">{order.invoiced}</TableCell>
                          <TableCell className="w-20">
                            {order.notes && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs font-normal hover:underline"
                                onClick={() => {
                                  setSelectedNotes(order.notes);
                                  setNotesDialogOpen(true);
                                }}
                              >
                                {order.notes.length > 12 ? order.notes.substring(0, 12) + "..." : order.notes}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="w-28">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(order.totalFreightAmount)}
                            </div>
                          </TableCell>
                          <TableCell className="w-28">
                            <div className="line-clamp-2">{order.bookedByCompanyName}</div>
                          </TableCell>
                          <TableCell className="w-24">
                            <div className="line-clamp-2">{order.bookedBy}</div>
                          </TableCell>
                          <TableCell className="w-24">
                            <div className="flex gap-1 flex-wrap">
                              {order.rcFiles && order.rcFiles.length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={async () => {
                                    const file = order.rcFiles[0];
                                    const { data, error } = await supabase.storage
                                      .from("order-files")
                                      .createSignedUrl(file.file_path, 3600);

                                    if (error) {
                                      toast.error(`Failed to load file: ${error.message}`);
                                      return;
                                    }

                                    const signedUrl = data?.signedUrl;
                                    if (signedUrl) {
                                      try {
                                        const response = await fetch(signedUrl);
                                        if (!response.ok) throw new Error("Failed to fetch file");

                                        const blob = await response.blob();
                                        const blobUrl = URL.createObjectURL(blob);

                                        const newWindow = window.open(blobUrl, "_blank");
                                        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

                                        if (!newWindow) {
                                          toast.error("Please allow popups for this site");
                                        }
                                      } catch (err) {
                                        console.error("Error opening file:", err);
                                        toast.error("Failed to open file");
                                      }
                                    }
                                  }}
                                >
                                  {order.rcFiles[0].file_name.length > 8
                                    ? order.rcFiles[0].file_name.substring(0, 8) + "..."
                                    : order.rcFiles[0].file_name}
                                </Button>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  Missing
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-24">
                            <div className="flex gap-1 flex-wrap">
                              {order.podFiles && order.podFiles.length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={async () => {
                                    const file = order.podFiles[0];
                                    const { data, error } = await supabase.storage
                                      .from("order-files")
                                      .createSignedUrl(file.file_path, 3600);

                                    if (error) {
                                      toast.error(`Failed to load file: ${error.message}`);
                                      return;
                                    }

                                    const signedUrl = data?.signedUrl;
                                    if (signedUrl) {
                                      try {
                                        const response = await fetch(signedUrl);
                                        if (!response.ok) throw new Error("Failed to fetch file");

                                        const blob = await response.blob();
                                        const blobUrl = URL.createObjectURL(blob);

                                        const newWindow = window.open(blobUrl, "_blank");
                                        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

                                        if (!newWindow) {
                                          toast.error("Please allow popups for this site");
                                        }
                                      } catch (err) {
                                        console.error("Error opening file:", err);
                                        toast.error("Failed to open file");
                                      }
                                    }
                                  }}
                                >
                                  {order.podFiles[0].file_name.length > 8
                                    ? order.podFiles[0].file_name.substring(0, 8) + "..."
                                    : order.podFiles[0].file_name}
                                </Button>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  Missing
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-32">
                            <div className="flex gap-1 w-32">
                              {!order.locked && (
                                <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {(hasRole("manager") ||
                                hasRole("admin") ||
                                hasRole("accounting") ||
                                hasRole("supervisor")) && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => toggleOrderLock(order.id, order.locked)}
                                    title={order.locked ? "Unlock load" : "Lock load"}
                                  >
                                    {order.locked ? (
                                      <Lock className="h-4 w-4 text-destructive" />
                                    ) : (
                                      <LockOpen className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                  {!order.locked && !order.canceled && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openCancelDialog(order.id)}
                                      title="Cancel load"
                                    >
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                  {order.canceled &&
                                    !order.locked &&
                                    (hasRole("manager") ||
                                      hasRole("admin") ||
                                      hasRole("accounting") ||
                                      hasRole("supervisor") ||
                                      canCancelOrders) && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRevertCancellation(order.id)}
                                        title="Revert cancellation"
                                      >
                                        <Undo2 className="h-4 w-4 text-primary" />
                                      </Button>
                                    )}
                                </>
                              )}
                              {canCancelOrders && !order.locked && !order.canceled && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCancelDialog(order.id)}
                                  title="Cancel load"
                                >
                                  <XCircle className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                              {canCancelOrders && order.canceled && !order.locked && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRevertCancellation(order.id)}
                                  title="Revert cancellation"
                                >
                                  <Undo2 className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {filteredOrders.length > ORDERS_PER_PAGE && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length}{" "}
                  loads
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {/* First page */}
                    {currentPage > 2 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                          1
                        </PaginationLink>
                      </PaginationItem>
                    )}

                    {/* Ellipsis before current */}
                    {currentPage > 3 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}

                    {/* Previous page */}
                    {currentPage > 1 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage - 1)} className="cursor-pointer">
                          {currentPage - 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}

                    {/* Current page */}
                    <PaginationItem>
                      <PaginationLink isActive className="cursor-default">
                        {currentPage}
                      </PaginationLink>
                    </PaginationItem>

                    {/* Next page */}
                    {currentPage < totalPages && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage + 1)} className="cursor-pointer">
                          {currentPage + 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}

                    {/* Ellipsis after current */}
                    {currentPage < totalPages - 2 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}

                    {/* Last page */}
                    {currentPage < totalPages - 1 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    )}

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

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Load</DialogTitle>
              <DialogDescription>
                Enter cancellation details. This will set freight amount and loaded miles to 0.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="tonu">TONU Amount ($)</Label>
                <Input
                  id="tonu"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cancelFormData.tonu}
                  onChange={(e) => setCancelFormData({ ...cancelFormData, tonu: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverRate">Driver Rate ($)</Label>
                <Input
                  id="driverRate"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cancelFormData.driverRate}
                  onChange={(e) => setCancelFormData({ ...cancelFormData, driverRate: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dhMiles">DH Miles</Label>
                <Input
                  id="dhMiles"
                  type="number"
                  placeholder="0"
                  value={cancelFormData.dhMiles}
                  onChange={(e) => setCancelFormData({ ...cancelFormData, dhMiles: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Cancellation Notes</Label>
                <Input
                  id="notes"
                  placeholder="Enter reason for cancellation"
                  value={cancelFormData.notes}
                  onChange={(e) => setCancelFormData({ ...cancelFormData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCancelOrder}>
                Confirm Cancellation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Notes</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm whitespace-pre-wrap">{selectedNotes}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setNotesDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Color Legend Dialog */}
        <Dialog open={showLegendDialog} onOpenChange={setShowLegendDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Background Colors Legend</DialogTitle>
              <DialogDescription>Background colors indicate special conditions for loads</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 rounded bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] border border-border" />
                <div>
                  <p className="font-semibold">Purple - Recovery Load</p>
                  <p className="text-sm text-muted-foreground">Load assigned to recovery driver (highest priority)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 rounded bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] border border-border" />
                <div>
                  <p className="font-semibold">Red - Driver Penalty Fees</p>
                  <p className="text-sm text-muted-foreground">
                    Late fee, no tracking fee, or wrong address fee applied to driver
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 rounded bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] border border-border" />
                <div>
                  <p className="font-semibold">Green - Driver Bonus Fees</p>
                  <p className="text-sm text-muted-foreground">Detention or layover fees paid to driver</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 rounded bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)] border border-border" />
                <div>
                  <p className="font-semibold">Yellow - Escort/Lumper Fees</p>
                  <p className="text-sm text-muted-foreground">Escort fee or lumper fee applied to load</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 rounded bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] border border-border" />
                <div>
                  <p className="font-semibold">Orange - Canceled or Date Changed</p>
                  <p className="text-sm text-muted-foreground">Load has been canceled or has date change notes</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowLegendDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
export default Orders;
