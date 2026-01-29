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
import { Progress } from "@/components/ui/progress";
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
  Layers,
  CalendarClock,
  CheckSquare,
  Square,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import moneyStackIcon from "@/assets/money-stack.png";
import lumperReceiptIcon from "@/assets/lumper-receipt-icon.png";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
import { LumperMissingDataDialog } from "@/components/LumperMissingDataDialog";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useOrdersSearch } from "@/hooks/useOrdersSearch";
import { useUnlockedOrdersPagination } from "@/hooks/useUnlockedOrdersPagination";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { generateInvoicePDF, InvoiceProgress, InvoiceWarning } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { diagnoseLoadMiles } from "@/utils/diagnoseLoad";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { hasUpdateTracking } from "@/utils/orderChangeTracker";
import { useDebounce } from "@/hooks/useDebounce";
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
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";
import { OrdersCacheStatus } from "@/components/OrdersCacheStatus";
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

  console.log("🟦 [Orders Page] Component rendering");

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
      invoicedFilter,
      dateRange: dateRange
        ? {
            from: dateRange.from?.toISOString(),
            to: dateRange.to?.toISOString(),
          }
        : undefined,
      pickupDateRange: pickupDateRange
        ? {
            from: pickupDateRange.from?.toISOString(),
            to: pickupDateRange.to?.toISOString(),
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

  // For dispatch users, pass their name and user_id to filter at the database level
  // This includes orders they booked AND orders for drivers assigned to them
  // Use null instead of undefined to prevent double fetch when profile loads
  const orderFilterOptions = isDispatchOnly 
    ? { bookedBy: profile?.full_name || null, dispatcherUserId: profile?.user_id || null } 
    : { bookedBy: null, dispatcherUserId: null };

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
  const [invoicedFilter, setInvoicedFilter] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [pickupDateRange, setPickupDateRange] = useState<DateRange | undefined>();
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
  const [paidConfirmDialogOpen, setPaidConfirmDialogOpen] = useState(false);
  const [pendingPaidOrder, setPendingPaidOrder] = useState<{ id: string; currentPaid: boolean } | null>(null);
  const [recalculatingOrder, setRecalculatingOrder] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [invoiceProgress, setInvoiceProgress] = useState<InvoiceProgress | null>(null);
  const [invoiceWarnings, setInvoiceWarnings] = useState<InvoiceWarning[]>([]);
  const [invoiceWarningDialogOpen, setInvoiceWarningDialogOpen] = useState(false);
  const [lumperMissingDataDialog, setLumperMissingDataDialog] = useState<{
    orderId: string;
    driverId: string;
    driverName: string;
  } | null>(null);
  const ORDERS_PER_PAGE = 100;
  
  // Lumper missing revised RC hook - check by order ID
  const { lumperRequests } = useLumperMissingRevisedRC();
  const orderIdsWithMissingLumperRC = new Set(lumperRequests.map(r => r.id));

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
          setInvoicedFilter(state.invoicedFilter || false);
          if (state.dateRange) {
            setDateRange({
              from: state.dateRange.from ? new Date(state.dateRange.from) : undefined,
              to: state.dateRange.to ? new Date(state.dateRange.to) : undefined,
            });
          }
          if (state.pickupDateRange) {
            setPickupDateRange({
              from: state.pickupDateRange.from ? new Date(state.pickupDateRange.from) : undefined,
              to: state.pickupDateRange.to ? new Date(state.pickupDateRange.to) : undefined,
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

  // For dispatch-only users, we don't auto-set bookedByFilter anymore
  // since the DB query already filters to their booked orders + their assigned drivers' orders
  // They can still manually filter by "booked by" if they want to see only their own bookings

  const { data: orders, isLoading, error, isLoadingLocked, lockedOrdersLoaded } = useOrders(orderFilterOptions);

  // Server-side search hook - queries database directly when searching
  const { searchResults, isSearching, searchOrders, clearSearch } = useOrdersSearch();
  
  // Pagination hook for unlocked orders - allows loading more without loading everything
  const {
    isLoadingMore,
    totalUnlockedCount,
    loadedCount: loadedUnlockedCount,
    loadMoreUnlockedOrders,
    fetchTotalCount,
    setInitialLoadedCount,
  } = useUnlockedOrdersPagination(orderFilterOptions);

  // Debounce search term for server-side search
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Track previous search term to avoid unnecessary searches
  const [lastSearchedTerm, setLastSearchedTerm] = useState<string>("");

  // Trigger server-side search ONLY when debounced search term actually changes
  useEffect(() => {
    const trimmedTerm = debouncedSearchTerm?.trim() || "";
    
    // Only search if the term actually changed
    if (trimmedTerm === lastSearchedTerm) {
      return;
    }
    
    if (trimmedTerm.length >= 2) {
      setLastSearchedTerm(trimmedTerm);
      searchOrders(trimmedTerm, orderFilterOptions);
    } else if (lastSearchedTerm) {
      // Clear search only if we had a previous search
      setLastSearchedTerm("");
      clearSearch();
    }
  }, [debouncedSearchTerm]); // Intentionally not including orderFilterOptions to prevent re-search on every render

  // Fetch total unlocked count on mount (once)
  const [hasFetchedCount, setHasFetchedCount] = useState(false);
  useEffect(() => {
    if (!hasFetchedCount) {
      fetchTotalCount();
      setHasFetchedCount(true);
    }
  }, [hasFetchedCount, fetchTotalCount]);

  // Update pagination state when orders load
  useEffect(() => {
    if (orders) {
      const unlockedCount = orders.filter(o => !o.locked).length;
      setInitialLoadedCount(unlockedCount);
    }
  }, [orders, setInitialLoadedCount]);

  // Background loading: automatically load remaining unlocked orders in batches
  const [backgroundLoadingStarted, setBackgroundLoadingStarted] = useState(false);
  const [backgroundLoadingComplete, setBackgroundLoadingComplete] = useState(false);
  
  useEffect(() => {
    // Start background loading after initial data is loaded
    if (
      orders && 
      orders.length > 0 && 
      !backgroundLoadingStarted && 
      !backgroundLoadingComplete &&
      !isLoading &&
      totalUnlockedCount !== null &&
      loadedUnlockedCount < totalUnlockedCount
    ) {
      setBackgroundLoadingStarted(true);
      
      // Load remaining orders in background batches
      const loadRemainingInBackground = async () => {
        console.log(`[Orders] Starting background load: ${loadedUnlockedCount} of ${totalUnlockedCount}`);
        let hasMore = true;
        let attempts = 0;
        const maxAttempts = 50; // Safety limit
        
        while (hasMore && attempts < maxAttempts) {
          attempts++;
          // loadMoreUnlockedOrders returns whether there are more to load
          hasMore = await loadMoreUnlockedOrders();
          
          if (hasMore) {
            // Small delay between batches to not overwhelm the browser
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
        
        console.log(`[Orders] Background loading complete after ${attempts} batches`);
        setBackgroundLoadingComplete(true);
      };
      
      loadRemainingInBackground();
    }
  }, [orders, isLoading, backgroundLoadingStarted, backgroundLoadingComplete, totalUnlockedCount, loadedUnlockedCount, loadMoreUnlockedOrders]);

  console.log("🟦 [Orders Page] useOrders returned:", {
    ordersCount: orders?.length,
    isLoading,
    error,
    orderFilterOptions,
    searchResultsCount: searchResults?.length,
  });

  // Log when orders data changes
  useEffect(() => {
    console.log("🔵 [Orders Page] Orders data changed! New count:", orders?.length);
    if (orders && orders.length > 0) {
      console.log("🔵 [Orders Page] First order:", orders[0]);
      console.log("🔵 [Orders Page] Last order:", orders[orders.length - 1]);
    }
  }, [orders]);

  const { data: companies } = useCompanies();

  // When server-side search is active and has results, use those
  // Otherwise, filter loaded orders locally
  const dataSource = useMemo(() => {
    // If searching and we have server results, prioritize those
    if (debouncedSearchTerm && debouncedSearchTerm.trim().length >= 2 && searchResults) {
      return searchResults;
    }
    return orders || [];
  }, [debouncedSearchTerm, searchResults, orders]);

  // Filter orders based on search term and filters
  const filteredOrders =
    dataSource?.filter((order) => {
      // When using server-side search results, don't apply client-side search filter
      const isServerSearch = debouncedSearchTerm && debouncedSearchTerm.trim().length >= 2 && searchResults;
      
      let matchesSearch = true;
      if (!isServerSearch && searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        // Format internal load number with company suffix for search
        const formattedInternalLoadNumber = order.internalLoadNumber 
          ? formatInternalLoadNumber(order.internalLoadNumber, order.truckCompanyName)
          : "";
        matchesSearch =
          (order.internalLoadNumber?.toString() || "").toLowerCase().includes(searchLower) ||
          formattedInternalLoadNumber.toLowerCase().includes(searchLower) ||
          (order.loadNumber?.toString() || "").toLowerCase().includes(searchLower) ||
          (order.truckNumber?.toString() || "").toLowerCase().includes(searchLower) ||
          (order.driverName?.toLowerCase() || "").includes(searchLower) ||
          (order.brokerName?.toLowerCase() || "").includes(searchLower) ||
          (order.brokerLoadNumber?.toString() || "").toLowerCase().includes(searchLower);
      }
      const matchesCompany =
        !companyFilter || companyFilter === "all-companies" || order.bookedByCompanyName === companyFilter;
      const matchesTruckCompany =
        !truckCompanyFilter ||
        truckCompanyFilter === "all-truck-companies" ||
        order.driverCompanyName === truckCompanyFilter;

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
          // For multi-drop loads, check if all deliveries have PODs
          const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
          const podCount = order.podFiles?.length || 0;
          matchesMissingDocs = podCount < deliveryCount;
        } else if (missingDocsFilter === "complete") {
          // Complete means RC exists AND all deliveries have PODs
          const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
          const podCount = order.podFiles?.length || 0;
          matchesMissingDocs = (order.rcFiles?.length || 0) > 0 && podCount >= deliveryCount;
        } else if (missingDocsFilter === "canceled") {
          matchesMissingDocs = order.canceled === true;
        } else if (missingDocsFilter === "pending-payment") {
          matchesMissingDocs = order.invoiced === true && order.paid !== true;
        } else if (missingDocsFilter === "billed") {
          matchesMissingDocs = order.paid === true;
        } else if (missingDocsFilter === "updated") {
          matchesMissingDocs = hasUpdateTracking(order.notes);
        }
      }

      // Date filtering based on delivery date - extract UTC date directly from ISO string
      let matchesDate = true;
      if (dateRange?.from && order.deliveryDate) {
        let dateStr = order.deliveryDate.split(" - ")[0];
        // Normalize space-separated dates (from CSV) to ISO format
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
          dateStr = dateStr.replace(' ', 'T');
        }
        // Extract date part directly from ISO string (UTC-based)
        const datePart = dateStr.split('T')[0];
        
        if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = datePart.split('-').map(Number);
          const orderDateOnly = new Date(year, month - 1, day);

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
        } else {
          matchesDate = false;
        }
      }

      // Date filtering based on pickup date - extract UTC date directly from ISO string
      let matchesPickupDate = true;
      if (pickupDateRange?.from && order.pickupDate) {
        let dateStr = order.pickupDate.split(" - ")[0];
        // Normalize space-separated dates (from CSV) to ISO format
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
          dateStr = dateStr.replace(' ', 'T');
        }
        // Extract date part directly from ISO string (UTC-based)
        const datePart = dateStr.split('T')[0];
        
        if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = datePart.split('-').map(Number);
          const orderDateOnly = new Date(year, month - 1, day);

          if (pickupDateRange.to) {
            // Date range filtering
            const fromDateOnly = new Date(
              pickupDateRange.from.getFullYear(),
              pickupDateRange.from.getMonth(),
              pickupDateRange.from.getDate(),
            );
            const toDateOnly = new Date(
              pickupDateRange.to.getFullYear(),
              pickupDateRange.to.getMonth(),
              pickupDateRange.to.getDate(),
            );
            matchesPickupDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
          } else {
            // Single date filtering
            const selectedDateOnly = new Date(
              pickupDateRange.from.getFullYear(),
              pickupDateRange.from.getMonth(),
              pickupDateRange.from.getDate(),
            );
            matchesPickupDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
          }
        } else {
          matchesPickupDate = false;
        }
      }

      // Filter for locked but not invoiced loads with freight amount > 0
      const matchesLockedNotInvoiced =
        !lockedNotInvoicedFilter || (order.locked && !order.invoiced && (order.totalFreightAmount || 0) > 0);

      // Filter for invoiced loads
      const matchesInvoiced = !invoicedFilter || order.invoiced === true;

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
        matchesPickupDate &&
        matchesLockedNotInvoiced &&
        matchesInvoiced
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
    pickupDateRange,
    lockedNotInvoicedFilter,
    invoicedFilter,
  ]);

  // Clear selection when filters change or selection mode is toggled off
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [selectionMode, searchTerm, companyFilter, truckCompanyFilter, bookedByFilter, truckFilter, driverFilter, brokerFilter, missingDocsFilter, dateRange, pickupDateRange, lockedNotInvoicedFilter, invoicedFilter]);

  // Selection helpers
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  // Get selected orders data
  const selectedOrders = filteredOrders.filter(o => selectedOrderIds.has(o.id));
  const selectedTotalFreight = selectedOrders.reduce((sum, o) => sum + (o.totalFreightAmount || 0), 0);
  
  // Group by booked by company
  const selectedByCompany = selectedOrders.reduce((acc, order) => {
    const company = order.bookedByCompanyName || 'Unknown';
    if (!acc[company]) {
      acc[company] = { count: 0, freight: 0 };
    }
    acc[company].count += 1;
    acc[company].freight += order.totalFreightAmount || 0;
    return acc;
  }, {} as Record<string, { count: number; freight: number }>);

  // Bulk lock selected orders
  const bulkLockOrders = async () => {
    if (selectedOrderIds.size === 0) return;
    
    const unlocked = selectedOrders.filter(o => !o.locked);
    if (unlocked.length === 0) {
      toast.info("All selected loads are already locked");
      return;
    }

    try {
      const { error } = await supabase
        .from("orders")
        .update({ locked: true })
        .in("id", unlocked.map(o => o.id));

      if (error) throw error;

      toast.success(`Locked ${unlocked.length} loads successfully`);
      // Real-time subscription will update the cache automatically
      setSelectedOrderIds(new Set());
      setSelectionMode(false);

      // Update cache in background
      (async () => {
        try {
          const { addLockedOrderToCache } = await import("@/utils/ordersCache");
          for (const order of unlocked) {
            const { data: orderData } = await supabase
              .from("orders")
              .select("*")
              .eq("id", order.id)
              .single();
            if (orderData) {
              await addLockedOrderToCache(orderData);
            }
          }
        } catch (cacheError) {
          console.warn("Cache update failed:", cacheError);
        }
      })();
    } catch (error) {
      console.error("Error bulk locking orders:", error);
      toast.error("Failed to lock selected loads");
    }
  };

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
  const uniqueTruckCompanies = [...new Set(orders?.map((order) => order.driverCompanyName) || [])].filter(Boolean);
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
      "Load #": formatInternalLoadNumber(order.internalLoadNumber, order.companyName || order.truckCompanyName),
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
      Company: (order as any).driverCompanyName || order.companyName,
      "Booked By": order.bookedBy,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `orders_${new Date().toISOString().split("T")[0]}.xlsx`);
  };
  const toggleOrderLock = async (orderId: string, currentLockStatus: boolean) => {
    try {
      // When unlocking, also set invoiced to false and clear invoiced_at
      const updateData = currentLockStatus 
        ? { locked: false, invoiced: false, invoiced_at: null } 
        : { locked: true };
      
      const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);

      if (error) throw error;

      // Show success immediately - real-time subscription will update cache
      toast.success(`Load ${!currentLockStatus ? "locked" : "unlocked"} successfully`);

      // Update cache in background (non-blocking)
      (async () => {
        try {
          const { addLockedOrderToCache, removeLockedOrderFromCache } = await import("@/utils/ordersCache");
          
          if (!currentLockStatus) {
            // Locking - fetch full order data and add to cache
            const { data: orderData } = await supabase
              .from("orders")
              .select("*")
              .eq("id", orderId)
              .single();
            
            if (orderData) {
              await addLockedOrderToCache(orderData);
            }
          } else {
            // Unlocking - remove from cache
            await removeLockedOrderFromCache(orderId);
          }
        } catch (cacheError) {
          console.warn("Cache update failed (will sync on next archive export):", cacheError);
        }
      })();
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
    // Use selected orders if in selection mode, otherwise use all filtered orders
    const ordersToInvoice = selectionMode && selectedOrderIds.size > 0
      ? filteredOrders.filter(order => selectedOrderIds.has(order.id))
      : filteredOrders;
    
    if (!ordersToInvoice.length) return;
    
    try {
      setInvoiceProgress({ current: 0, total: ordersToInvoice.length, phase: 'preparing', message: 'Preparing invoices...' });
      
      const result = await generateInvoicePDF(ordersToInvoice, (progress) => {
        setInvoiceProgress(progress);
      });

      setInvoiceProgress(null);

      // Show warnings dialog if there are any
      if (result.warnings.length > 0) {
        setInvoiceWarnings(result.warnings);
        setInvoiceWarningDialogOpen(true);
      }

      // Update invoiced status for all orders that were successfully processed
      if (result.orderIds.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update({
            invoiced: true,
            locked: true,
            invoiced_at: new Date().toISOString(),
          })
          .in("id", result.orderIds);
        if (error) {
          console.error("Error updating invoice status:", error);
          toast.error("Failed to update invoice status");
        } else {
          console.log(`Successfully updated ${result.orderIds.length} orders as invoiced`);
          toast.success(`${result.orderIds.length} orders marked as invoiced`);
          // Real-time subscription will update the cache
        }
      }
    } catch (error: any) {
      setInvoiceProgress(null);
      console.error("Error generating invoices:", error);
      toast.error(error?.message || "Failed to generate invoices");
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
          tonu_driver: validated.driverRate,
          dh_miles: validated.dhMiles,
          notes: validated.notes,
          freight_amount: 0,
          driver_price: 0,
          loaded_miles: 0,
          mileage: validated.dhMiles, // For canceled loads: loaded_miles (0) + dh_miles
          canceled: true,
        })
        .eq("id", selectedOrderId);

      if (error) throw error;

      toast.success("Load cancelled successfully");
      setCancelDialogOpen(false);
      setSelectedOrderId(null);
      setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
      // Real-time subscription will update the cache
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
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!backup) {
        toast.error("No backup found for this order - reverting with current values");
        // Just uncancel without restoring original values
        const { error: updateError } = await supabase
          .from("orders")
          .update({ canceled: false })
          .eq("id", orderId);
        if (updateError) throw updateError;
        toast.success("Load uncanceled");
        // Real-time subscription will update the cache
        return;
      }

      // Restore original values - recalculate mileage from loaded + dh miles
      const restoredMileage = (backup.original_loaded_miles || 0) + (backup.original_dh_miles || 0);
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          freight_amount: backup.original_freight_amount,
          driver_price: backup.original_driver_price,
          loaded_miles: backup.original_loaded_miles,
          dh_miles: backup.original_dh_miles,
          mileage: restoredMileage,
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
      // Real-time subscription will update the cache
    } catch (error) {
      console.error("Error reverting cancellation:", error);
      toast.error("Failed to revert cancellation");
    }
  };

  const handleConfirmPaidChange = async () => {
    if (!pendingPaidOrder) return;
    
    try {
      const newPaidStatus = !pendingPaidOrder.currentPaid;
      const { error } = await supabase
        .from("orders")
        .update({ paid: newPaidStatus })
        .eq("id", pendingPaidOrder.id);

      if (error) throw error;

      toast.success(`Load marked as ${newPaidStatus ? 'paid' : 'unpaid'}`);
      // Real-time subscription will update the cache
    } catch (error) {
      console.error("Error updating paid status:", error);
      toast.error("Failed to update paid status");
    } finally {
      setPaidConfirmDialogOpen(false);
      setPendingPaidOrder(null);
    }
  };
  return (
    <div className="h-full w-full">
      <div className="space-y-4 md:space-y-6 p-4 md:p-6 max-w-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Loads</h1>
          <div className="flex flex-wrap gap-2">
            {(primaryRole === "admin" || primaryRole === "accounting" || primaryRole === "manager") && (
              <>
                <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length} className="text-xs md:text-sm">
                  <Download className="mr-1 md:mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Export to Excel</span>
                  <span className="sm:hidden">Export</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={generateInvoices} 
                  disabled={invoiceProgress !== null || (selectionMode ? selectedOrderIds.size === 0 : !filteredOrders.length)} 
                  className="text-xs md:text-sm"
                >
                  {invoiceProgress ? (
                    <Loader2 className="mr-1 md:mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-1 md:mr-2 h-4 w-4" />
                  )}
                  {selectionMode && selectedOrderIds.size > 0 ? `INVOICE (${selectedOrderIds.size})` : 'INVOICE'}
                </Button>
                {invoiceProgress && (
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <Progress value={(invoiceProgress.current / invoiceProgress.total) * 100} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {invoiceProgress.current}/{invoiceProgress.total}
                    </span>
                  </div>
                )}
              </>
            )}
            <Button onClick={() => navigate("/new-order")} className="text-xs md:text-sm">
              <FileText className="mr-1 md:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">New Load</span>
              <span className="sm:hidden">New</span>
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
                {isLoadingLocked && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading archived...</span>
                  </div>
                )}
              </div>

              <ScrollArea className="w-full">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4 pb-4">
                  {/* Column 1: Search - spans 2 rows on large screens */}
                  <div className="col-span-2 sm:col-span-1 lg:row-span-2 flex items-center">
                    <div className="relative w-full">
                      {isSearching ? (
                        <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-primary h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      )}
                      <Input
                        placeholder="Search all loads..."
                        className="pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Column 2 Row 1: Pickup Date */}
                  <DateRangePicker
                    date={pickupDateRange}
                    onDateChange={setPickupDateRange}
                    placeholder="Filter by pickup date"
                    className="w-full"
                  />

                  {/* Column 3 Row 1: Trucks */}
                  <Combobox
                    value={truckFilter}
                    onValueChange={setTruckFilter}
                    placeholder="All Trucks"
                    searchPlaceholder="Search trucks..."
                    options={[
                      { value: "all-trucks", label: "All Trucks" },
                      ...uniqueTrucks.map((truck) => ({ value: truck, label: truck })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 4 Row 1: Companies */}
                  <Combobox
                    value={companyFilter}
                    onValueChange={setCompanyFilter}
                    placeholder="All Companies"
                    searchPlaceholder="Search companies..."
                    options={[
                      { value: "all-companies", label: "All Companies" },
                      ...uniqueCompanies.map((company) => ({ value: company, label: company })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 5 Row 1: Users */}
                  <Combobox
                    value={bookedByFilter}
                    onValueChange={setBookedByFilter}
                    placeholder="All Users"
                    searchPlaceholder="Search users..."
                    options={[
                      { value: "all-users", label: "All Users" },
                      ...uniqueBookedBy.map((user) => ({ value: user, label: user })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 6 Row 1: Missing Docs Filter */}
                  <Combobox
                    value={missingDocsFilter}
                    onValueChange={setMissingDocsFilter}
                    placeholder="All Orders"
                    searchPlaceholder="Search status..."
                    options={[
                      { value: "all", label: "All Orders" },
                      { value: "updated", label: "Updated Orders" },
                      { value: "complete", label: "Complete (RC + POD)" },
                      { value: "missing-rc", label: "Missing RC" },
                      { value: "missing-bol", label: "Missing BOL" },
                      { value: "missing-pod", label: "Missing POD" },
                      { value: "canceled", label: "Canceled Loads" },
                      { value: "pending-payment", label: "Pending Payment" },
                      { value: "billed", label: "Billed Loads" },
                    ]}
                    className="w-full"
                  />

                  {/* Column 2 Row 2: Delivery Date */}
                  <DateRangePicker
                    date={dateRange}
                    onDateChange={setDateRange}
                    placeholder="Filter by delivery date"
                    className="w-full"
                  />

                  {/* Column 3 Row 2: Drivers */}
                  <Combobox
                    value={driverFilter}
                    onValueChange={setDriverFilter}
                    placeholder="All Drivers"
                    searchPlaceholder="Search drivers..."
                    options={[
                      { value: "all-drivers", label: "All Drivers" },
                      ...uniqueDrivers.map((driver) => ({ value: driver, label: driver })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 4 Row 2: Truck Companies */}
                  <Combobox
                    value={truckCompanyFilter}
                    onValueChange={setTruckCompanyFilter}
                    placeholder="All Truck Companies"
                    searchPlaceholder="Search truck companies..."
                    options={[
                      { value: "all-truck-companies", label: "All Truck Companies" },
                      ...uniqueTruckCompanies.map((company) => ({ value: company, label: company })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 5 Row 2: Brokers */}
                  <Combobox
                    value={brokerFilter}
                    onValueChange={setBrokerFilter}
                    placeholder="All Brokers"
                    searchPlaceholder="Search brokers..."
                    options={[
                      { value: "all-brokers", label: "All Brokers" },
                      ...uniqueBrokers.map((broker) => ({ value: broker, label: broker })),
                    ]}
                    className="w-full"
                  />

                  {/* Column 6 Row 2: Show Invoiced */}
                  <div className="flex flex-col gap-1">
                    <Button
                      variant={invoicedFilter ? "default" : "outline"}
                      onClick={() => setInvoicedFilter(!invoicedFilter)}
                      className="w-full"
                    >
                      <FileText className="mr-2 h-3.5 w-3.5 shrink-0" />
                      {invoicedFilter ? "Hide Invoiced" : "Show Invoiced"}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-xs text-muted-foreground text-center hover:text-foreground hover:underline cursor-pointer transition-colors w-full">
                          Not Invoiced: {formatCurrency(
                            orders?.filter(o => o.invoiced !== true)
                              .reduce((sum, o) => sum + (o.totalFreightAmount || 0), 0) || 0
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-4" align="center">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Not Invoiced by Company</h4>
                          <div className="space-y-2">
                            {(() => {
                              const notInvoicedOrders = orders?.filter(o => o.invoiced !== true) || [];
                              const byCompany = notInvoicedOrders.reduce((acc, order) => {
                                const company = order.bookedByCompanyName || 'Unknown';
                                if (!acc[company]) {
                                  acc[company] = { count: 0, freight: 0 };
                                }
                                acc[company].count += 1;
                                acc[company].freight += order.totalFreightAmount || 0;
                                return acc;
                              }, {} as Record<string, { count: number; freight: number }>);
                              
                              return (Object.entries(byCompany) as [string, { count: number; freight: number }][])
                                .sort((a, b) => b[1].freight - a[1].freight)
                                .map(([company, data]) => (
                                  <div key={company} className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{company}</span>
                                    <div className="text-right">
                                      <span className="font-medium">{formatCurrency(data.freight)}</span>
                                      <span className="text-muted-foreground ml-2">({data.count})</span>
                                    </div>
                                  </div>
                                ));
                            })()}
                          </div>
                          <div className="border-t pt-2 flex justify-between items-center text-sm font-medium">
                            <span>Total</span>
                            <span>{formatCurrency(
                              orders?.filter(o => o.invoiced !== true)
                                .reduce((sum, o) => sum + (o.totalFreightAmount || 0), 0) || 0
                            )}</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </CardHeader>
          <OrdersCacheStatus />
          <CardContent className="p-0">
            <div className="p-2 md:p-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px] min-w-[60px] max-w-[60px]">
                      {selectionMode ? (
                        <Checkbox
                          checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSelectionMode(true)}
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
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={primaryRole === 'dispatch' || primaryRole === 'afterhours' ? 20 : 21} className="text-center py-8 text-muted-foreground">
                        No orders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((order, index) => {
                      // Background color rules - Based on total freight vs freight amount
                      const isRecovery = (order as any).isRecovery;
                      const isCanceled = order.canceled;
                      const freightAmount = Number((order as any).freightAmount) || 0;
                      const totalFreight = Number(order.totalFreightAmount) || 0;
                      const lumper = Number((order as any).lumper) || 0;
                      const escortFee = Number((order as any).escortFee) || 0;
                      const hasLumperOrEscort = lumper > 0 || escortFee > 0;
                      const hasAdditionalPay = totalFreight > freightAmount;
                      const hasReducedPay = totalFreight < freightAmount;

                      const hasOrangeCondition =
                        order.canceled ||
                        ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

                      const isEvenRow = index % 2 === 1;
                      const alternatingBg = isEvenRow ? "bg-muted/50 hover:bg-muted/50 dark:bg-muted/30 dark:hover:bg-muted/30" : "bg-background hover:bg-background";

                      // Yellow (hue ~50) for lumper/escort, Orange (hue ~25) for canceled/date changed
                      // Lumper/Escort takes priority over additional/reduced pay for yellow background
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

                      return (
                        <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                          <TableCell className="w-12 px-1">
                            <div className="flex items-center gap-0">
                              {selectionMode && (
                                <Checkbox
                                  checked={selectedOrderIds.has(order.id)}
                                  onCheckedChange={() => toggleOrderSelection(order.id)}
                                  className="mr-1"
                                  aria-label={`Select load ${order.loadNumber}`}
                                />
                              )}
                              {/* Canceled icon */}
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
                              {/* Additional/Reduced Pay Icon (includes lumper/escort) */}
                              {(hasAdditionalPay || hasReducedPay) && (() => {
                                const isPositive = hasAdditionalPay;
                                const freightAmountVal = Number((order as any).freightAmount) || 0;
                                const totalFreightVal = Number(order.totalFreightAmount) || 0;
                                const difference = totalFreightVal - freightAmountVal;

                                // Get driver values
                                const driverPrice = Number((order as any).driverPrice) || 0;
                                const totalDriverPay = Number((order as any).totalDriverPay) || 0;

                                // Freight side values
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

                                // Driver side values
                                const detentionDriver = Number((order as any).detentionDriver) || 0;
                                const layoverDriver = Number((order as any).layoverDriver) || 0;
                                const tonuDriver = Number((order as any).tonuDriver) || 0;
                                const extraStopDriver = Number((order as any).extraStopDriver) || 0;
                                const lateFeeDriver = Number((order as any).lateFeeDriver) || 0;
                                const noTrackingFeeDriver = Number((order as any).noTrackingFeeDriver) || 0;
                                const wrongAddressFeeDriver = Number((order as any).wrongAddressFeeDriver) || 0;
                                const lumperDriver = Number((order as any).lumperDriver) || 0;
                                const otherChargesDriver = Number((order as any).otherChargesDriver) || 0;
                                const otherAdditionalsDriver = Number((order as any).otherAdditionalsDriver) || 0;

                                const freightItems: { label: string; value: number }[] = [];
                                const driverItems: { label: string; value: number }[] = [];

                                // Build freight items - late fee, no tracking, wrong address, other charges are deductions (negative)
                                if (detention !== 0) freightItems.push({ label: "Detention", value: detention });
                                if (layover !== 0) freightItems.push({ label: "Layover", value: layover });
                                if (tonu !== 0) freightItems.push({ label: "TONU", value: tonu });
                                if (extraStop !== 0) freightItems.push({ label: "Extra Stop", value: extraStop });
                                if (lateFee !== 0) freightItems.push({ label: "Late Fee", value: -lateFee });
                                if (noTrackingFee !== 0) freightItems.push({ label: "No Tracking", value: -noTrackingFee });
                                if (wrongAddressFee !== 0) freightItems.push({ label: "Wrong Address", value: -wrongAddressFee });
                                if (escortFee !== 0) freightItems.push({ label: "Escort", value: escortFee });
                                if (lumper !== 0) freightItems.push({ label: "Lumper", value: lumper });
                                if (otherCharges !== 0) {
                                  const reason = String((order as any).otherChargesReason || "").trim();
                                  freightItems.push({ label: reason || "Other Charges", value: -otherCharges });
                                }
                                if (otherAdditionals !== 0) {
                                  const reason = String((order as any).otherAdditionalsReason || "").trim();
                                  freightItems.push({ label: reason || "Other Additionals", value: otherAdditionals });
                                }

                                // Build driver items - late fee, no tracking, wrong address are deductions (negative)
                                if (detentionDriver !== 0) driverItems.push({ label: "Detention", value: detentionDriver });
                                if (layoverDriver !== 0) driverItems.push({ label: "Layover", value: layoverDriver });
                                if (tonuDriver !== 0) driverItems.push({ label: "TONU", value: tonuDriver });
                                if (extraStopDriver !== 0) driverItems.push({ label: "Extra Stop", value: extraStopDriver });
                                if (lateFeeDriver !== 0) driverItems.push({ label: "Late Fee", value: -lateFeeDriver });
                                if (noTrackingFeeDriver !== 0) driverItems.push({ label: "No Tracking", value: -noTrackingFeeDriver });
                                if (wrongAddressFeeDriver !== 0) driverItems.push({ label: "Wrong Address", value: -wrongAddressFeeDriver });
                                if (lumperDriver !== 0) driverItems.push({ label: "Lumper", value: lumperDriver });
                                if (otherChargesDriver !== 0) {
                                  const reason = String((order as any).otherChargesReason || "").trim();
                                  driverItems.push({ label: reason || "Other Charges", value: otherChargesDriver });
                                }
                                if (otherAdditionalsDriver !== 0) {
                                  const reason = String((order as any).otherAdditionalsReason || "").trim();
                                  driverItems.push({ label: reason || "Other Additionals", value: otherAdditionalsDriver });
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
                                        <div className="font-medium text-muted-foreground">Company (Freight Amount)</div>
                                        <div>Base: {formatCurrency(freightAmountVal)}</div>
                                        {freightItems.map((item, idx) => {
                                          const sign = item.value >= 0 ? "+" : "-";
                                          return (
                                            <div key={idx} className="text-muted-foreground pl-2">
                                              {item.label}: {sign}{formatCurrency(Math.abs(item.value))}
                                            </div>
                                          );
                                        })}
                                        <div className="pt-1 border-t">Total: {formatCurrency(totalFreightVal)}</div>
                                        <div className={`font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
                                          Difference: {isPositive ? "+" : ""}{formatCurrency(difference)}
                                        </div>
                                      </div>

                                      {/* Driver Section */}
                                      {hasDriverItems && (
                                        <div className="space-y-1 text-sm mt-3 pt-3 border-t">
                                          <div className="font-medium text-muted-foreground">Driver Pay</div>
                                          <div>Base: {formatCurrency(driverPrice)}</div>
                                          {driverItems.map((item, idx) => {
                                            const sign = item.value >= 0 ? "+" : "-";
                                            return (
                                              <div key={idx} className="text-muted-foreground pl-2">
                                                {item.label}: {sign}{formatCurrency(Math.abs(item.value))}
                                              </div>
                                            );
                                          })}
                                          <div className="pt-1 border-t">Total: {formatCurrency(totalDriverPay)}</div>
                                          <div className={`font-semibold ${driverDifference >= 0 ? "text-green-500" : "text-red-500"}`}>
                                            Difference: {driverDifference >= 0 ? "+" : ""}{formatCurrency(driverDifference)}
                                          </div>
                                        </div>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                );
                              })()}
                              {/* Rescheduled icon */}
                              {(order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "" && (
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
                              {/* Lumper Missing Revised RC icon */}
                              {orderIdsWithMissingLumperRC.has(order.id) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className="inline-flex p-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLumperMissingDataDialog({
                                            orderId: order.id,
                                            driverId: (order as any).driver1Id || "",
                                            driverName: order.driverName || "Unknown",
                                          });
                                        }}
                                      >
                                        <img src={lumperReceiptIcon} alt="Lumper Receipt" className="h-4 w-4 cursor-pointer" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Lumper - Missing Receipt</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-20 font-medium">{order.truckNumber}</TableCell>
                          <TableCell className="w-32">
                            <div className="line-clamp-2">{order.driverName}</div>
                          </TableCell>
                          <TableCell className="w-20">
                            <div className="flex items-center gap-1">
                              {(order as any).isPartial && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Layers className="h-3.5 w-3.5 text-primary" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Partial Load</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {formatInternalLoadNumber(order.internalLoadNumber, order.companyName || order.truckCompanyName)}
                            </div>
                          </TableCell>
                          <TableCell className="w-32 p-0">
                            <div className="h-full p-4">
                              {formatDateNoTimezone(order.pickupDate)}
                            </div>
                          </TableCell>
                          <TableCell className="w-40 p-0">
                            <div className="h-full p-4 line-clamp-2">
                              {order.pickupCity}
                              {order.pickupCity && order.pickupState ? ", " : ""}
                              {order.pickupState}
                            </div>
                          </TableCell>
                          <TableCell className="w-32 p-0">
                            <div className="h-full p-4">
                              {formatDateNoTimezone(order.deliveryDate)}
                            </div>
                          </TableCell>
                          <TableCell className="w-40 p-0">
                            <div className="h-full p-4 line-clamp-2">
                              {order.deliveryCity}
                              {order.deliveryCity && order.deliveryState ? ", " : ""}
                              {order.deliveryState}
                            </div>
                          </TableCell>
                          <TableCell className="w-16">
                            {order.mileage != null ? order.mileage.toLocaleString() : "0"}
                          </TableCell>
                          <TableCell className="w-36">
                            {(order as any).isPartial && (order as any).partialBrokers?.length > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="line-clamp-2 cursor-help">
                                      {(order as any).partialBrokers.find((b: string) => b) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBrokers.map((broker: string, idx: number) =>
                                        broker ? (
                                          <div key={idx}>
                                            Partial {idx + 1}: {broker}
                                          </div>
                                        ) : null,
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <div className="line-clamp-2">{order.brokerName}</div>
                            )}
                          </TableCell>
                          <TableCell className="w-28">
                            {(order as any).isPartial && (order as any).partialBrokerLoads?.length > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="cursor-help">
                                      {(order as any).partialBrokerLoads.find((n: string) => n) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBrokerLoads.map((loadNum: string, idx: number) =>
                                        loadNum ? (
                                          <div key={idx}>
                                            Partial {idx + 1}: {loadNum}
                                          </div>
                                        ) : null,
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <>{order.brokerLoadNumber}</>
                            )}
                          </TableCell>
                          <TableCell className="w-20">{order.invoiced ? "Yes" : "No"}</TableCell>
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
                          <TableCell className="w-24">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency((order as any).totalDriverPay)}
                            </div>
                          </TableCell>
                          <TableCell className="w-28">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(order.totalFreightAmount)}
                            </div>
                          </TableCell>
                          <TableCell className="w-28">
                            {(order as any).isPartial && (order as any).partialBookedByCompanies?.length > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="line-clamp-2 cursor-help">
                                      {(order as any).partialBookedByCompanies.find((c: string) => c) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBookedByCompanies.map((company: string, idx: number) =>
                                        company ? (
                                          <div key={idx}>
                                            Partial {idx + 1}: {company}
                                          </div>
                                        ) : null,
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <div className="line-clamp-2">{order.bookedByCompanyName}</div>
                            )}
                          </TableCell>
                          <TableCell className="w-24">
                            <div className="line-clamp-2">{order.bookedBy}</div>
                          </TableCell>
                          <TableCell className="w-24 text-center">
                            <div className="flex gap-1 flex-wrap justify-center">
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
                          <TableCell className="w-24 text-center">
                            <div className="flex gap-1 flex-wrap justify-center">
                              {(() => {
                                const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
                                const podCount = order.podFiles?.length || 0;
                                const isComplete = podCount >= deliveryCount;
                                
                                if (podCount > 0) {
                                  return (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`text-xs ${!isComplete ? 'border-warning text-warning' : ''}`}
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
                                      {deliveryCount > 1 ? `POD ${podCount}/${deliveryCount}` : (
                                        order.podFiles[0].file_name.length > 8
                                          ? order.podFiles[0].file_name.substring(0, 8) + "..."
                                          : order.podFiles[0].file_name
                                      )}
                                    </Button>
                                  );
                                } else {
                                  return (
                                    <Badge variant="destructive" className="text-xs">
                                      {deliveryCount > 1 ? `Missing 0/${deliveryCount}` : 'Missing'}
                                    </Badge>
                                  );
                                }
                              })()}
                            </div>
                          </TableCell>
                          <TableCell className="w-32 text-center">
                            <div className="flex gap-1 w-32 justify-center">
                              <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
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
                          {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && (
                            <TableCell className="w-20 text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={order.paid === true}
                                  onCheckedChange={() => {
                                    setPendingPaidOrder({ id: order.id, currentPaid: order.paid === true });
                                    setPaidConfirmDialogOpen(true);
                                  }}
                                  aria-label={`Mark load ${order.loadNumber} as ${order.paid ? 'unpaid' : 'paid'}`}
                                />
                              </div>
                            </TableCell>
                          )}
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

            {/* Background Loading Progress */}
            {!backgroundLoadingComplete && totalUnlockedCount !== null && loadedUnlockedCount < totalUnlockedCount && !isSearching && !debouncedSearchTerm && (
              <div className="flex items-center justify-center gap-4 px-6 py-4 border-t bg-muted/30">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading orders: {loadedUnlockedCount} of {totalUnlockedCount} unlocked orders
                </div>
              </div>
            )}

            {/* Server-side search indicator */}
            {isSearching && (
              <div className="flex items-center justify-center gap-2 px-6 py-4 border-t bg-muted/30">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Searching all orders...</span>
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

        {/* Selection Summary Panel */}
        {selectionMode && (
          <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[400px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Selected Loads</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setSelectionMode(false)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Count:</span>
                <span className="font-medium">{selectedOrderIds.size} loads</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Freight:</span>
                <span className="font-semibold text-primary">{formatCurrency(selectedTotalFreight)}</span>
              </div>
              
              {Object.keys(selectedByCompany).length > 0 && (
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-muted-foreground mb-1">By Company:</p>
                  {Object.entries(selectedByCompany).map(([company, data]: [string, { count: number; freight: number }]) => (
                    <div key={company} className="flex justify-between text-xs">
                      <span className="truncate max-w-[150px]">{company} ({data.count})</span>
                      <span>{formatCurrency(data.freight)}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {(hasRole("manager") || hasRole("admin") || hasRole("accounting") || hasRole("supervisor")) && (
                <Button
                  className="w-full mt-3"
                  size="sm"
                  onClick={bulkLockOrders}
                  disabled={selectedOrderIds.size === 0}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Lock Selected ({selectedOrders.filter(o => !o.locked).length})
                </Button>
              )}
            </div>
          </div>
        )}

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
                  <p className="text-sm text-muted-foreground">Load has been canceled or rescheduled</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowLegendDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Paid Confirmation Dialog */}
        <Dialog open={paidConfirmDialogOpen} onOpenChange={(open) => {
          setPaidConfirmDialogOpen(open);
          if (!open) setPendingPaidOrder(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Payment Status Change</DialogTitle>
              <DialogDescription>
                {pendingPaidOrder?.currentPaid 
                  ? "Are you sure you want to mark this load as unpaid?"
                  : "Are you sure you want to mark this load as paid?"
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setPaidConfirmDialogOpen(false);
                setPendingPaidOrder(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleConfirmPaidChange}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Lumper Missing Data Dialog */}
        <LumperMissingDataDialog
          open={!!lumperMissingDataDialog}
          onOpenChange={(open) => !open && setLumperMissingDataDialog(null)}
          driverId={lumperMissingDataDialog?.driverId || ""}
          driverName={lumperMissingDataDialog?.driverName || ""}
          filterOrderId={lumperMissingDataDialog?.orderId}
        />
        {/* Invoice Warnings Dialog */}
        <Dialog open={invoiceWarningDialogOpen} onOpenChange={setInvoiceWarningDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Invoice File Attachment Issues
              </DialogTitle>
              <DialogDescription>
                The following files could not be merged inline and were embedded as attachments instead.
                Open the PDF in Adobe Acrobat and look for the Attachments panel (paperclip icon) to access them.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {invoiceWarnings.map((warning, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-muted/50">
                  <div className="font-medium text-sm mb-2">Invoice: {warning.invoice}</div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {warning.files.map((file, fileIdx) => (
                      <li key={fileIdx} className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-secondary px-1.5 py-0.5 rounded">
                          {file.type}
                        </span>
                        <span className="truncate">{file.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setInvoiceWarningDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
export default Orders;
