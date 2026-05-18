import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Search, FileText, Edit, Loader2, Download, Lock, LockOpen, XCircle, Calculator, Undo2, Info, Layers, CalendarClock, CheckSquare, Square, ChevronDown, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import moneyStackIcon from "@/assets/money-stack.png";
import lumperReceiptIcon from "@/assets/lumper-receipt-icon.png";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
import { LumperMissingDataDialog } from "@/components/LumperMissingDataDialog";
import { useOrdersProgressive } from "@/hooks/useOrdersProgressive";
import { useCompanies } from "@/hooks/useCompanies";
import { useDrivers } from "@/hooks/useDrivers";
import { useTrucks } from "@/hooks/useTrucks";
import { useBrokers } from "@/hooks/useBrokers";
import { useOrdersSearch } from "@/hooks/useOrdersSearch";
import { useFilteredOrdersSearch } from "@/hooks/useFilteredOrdersSearch";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { generateInvoicePDF, InvoiceProgress, InvoiceWarning } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import { toast } from "sonner";
import { diagnoseLoadMiles } from "@/utils/diagnoseLoad";
import { formatInternalLoadNumber, getCompanySuffix } from "@/utils/formatInternalLoadNumber";
import { hasUpdateTracking } from "@/utils/orderChangeTracker";
import { useDebounce } from "@/hooks/useDebounce";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { z } from "zod";
import { useDragPan } from "@/hooks/useDragPan";
import { formatCurrency, formatDateNoTimezone } from "@/lib/utils";
// OrdersCacheStatus removed - now using direct database queries
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
  const {
    hasRole,
    getPrimaryRole,
    profile,
    roles
  } = useAuthContext();
  const {
    individualMode
  } = useIndividualMode();
  const primaryRole = getPrimaryRole();
  const queryClient = useQueryClient();
  // Fetch all user profiles for the "All Users" filter (not limited to current orders)
  const { data: allUserProfiles } = useQuery({
    queryKey: ["all-user-profiles-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  // Also fetch distinct booked_by values from orders so deleted users still appear in the filter
  const { data: allBookedByFromOrders } = useQuery({
    queryKey: ["all-booked-by-from-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_distinct_booked_by");
      if (error) throw error;
      return ((data || []) as Array<{ booked_by: string }>)
        .map((r) => r.booked_by)
        .filter(Boolean);
    },
    staleTime: 10 * 60 * 1000,
  });
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
      dateRange: dateRange ? {
        from: dateRange.from?.toISOString(),
        to: dateRange.to?.toISOString()
      } : undefined,
      pickupDateRange: pickupDateRange ? {
        from: pickupDateRange.from?.toISOString(),
        to: pickupDateRange.to?.toISOString()
      } : undefined,
      currentPage
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

  // Check if user has only dispatch role (afterhours, safety, and maintenance excluded from auto-filter)
  const isDispatchOnly = hasRole("dispatch") && !roles.includes("maintenance") && !hasRole("afterhours") && !hasRole("admin") && !hasRole("manager") && !hasRole("accounting") && !hasRole("supervisor") && !hasRole("safety");

  // For individual mode users OR dispatch-only users, pass their name and user_id to filter at the database level
  // This includes orders they booked AND orders for drivers assigned to them
  // Use null instead of undefined to prevent double fetch when profile loads
  const shouldFilterByUser = individualMode || isDispatchOnly;
  const orderFilterOptions = useMemo(() => shouldFilterByUser ? {
    bookedBy: profile?.full_name || null,
    dispatcherUserId: profile?.user_id || null
  } : {
    bookedBy: null,
    dispatcherUserId: null
  }, [shouldFilterByUser, profile?.full_name, profile?.user_id]);

  // Check if user can cancel orders (includes both dispatch and afterhours)
  const canCancelOrders = (hasRole("dispatch") || hasRole("afterhours")) && !hasRole("admin") && !hasRole("manager") && !hasRole("accounting") && !hasRole("supervisor");
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all-companies");
  const [truckCompanyFilter, setTruckCompanyFilter] = useState("all-truck-companies");
  // For dispatch-only users, auto-select themselves as the default filter
  const [bookedByFilter, setBookedByFilter] = useState(() => isDispatchOnly && profile?.full_name ? profile.full_name : "all-users");
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
    notes: ""
  });
  const [paidConfirmDialogOpen, setPaidConfirmDialogOpen] = useState(false);
  const [pendingPaidOrder, setPendingPaidOrder] = useState<{
    id: string;
    currentPaid: boolean;
  } | null>(null);
  const [invoicedConfirmDialogOpen, setInvoicedConfirmDialogOpen] = useState(false);
  const [pendingInvoicedOrder, setPendingInvoicedOrder] = useState<{
    id: string;
    currentInvoiced: boolean;
  } | null>(null);
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
  const {
    lumperRequests
  } = useLumperMissingRevisedRC();
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
              to: state.dateRange.to ? new Date(state.dateRange.to) : undefined
            });
          }
          if (state.pickupDateRange) {
            setPickupDateRange({
              from: state.pickupDateRange.from ? new Date(state.pickupDateRange.from) : undefined,
              to: state.pickupDateRange.to ? new Date(state.pickupDateRange.to) : undefined
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

  // For dispatch-only users, auto-set bookedByFilter to their name when profile loads
  useEffect(() => {
    if (isDispatchOnly && profile?.full_name && bookedByFilter === "all-users") {
      setBookedByFilter(profile.full_name);
    }
  }, [isDispatchOnly, profile?.full_name]);

  // Progressive loading hook - fetches pages directly from server
  const {
    data: currentPageOrdersFromHook,
    isLoading,
    isLoadingMore,
    isLoadingLocked,
    progress: loadingProgress,
    unlockedCount,
    lockedCount,
    totalCount: totalUnlockedCount,
    totalPages: serverTotalPages,
    totalLoaded,
    hasMore,
    currentPage: hookCurrentPage,
    isCurrentPageLoaded,
    requestPage,
    prefetchNextPage,
    loadedPages,
    isPartialData,
    updateOrderLocally,
  } = useOrdersProgressive({
    ...orderFilterOptions,
    currentPage,
  });

  // For error handling, use a stable reference
  const error = null; // Progressive hook handles errors internally

  // Server-side search hook - queries database directly when searching
  const {
    searchResults,
    isSearching,
    searchOrders,
    clearSearch
  } = useOrdersSearch();

  // Server-side filtered search hook - queries database with filter criteria
  const {
    orders: filteredServerOrders,
    totalCount: filteredTotalCount,
    isLoading: isFilteredLoading,
    hasMore: hasMoreFiltered,
    loadMore: loadMoreFiltered,
    search: searchFiltered,
    reset: resetFiltered,
  } = useFilteredOrdersSearch();

  // Debounce search term for server-side search
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Trigger server-side search when debounced term changes
  // No lastSearchedTerm optimization needed - debounce already handles rapid typing
  useEffect(() => {
    const term = (debouncedSearchTerm || "").trim();
    if (term.length >= 2) {
      console.log("[Orders] Triggering server-side search for:", term);
      searchOrders(term, orderFilterOptions);
    } else {
      clearSearch();
    }
  }, [debouncedSearchTerm, searchOrders, clearSearch, orderFilterOptions]);
  
  console.log("🟦 [Orders Page] Progressive loading:", {
    currentPageOrdersCount: currentPageOrdersFromHook?.length,
    isLoading,
    isLoadingLocked,
    phase: loadingProgress.phase,
    unlockedCount,
    lockedCount,
    isPartialData,
    isCurrentPageLoaded,
    currentPage,
    serverTotalPages,
    searchResultsCount: searchResults?.length,
    filteredServerOrdersCount: filteredServerOrders?.length,
  });

  // Log when orders data changes
  useEffect(() => {
    console.log("🔵 [Orders Page] Current page orders changed! Count:", currentPageOrdersFromHook?.length, "Page:", currentPage);
    if (currentPageOrdersFromHook && currentPageOrdersFromHook.length > 0) {
      console.log("🔵 [Orders Page] First order:", currentPageOrdersFromHook[0]);
      console.log("🔵 [Orders Page] Last order:", currentPageOrdersFromHook[currentPageOrdersFromHook.length - 1]);
    }
  }, [currentPageOrdersFromHook, currentPage]);
  
  const {
    data: companies
  } = useCompanies();

  const {
    data: drivers
  } = useDrivers();

  const {
    data: trucks
  } = useTrucks();

  const {
    data: brokers
  } = useBrokers();

  // Detect if any filter is active that requires server-side filtering
  const hasActiveFilter = useMemo(() => {
    return (
      (companyFilter && companyFilter !== "all-companies") ||
      (truckCompanyFilter && truckCompanyFilter !== "all-truck-companies") ||
      (bookedByFilter && bookedByFilter !== "all-booked-by" && bookedByFilter !== "all-users") ||
      (truckFilter && truckFilter !== "all-trucks") ||
      (driverFilter && driverFilter !== "all-drivers") ||
      (brokerFilter && brokerFilter !== "all-brokers") ||
      lockedNotInvoicedFilter ||
      invoicedFilter ||
      dateRange?.from ||
      pickupDateRange?.from
    );
  }, [companyFilter, truckCompanyFilter, bookedByFilter, truckFilter, driverFilter, brokerFilter, lockedNotInvoicedFilter, invoicedFilter, dateRange, pickupDateRange]);

  // Build filter object for server-side search
  const serverFilters = useMemo(() => {
    if (!hasActiveFilter) return null;
    
    // Find company ID from name
    const companyId = companyFilter !== "all-companies" 
      ? companies?.find(c => c.name === companyFilter)?.id 
      : undefined;
    
    // Map truck company name to its load-number suffix (e.g. "-UE", "-AP").
    // Filtering by load-number suffix instead of the driver's truck company.
    const loadNumberSuffix = truckCompanyFilter !== "all-truck-companies"
      ? getCompanySuffix(truckCompanyFilter) || undefined
      : undefined;
    
    // Map UI filter values (names/numbers) to stable IDs from canonical tables.
    // This avoids empty `{}` filters caused by partial order datasets / manual values.
    const truckId = truckFilter !== "all-trucks"
      ? trucks?.find(t => t.truck_number === truckFilter)?.id
      : undefined;

    const driverId = driverFilter !== "all-drivers"
      ? drivers?.find(d => d.name === driverFilter)?.id
      : undefined;

    const brokerId = brokerFilter !== "all-brokers"
      ? brokerFilter
      : undefined;

    // If a DB-backed filter is selected but we can't resolve its ID yet, don't query.
    // (Prevents calling search-orders with {} which returns unfiltered rows.)
    if (companyFilter !== "all-companies" && !companyId) return null;
    if (truckCompanyFilter !== "all-truck-companies" && !loadNumberSuffix) return null;
    if (truckFilter !== "all-trucks" && !truckId) return null;
    if (driverFilter !== "all-drivers" && !driverId) return null;
    if (brokerFilter !== "all-brokers" && !brokerId) return null;
    
    // Helper to format date without timezone conversion - extracts local date parts
    const formatDateNoTz = (date: Date, endOfDay = false): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const time = endOfDay ? '23:59:59' : '00:00:00';
      return `${year}-${month}-${day} ${time}`;
    };
    
    return {
      companyId,
      loadNumberSuffix,
      bookedBy: bookedByFilter !== "all-booked-by" && bookedByFilter !== "all-users" ? bookedByFilter : undefined,
      truckId,
      driverId,
      brokerId,
      lockedNotInvoiced: lockedNotInvoicedFilter || undefined,
      invoiced: invoicedFilter || undefined,
      deliveryDateFrom: dateRange?.from ? formatDateNoTz(dateRange.from) : undefined,
      deliveryDateTo: dateRange?.to ? formatDateNoTz(dateRange.to, true) : undefined,
      pickupDateFrom: pickupDateRange?.from ? formatDateNoTz(pickupDateRange.from) : undefined,
      pickupDateTo: pickupDateRange?.to ? formatDateNoTz(pickupDateRange.to, true) : undefined,
    };
  }, [hasActiveFilter, companyFilter, truckCompanyFilter, bookedByFilter, truckFilter, driverFilter, brokerFilter, lockedNotInvoicedFilter, invoicedFilter, dateRange, pickupDateRange, companies, trucks, drivers, brokers]);

  // Trigger server-side filtered search when filters change
  const debouncedServerFilters = useDebounce(serverFilters, 400);
  
  useEffect(() => {
    if (debouncedServerFilters) {
      console.log("[Orders] Triggering server-side filtered search:", debouncedServerFilters);
      searchFiltered(debouncedServerFilters);
    } else {
      resetFiltered();
    }
  }, [debouncedServerFilters, searchFiltered, resetFiltered]);

  // Data source selection:
  // 1. Active search → use search results
  // 2. Active filter → use server-side filtered results (sorted: unlocked first)
  // 3. No filters → use current page orders from hook (already just this page)
  // cacheVersion bumped after optimistic paid/invoiced patches to force re-render
  // (search/filter hooks use non-reactive getQueryData reads)
  const [cacheVersion, setCacheVersion] = useState(0);

  const dataSource = useMemo(() => {
    const isActiveSearch = searchTerm && searchTerm.trim().length >= 2;
    if (isActiveSearch) {
      // LOCKED into server mode - never fall back to local orders during active search
      const results = searchResults || [];
      // Sort unlocked orders first
      return [...results].sort((a, b) => {
        if (a.locked === b.locked) return 0;
        return a.locked ? 1 : -1;
      });
    }
    
    // When filters are active, ONLY show server-side filtered results.
    // (Never show unfiltered local orders, even while loading.)
    if (hasActiveFilter) {
      const results = filteredServerOrders || [];
      // Sort unlocked orders first when filters are active
      return [...results].sort((a, b) => {
        if (a.locked === b.locked) return 0;
        return a.locked ? 1 : -1;
      });
    }
    
    return currentPageOrdersFromHook || [];
  }, [searchTerm, searchResults, currentPageOrdersFromHook, hasActiveFilter, filteredServerOrders, isFilteredLoading, cacheVersion]);

  // Filter orders based on search term and filters
  // When server-side filtering is active, skip most client-side filters
  const filteredOrders = dataSource?.filter(order => {
    const isServerSearch = searchTerm && searchTerm.trim().length >= 2;
    const isServerFiltered = hasActiveFilter && filteredServerOrders && filteredServerOrders.length > 0;
    
    // Client-side search filter (only when not using server search)
    let matchesSearch = true;
    if (!isServerSearch && searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const formattedInternalLoadNumber = order.internalLoadNumber ? formatInternalLoadNumber(order.internalLoadNumber, order.truckCompanyName) : "";
      matchesSearch = (order.internalLoadNumber?.toString() || "").toLowerCase().includes(searchLower) || formattedInternalLoadNumber.toLowerCase().includes(searchLower) || (order.loadNumber?.toString() || "").toLowerCase().includes(searchLower) || (order.truckNumber?.toString() || "").toLowerCase().includes(searchLower) || (order.driverName?.toLowerCase() || "").includes(searchLower) || (order.brokerName?.toLowerCase() || "").includes(searchLower) || (order.brokerLoadNumber?.toString() || "").toLowerCase().includes(searchLower);
    }
    
    // Skip most client-side filters when server-side filtering is active
    if (isServerFiltered) {
      // Only apply missingDocsFilter client-side since it requires file analysis
      let matchesMissingDocs = true;
      if (missingDocsFilter !== "all") {
        if (missingDocsFilter === "missing-rc") {
          matchesMissingDocs = order.rcFiles?.length === 0;
        } else if (missingDocsFilter === "missing-bol") {
          matchesMissingDocs = order.bolFiles?.length === 0;
        } else if (missingDocsFilter === "missing-pod") {
          const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
          const podCount = order.podFiles?.length || 0;
          matchesMissingDocs = podCount < deliveryCount;
        } else if (missingDocsFilter === "complete") {
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
      return matchesSearch && matchesMissingDocs;
    }
    
    // Full client-side filtering when server-side is not active
    const matchesCompany = !companyFilter || companyFilter === "all-companies" || order.bookedByCompanyName === companyFilter;
    const matchesTruckCompany = (() => {
      if (!truckCompanyFilter || truckCompanyFilter === "all-truck-companies") return true;
      const suffix = getCompanySuffix(truckCompanyFilter);
      if (!suffix) return false;
      const iln = order.internalLoadNumber ? String(order.internalLoadNumber) : "";
      return iln.toUpperCase().endsWith(`-${suffix}`);
    })();
    const matchesBookedBy = !bookedByFilter || bookedByFilter === "all-booked-by" || bookedByFilter === "all-users" || order.bookedBy === bookedByFilter;
    const matchesTruck = !truckFilter || truckFilter === "all-trucks" || order.truckNumber === truckFilter;
    const matchesDriver = !driverFilter || driverFilter === "all-drivers" || order.driverName === driverFilter;
    const matchesBroker = !brokerFilter || brokerFilter === "all-brokers" || order.brokerId === brokerFilter;
    
    let matchesMissingDocs = true;
    if (missingDocsFilter !== "all") {
      if (missingDocsFilter === "missing-rc") {
        matchesMissingDocs = order.rcFiles?.length === 0;
      } else if (missingDocsFilter === "missing-bol") {
        matchesMissingDocs = order.bolFiles?.length === 0;
      } else if (missingDocsFilter === "missing-pod") {
        const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
        const podCount = order.podFiles?.length || 0;
        matchesMissingDocs = podCount < deliveryCount;
      } else if (missingDocsFilter === "complete") {
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

    // Date filtering based on delivery date
    let matchesDate = true;
    if (dateRange?.from && order.deliveryDate) {
      let dateStr = order.deliveryDate.split(" - ")[0];
      if (dateStr.includes(' ') && !dateStr.includes('T')) {
        dateStr = dateStr.replace(' ', 'T');
      }
      const datePart = dateStr.split('T')[0];
      if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = datePart.split('-').map(Number);
        const orderDateOnly = new Date(year, month - 1, day);
        if (dateRange.to) {
          const fromDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
          const toDateOnly = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
          matchesDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
        } else {
          const selectedDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
          matchesDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
        }
      } else {
        matchesDate = false;
      }
    }

    // Date filtering based on pickup date
    let matchesPickupDate = true;
    if (pickupDateRange?.from && order.pickupDate) {
      let dateStr = order.pickupDate.split(" - ")[0];
      if (dateStr.includes(' ') && !dateStr.includes('T')) {
        dateStr = dateStr.replace(' ', 'T');
      }
      const datePart = dateStr.split('T')[0];
      if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = datePart.split('-').map(Number);
        const orderDateOnly = new Date(year, month - 1, day);
        if (pickupDateRange.to) {
          const fromDateOnly = new Date(pickupDateRange.from.getFullYear(), pickupDateRange.from.getMonth(), pickupDateRange.from.getDate());
          const toDateOnly = new Date(pickupDateRange.to.getFullYear(), pickupDateRange.to.getMonth(), pickupDateRange.to.getDate());
          matchesPickupDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
        } else {
          const selectedDateOnly = new Date(pickupDateRange.from.getFullYear(), pickupDateRange.from.getMonth(), pickupDateRange.from.getDate());
          matchesPickupDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
        }
      } else {
        matchesPickupDate = false;
      }
    }

    const matchesLockedNotInvoiced = !lockedNotInvoicedFilter || order.locked && !order.invoiced && (order.totalFreightAmount || 0) > 0;
    const matchesInvoiced = !invoicedFilter || order.invoiced === true;
    
    return matchesSearch && matchesCompany && matchesTruckCompany && matchesBookedBy && matchesTruck && matchesDriver && matchesBroker && matchesMissingDocs && matchesDate && matchesPickupDate && matchesLockedNotInvoiced && matchesInvoiced;
  }) || [];

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, companyFilter, truckCompanyFilter, bookedByFilter, truckFilter, driverFilter, brokerFilter, missingDocsFilter, dateRange, pickupDateRange, lockedNotInvoicedFilter, invoicedFilter]);

  // Clear selection when filters change or selection mode is toggled off
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [selectionMode, searchTerm, companyFilter, truckCompanyFilter, bookedByFilter, truckFilter, driverFilter, brokerFilter, missingDocsFilter, dateRange, pickupDateRange, lockedNotInvoicedFilter, invoicedFilter]);

  // Note: Server-side filtering is now handled by useFilteredOrdersSearch
  // The old client-side filter loading logic has been replaced

  // Phase 2 (progressive archived loading) removed.

  // Prefetch next page when user navigates - fetches page directly from server
  // MUST be before any early returns to satisfy React's rules of hooks
  useEffect(() => {
    // Only trigger for local data (not server-filtered or searched)
    if (hasActiveFilter || (searchTerm && searchTerm.trim().length >= 2)) return;
    
    // Prefetch the next page in background for smooth navigation
    prefetchNextPage(currentPage);
  }, [currentPage, hasActiveFilter, searchTerm, prefetchNextPage]);

  // Request current page data if not already loaded
  useEffect(() => {
    // Only trigger for local data (not server-filtered or searched)
    const isActiveSearch = searchTerm && searchTerm.trim().length >= 2;
    if (hasActiveFilter || isActiveSearch) return;

    // Wait until the progressive hook has real counts; otherwise page 1 can be cached as empty.
    if (isLoading) return;
    if ((totalUnlockedCount ?? 0) <= 0) return;
    if (isLoadingMore) return;
    
    // Check if current page is loaded
    if (!loadedPages.has(currentPage)) {
      console.log(`[Orders] Requesting page ${currentPage}...`);
      requestPage(currentPage).catch(err => 
        console.error(`[Orders] Failed to load page ${currentPage}:`, err)
      );
    }
  }, [currentPage, loadedPages, hasActiveFilter, searchTerm, isLoading, totalUnlockedCount, isLoadingMore, requestPage]);
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
      acc[company] = {
        count: 0,
        freight: 0
      };
    }
    acc[company].count += 1;
    acc[company].freight += order.totalFreightAmount || 0;
    return acc;
  }, {} as Record<string, {
    count: number;
    freight: number;
  }>);

  // Bulk lock selected orders
  const bulkLockOrders = async () => {
    if (primaryRole === 'manager' || primaryRole === 'supervisor') {
      toast.error("Managers and supervisors cannot change lock status");
      return;
    }
    if (selectedOrderIds.size === 0) return;
    const unlocked = selectedOrders.filter(o => !o.locked);
    if (unlocked.length === 0) {
      toast.info("All selected loads are already locked");
      return;
    }
    try {
      const {
        error
      } = await supabase.from("orders").update({
        locked: true
      }).in("id", unlocked.map(o => o.id));
      if (error) throw error;
      toast.success(`Locked ${unlocked.length} loads successfully`);
      // Real-time subscription will update the cache automatically
      setSelectedOrderIds(new Set());
      setSelectionMode(false);

      // No cache update needed - data will be refreshed via React Query
    } catch (error) {
      console.error("Error bulk locking orders:", error);
      toast.error("Failed to lock selected loads");
    }
  };

  // Early returns after all hooks
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-lg border">
          <div className="h-12 bg-muted animate-pulse rounded-t-lg" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="flex items-center gap-4 p-4 border-t">
              <div className="h-6 w-6 bg-muted animate-pulse rounded" />
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              <div className="h-6 w-48 bg-muted animate-pulse rounded flex-1" />
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            </div>)}
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading loads: {error.message}</p>
        </div>
      </div>;
  }

  // Calculate pagination based on total count from server
  // For search/filter modes: use filtered results count
  // For normal mode: use server's total count (all unlocked orders)
  const isActiveSearch = searchTerm && searchTerm.trim().length >= 2;
  const effectiveTotalCount = !hasActiveFilter && !isActiveSearch && totalUnlockedCount 
    ? totalUnlockedCount 
    : filteredOrders.length;
  const totalPages = !hasActiveFilter && !isActiveSearch && serverTotalPages 
    ? serverTotalPages 
    : Math.ceil(effectiveTotalCount / ORDERS_PER_PAGE);
  
  // For search/filter: use slice. For normal mode: data is already the current page
  const paginatedOrders = (hasActiveFilter || isActiveSearch) 
    ? filteredOrders.slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE)
    : filteredOrders; // Already contains just the current page's data

  // Filter option sources (canonical tables → stable IDs for server-side filtering)
  const uniqueCompanies = (companies || []).map((c: any) => c.name).filter(Boolean).sort();
  const uniqueTruckCompanies = (companies || []).map((c: any) => c.name).filter(Boolean).sort();
  

  const uniqueBookedBy = (() => {
    const seen = new Set<string>();
    const items: { value: string; label: string }[] = [];
    for (const p of allUserProfiles || []) {
      const value = (p.full_name?.trim() || p.email || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      items.push({ value, label: value });
    }
    // Merge in historical booked_by names (e.g. deleted users) so they remain searchable
    for (const name of allBookedByFromOrders || []) {
      const value = (name || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      items.push({ value, label: value });
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  })();
  const uniqueTrucks = (trucks || []).map((t: any) => t.truck_number).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, undefined, {
    numeric: true
  }));
  const uniqueDrivers = (drivers || []).map((d: any) => d.name).filter(Boolean).sort();
  const uniqueBrokerOptions = (brokers || [])
    .filter((b: any) => b.name)
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
    .map((b: any) => ({
      value: b.id,
      label: b.mc_number ? `${b.name} (MC: ${b.mc_number})` : b.name,
      searchText: `${b.name} ${b.mc_number || ""}`.toLowerCase(),
    }));
  const exportToExcel = () => {
    if (!filteredOrders.length) return;
    const exportData = filteredOrders.map(order => ({
      "Truck #": order.truckNumber,
      "Load #": formatInternalLoadNumber(order.internalLoadNumber, order.companyName || order.truckCompanyName),
      "Pickup Date": order.pickupDate,
      "Pickup City": order.pickupCity,
      "Pickup State": order.pickupState,
      "Delivery Date": order.deliveryDate,
      "Delivery City": order.deliveryCity,
      "Delivery State": order.deliveryState,
      Miles: order.mileage,
      ...(primaryRole !== 'dispatch' ? { "Driver Pay": (order as any).totalDriverPay } : {}),
      Driver: order.driverName,
      "Broker Name": order.brokerName,
      "Broker Load #": order.brokerLoadNumber,
      Invoiced: order.invoiced,
      "Total Freight": order.totalFreightAmount,
      Notes: order.notes,
      Company: (order as any).driverCompanyName || order.companyName,
      "Booked By": order.bookedBy
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `orders_${new Date().toISOString().split("T")[0]}.xlsx`);
  };
  const toggleOrderLock = async (orderId: string, currentLockStatus: boolean) => {
    if (primaryRole === 'manager' || primaryRole === 'supervisor') {
      toast.error("Managers and supervisors cannot change lock status");
      return;
    }
    try {
      // When unlocking, also set invoiced to false and clear invoiced_at
      const updateData = currentLockStatus ? {
        locked: false,
        invoiced: false,
        invoiced_at: null
      } : {
        locked: true
      };
      const {
        error
      } = await supabase.from("orders").update(updateData).eq("id", orderId);
      if (error) throw error;

      // Show success immediately - real-time subscription will update cache
      toast.success(`Load ${!currentLockStatus ? "locked" : "unlocked"} successfully`);

      // No cache update needed - data will be refreshed via React Query
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
        toast.success(`Recalculated: ${result.currentMiles} → ${result.calculatedMiles} miles (diff: ${result.difference})`);
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
    const ordersToInvoice = selectionMode && selectedOrderIds.size > 0 ? filteredOrders.filter(order => selectedOrderIds.has(order.id)) : filteredOrders;
    if (!ordersToInvoice.length) return;
    try {
      setInvoiceProgress({
        current: 0,
        total: ordersToInvoice.length,
        phase: 'preparing',
        message: 'Preparing invoices...'
      });
      const result = await generateInvoicePDF(ordersToInvoice, progress => {
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
        const {
          error
        } = await supabase.from("orders").update({
          invoiced: true,
          locked: true,
          invoiced_at: new Date().toISOString()
        }).in("id", result.orderIds);
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
    tonu: z.string().min(1, "TONU is required").transform(val => parseFloat(val)),
    driverRate: z.string().min(1, "Driver rate is required").transform(val => parseFloat(val)),
    dhMiles: z.string().min(1, "DH miles is required").transform(val => parseInt(val)),
    notes: z.string().min(1, "Notes are required")
  });
  const openCancelDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCancelFormData({
      tonu: "",
      driverRate: "",
      dhMiles: "",
      notes: ""
    });
    setCancelDialogOpen(true);
  };
  const handleCancelOrder = async () => {
    if (!selectedOrderId) return;
    try {
      // Validate inputs
      const validated = cancelSchema.parse(cancelFormData);

      // First, get current order values to backup
      const {
        data: currentOrder,
        error: fetchError
      } = await supabase.from("orders").select("freight_amount, driver_price, loaded_miles, dh_miles, tonu, tonu_driver, notes").eq("id", selectedOrderId).single();
      if (fetchError) throw fetchError;

      // Get current user
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();

      // Save backup of original values
      const {
        error: backupError
      } = await supabase.from("canceled_orders_backup").insert({
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
        cancel_notes: validated.notes
      });
      if (backupError) throw backupError;

      // Update order with cancel values
      const {
        error
      } = await supabase.from("orders").update({
        tonu: validated.tonu,
        tonu_driver: validated.driverRate,
        dh_miles: validated.dhMiles,
        notes: validated.notes,
        freight_amount: 0,
        driver_price: 0,
        loaded_miles: 0,
        mileage: validated.dhMiles,
        // For canceled loads: loaded_miles (0) + dh_miles
        canceled: true
      }).eq("id", selectedOrderId);
      if (error) throw error;
      toast.success("Load cancelled successfully");
      setCancelDialogOpen(false);
      setSelectedOrderId(null);
      setCancelFormData({
        tonu: "",
        driverRate: "",
        dhMiles: "",
        notes: ""
      });
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
      const {
        data: backup,
        error: fetchError
      } = await supabase.from("canceled_orders_backup").select("*").eq("order_id", orderId).order("canceled_at", {
        ascending: false
      }).limit(1).maybeSingle();
      if (fetchError) throw fetchError;
      if (!backup) {
        toast.error("No backup found for this order - reverting with current values");
        // Just uncancel without restoring original values
        const {
          error: updateError
        } = await supabase.from("orders").update({
          canceled: false
        }).eq("id", orderId);
        if (updateError) throw updateError;
        toast.success("Load uncanceled");
        // Real-time subscription will update the cache
        return;
      }

      // Restore original values - recalculate mileage from loaded + dh miles
      const restoredMileage = (backup.original_loaded_miles || 0) + (backup.original_dh_miles || 0);
      const {
        error: updateError
      } = await supabase.from("orders").update({
        freight_amount: backup.original_freight_amount,
        driver_price: backup.original_driver_price,
        loaded_miles: backup.original_loaded_miles,
        dh_miles: backup.original_dh_miles,
        mileage: restoredMileage,
        tonu: backup.original_tonu,
        tonu_driver: backup.original_tonu_driver,
        notes: backup.original_notes,
        canceled: false
      }).eq("id", orderId);
      if (updateError) throw updateError;

      // Delete the backup record
      const {
        error: deleteError
      } = await supabase.from("canceled_orders_backup").delete().eq("id", backup.id);
      if (deleteError) console.error("Error deleting backup:", deleteError);
      toast.success("Load cancellation reverted successfully");
      // Real-time subscription will update the cache
    } catch (error) {
      console.error("Error reverting cancellation:", error);
      toast.error("Failed to revert cancellation");
    }
  };
  const handleConfirmPaidChange = async () => {
    if (primaryRole === 'manager' || primaryRole === 'supervisor') {
      toast.error("Managers and supervisors cannot change paid status");
      setPaidConfirmDialogOpen(false);
      setPendingPaidOrder(null);
      return;
    }
    if (!pendingPaidOrder) return;
    try {
      const newPaidStatus = !pendingPaidOrder.currentPaid;
      const {
        error
      } = await supabase.from("orders").update({
        paid: newPaidStatus
      }).eq("id", pendingPaidOrder.id);
      if (error) throw error;
      toast.success(`Load marked as ${newPaidStatus ? 'paid' : 'unpaid'}`);
      // Patch ALL order-related caches (progressive, search, filtered)
      const allCaches = queryClient.getQueryCache().findAll({ queryKey: ["orders"], exact: false });
      for (const cache of allCaches) {
        queryClient.setQueryData(cache.queryKey, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((o: any) => o.id === pendingPaidOrder.id ? { ...o, paid: newPaidStatus } : o);
        });
      }
      // Also patch the progressive ref-based cache
      if (updateOrderLocally) {
        updateOrderLocally(pendingPaidOrder.id, { paid: newPaidStatus });
      }
      // Force re-render for non-reactive search/filter hooks
      setCacheVersion(v => v + 1);
    } catch (error) {
      console.error("Error updating paid status:", error);
      toast.error("Failed to update paid status");
    } finally {
      setPaidConfirmDialogOpen(false);
      setPendingPaidOrder(null);
    }
  };
  const handleConfirmInvoicedChange = async () => {
    if (primaryRole === 'manager' || primaryRole === 'supervisor') {
      toast.error("Managers and supervisors cannot change invoiced status");
      setInvoicedConfirmDialogOpen(false);
      setPendingInvoicedOrder(null);
      return;
    }
    if (!pendingInvoicedOrder) return;
    try {
      const newInvoicedStatus = !pendingInvoicedOrder.currentInvoiced;
      const { error } = await supabase.from("orders").update({
        invoiced: newInvoicedStatus
      }).eq("id", pendingInvoicedOrder.id);
      if (error) throw error;
      toast.success(`Load marked as ${newInvoicedStatus ? 'invoiced' : 'not invoiced'}`);
      const allCaches = queryClient.getQueryCache().findAll({ queryKey: ["orders"], exact: false });
      for (const cache of allCaches) {
        queryClient.setQueryData(cache.queryKey, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((o: any) => o.id === pendingInvoicedOrder.id ? { ...o, invoiced: newInvoicedStatus } : o);
        });
      }
      if (updateOrderLocally) {
        updateOrderLocally(pendingInvoicedOrder.id, { invoiced: newInvoicedStatus });
      }
      setCacheVersion(v => v + 1);
    } catch (error) {
      console.error("Error updating invoiced status:", error);
      toast.error("Failed to update invoiced status");
    } finally {
      setInvoicedConfirmDialogOpen(false);
      setPendingInvoicedOrder(null);
    }
  };
  return <div className="h-full w-full">
      <div className="space-y-4 md:space-y-6 p-4 md:p-6 max-w-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Loads</h1>
          <div className="flex flex-wrap gap-2">
            {(primaryRole === "admin" || primaryRole === "accounting" || primaryRole === "manager") && <>
                <Button variant="outline" onClick={exportToExcel} disabled={!filteredOrders.length} className="text-xs md:text-sm">
                  <Download className="mr-1 md:mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Export to Excel</span>
                  <span className="sm:hidden">Export</span>
                </Button>
                <Button variant="outline" onClick={generateInvoices} disabled={invoiceProgress !== null || (selectionMode ? selectedOrderIds.size === 0 : !filteredOrders.length)} className="text-xs md:text-sm">
                  {invoiceProgress ? <Loader2 className="mr-1 md:mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-1 md:mr-2 h-4 w-4" />}
                  {selectionMode && selectedOrderIds.size > 0 ? `INVOICE (${selectedOrderIds.size})` : 'INVOICE'}
                </Button>
                {invoiceProgress && <div className="flex items-center gap-2 min-w-[200px]">
                    <Progress value={invoiceProgress.current / invoiceProgress.total * 100} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {invoiceProgress.current}/{invoiceProgress.total}
                    </span>
                  </div>}
              </>}
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
              <div className="flex flex-col items-start gap-1">
                <CardTitle className="shrink-0">All Loads</CardTitle>
                {isFilteredLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </div>
                )}
                {hasActiveFilter && filteredServerOrders.length > 0 && !isFilteredLoading && (
                  <Badge variant="secondary">
                    {filteredTotalCount !== null ? `${filteredServerOrders.length} of ${filteredTotalCount}` : filteredServerOrders.length} filtered
                  </Badge>
                )}
              </div>

              <ScrollArea className="w-full">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4 pb-4">
                  {/* Column 1: Search - spans 2 rows on large screens */}
                  <div className="col-span-2 sm:col-span-1 lg:row-span-2 flex items-center">
                    <div className="relative w-full">
                      {isSearching ? <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-primary h-4 w-4 animate-spin" /> : <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />}
                      <Input placeholder="Search all loads..." className="pl-10 w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                  </div>

                  {/* Column 2 Row 1: Pickup Date */}
                  <DateRangePicker date={pickupDateRange} onDateChange={setPickupDateRange} placeholder="Filter by pickup date" className="w-full" />

                  {/* Column 3 Row 1: Trucks */}
                  <Combobox value={truckFilter} onValueChange={setTruckFilter} placeholder="All Trucks" searchPlaceholder="Search trucks..." options={[{
                  value: "all-trucks",
                  label: "All Trucks"
                }, ...uniqueTrucks.map(truck => ({
                  value: truck,
                  label: truck
                }))]} className="w-full" />

                  {/* Column 4 Row 1: Companies */}
                  <Combobox value={companyFilter} onValueChange={setCompanyFilter} placeholder="All Companies" searchPlaceholder="Search companies..." options={[{
                  value: "all-companies",
                  label: "All Companies"
                }, ...uniqueCompanies.map(company => ({
                  value: company,
                  label: company
                }))]} className="w-full" />

                  {/* Column 5 Row 1: Users - hidden for dispatch-only users */}
                  {!isDispatchOnly && <Combobox value={bookedByFilter} onValueChange={setBookedByFilter} placeholder="All Users" searchPlaceholder="Search users..." options={[{
                  value: "all-users",
                  label: "All Users"
                }, ...uniqueBookedBy]} className="w-full" />}

                  {/* Column 6 Row 1: Missing Docs Filter */}
                  <Combobox value={missingDocsFilter} onValueChange={setMissingDocsFilter} placeholder="All Orders" searchPlaceholder="Search status..." options={[{
                  value: "all",
                  label: "All Orders"
                }, {
                  value: "updated",
                  label: "Updated Orders"
                }, {
                  value: "complete",
                  label: "Complete (RC + POD)"
                }, {
                  value: "missing-rc",
                  label: "Missing RC"
                }, {
                  value: "missing-bol",
                  label: "Missing BOL"
                }, {
                  value: "missing-pod",
                  label: "Missing POD"
                }, {
                  value: "canceled",
                  label: "Canceled Loads"
                }, {
                  value: "pending-payment",
                  label: "Pending Payment"
                }, {
                  value: "billed",
                  label: "Billed Loads"
                }]} className="w-full" />

                  {/* Column 2 Row 2: Delivery Date */}
                  <DateRangePicker date={dateRange} onDateChange={setDateRange} placeholder="Filter by delivery date" className="w-full" />

                  {/* Column 3 Row 2: Drivers */}
                  <Combobox value={driverFilter} onValueChange={setDriverFilter} placeholder="All Drivers" searchPlaceholder="Search drivers..." options={[{
                  value: "all-drivers",
                  label: "All Drivers"
                }, ...uniqueDrivers.map(driver => ({
                  value: driver,
                  label: driver
                }))]} className="w-full" />

                  {/* Column 4 Row 2: Truck Companies */}
                  <Combobox value={truckCompanyFilter} onValueChange={setTruckCompanyFilter} placeholder="All Truck Companies" searchPlaceholder="Search truck companies..." options={[{
                  value: "all-truck-companies",
                  label: "All Truck Companies"
                }, ...uniqueTruckCompanies.map(company => ({
                  value: company,
                  label: company
                }))]} className="w-full" />

                  {/* Column 5 Row 2: Brokers */}
                  <Combobox value={brokerFilter} onValueChange={setBrokerFilter} placeholder="All Brokers" searchPlaceholder="Search by name or MC#..." options={[{
                  value: "all-brokers",
                  label: "All Brokers"
                }, ...uniqueBrokerOptions]} className="w-full" />

                  {/* Column 6 Row 2: Show Invoiced - hidden for dispatch/afterhours */}
                  {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && <div className="flex flex-col gap-1">
                    <Button variant={invoicedFilter ? "default" : "outline"} onClick={() => setInvoicedFilter(!invoicedFilter)} className="w-full">
                      <FileText className="mr-2 h-3.5 w-3.5 shrink-0" />
                      {invoicedFilter ? "Hide Invoiced" : "Show Invoiced"}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-xs text-muted-foreground text-center hover:text-foreground hover:underline cursor-pointer transition-colors w-full">
                          Not Invoiced: {formatCurrency(filteredOrders?.filter(o => o.invoiced !== true).reduce((sum, o) => sum + (o.totalFreightAmount || 0), 0) || 0)}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-4" align="center">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Not Invoiced by Company</h4>
                          <div className="space-y-2">
                            {(() => {
                            const notInvoicedOrders = filteredOrders?.filter(o => o.invoiced !== true) || [];
                            const byCompany = notInvoicedOrders.reduce((acc, order) => {
                              const company = order.bookedByCompanyName || 'Unknown';
                              if (!acc[company]) {
                                acc[company] = {
                                  count: 0,
                                  freight: 0
                                };
                              }
                              acc[company].count += 1;
                              acc[company].freight += order.totalFreightAmount || 0;
                              return acc;
                            }, {} as Record<string, {
                              count: number;
                              freight: number;
                            }>);
                            return (Object.entries(byCompany) as [string, {
                              count: number;
                              freight: number;
                            }][]).sort((a, b) => b[1].freight - a[1].freight).map(([company, data]) => <div key={company} className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{company}</span>
                                    <div className="text-right">
                                      <span className="font-medium">{formatCurrency(data.freight)}</span>
                                      <span className="text-muted-foreground ml-2">({data.count})</span>
                                    </div>
                                  </div>);
                          })()}
                          </div>
                          <div className="border-t pt-2 flex justify-between items-center text-sm font-medium">
                            <span>Total</span>
                            <span>{formatCurrency(filteredOrders?.filter(o => o.invoiced !== true).reduce((sum, o) => sum + (o.totalFreightAmount || 0), 0) || 0)}</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>}
                </div>
              </ScrollArea>
            </div>
          </CardHeader>
          {/* Cache status removed - now using direct database queries */}
          <CardContent className="p-0">
            <div className="p-2 md:p-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px] min-w-[60px] max-w-[60px]">
                      {selectionMode ? <Checkbox checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length} onCheckedChange={toggleSelectAll} aria-label="Select all" /> : <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectionMode(true)} title="Enable selection mode">
                          <Square className="h-4 w-4" />
                        </Button>}
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
                    {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && <TableHead className="w-[70px] min-w-[70px] max-w-[70px] whitespace-nowrap">Invoiced</TableHead>}
                    <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Notes</TableHead>
                    {primaryRole !== 'dispatch' && <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap">Driver Pay</TableHead>}
                    <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Freight Amt</TableHead>
                    <TableHead className="w-[100px] min-w-[100px] max-w-[100px] whitespace-nowrap">Company</TableHead>
                    <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap">Booked By</TableHead>
                    <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap text-center">RC</TableHead>
                    <TableHead className="w-[90px] min-w-[90px] max-w-[90px] whitespace-nowrap text-center">POD</TableHead>
                    <TableHead className="w-[160px] min-w-[160px] max-w-[160px] whitespace-nowrap text-center">Actions</TableHead>
                    {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && <TableHead className="w-[80px] min-w-[80px] max-w-[80px] whitespace-nowrap text-center">Paid</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? <TableRow>
                      <TableCell colSpan={primaryRole === 'dispatch' || primaryRole === 'afterhours' ? 19 : 21} className="text-center py-8 text-muted-foreground">
                        No orders found
                      </TableCell>
                    </TableRow> : paginatedOrders.map((order, index) => {
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
                  const hasOrangeCondition = order.canceled || (order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "";
                  const isEvenRow = index % 2 === 1;
                  const alternatingBg = isEvenRow ? "bg-muted/50 hover:bg-muted/50 dark:bg-muted/30 dark:hover:bg-muted/30" : "bg-background hover:bg-background";

                  // Yellow (hue ~50) for lumper/escort, Orange (hue ~25) for canceled/date changed
                  // Lumper/Escort takes priority over additional/reduced pay for yellow background
                  const rowClassName = isRecovery ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_90%)] dark:hover:bg-[hsl(270_50%_25%)]" : hasLumperOrEscort ? "bg-[hsl(50_95%_88%)] dark:bg-[hsl(50_75%_25%)] hover:bg-[hsl(50_95%_88%)] dark:hover:bg-[hsl(50_75%_25%)]" : hasReducedPay ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_90%)] dark:hover:bg-[hsl(0_62%_25%)]" : hasAdditionalPay ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_90%)] dark:hover:bg-[hsl(120_40%_25%)]" : hasOrangeCondition ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_90%)] dark:hover:bg-[hsl(25_75%_30%)]" : alternatingBg;
                  return <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                          <TableCell className="w-12 px-1">
                            <div className="flex items-center gap-0">
                              {selectionMode && <Checkbox checked={selectedOrderIds.has(order.id)} onCheckedChange={() => toggleOrderSelection(order.id)} className="mr-1" aria-label={`Select load ${order.loadNumber}`} />}
                              {/* Canceled icon */}
                              {isCanceled && <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-lg leading-none cursor-default">🚫</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Canceled</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>}
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
                          const freightItems: {
                            label: string;
                            value: number;
                          }[] = [];
                          const driverItems: {
                            label: string;
                            value: number;
                          }[] = [];

                          // Build freight items - late fee, no tracking, wrong address, other charges are deductions (negative)
                          if (detention !== 0) freightItems.push({
                            label: "Detention",
                            value: detention
                          });
                          if (layover !== 0) freightItems.push({
                            label: "Layover",
                            value: layover
                          });
                          if (tonu !== 0) freightItems.push({
                            label: "TONU",
                            value: tonu
                          });
                          if (extraStop !== 0) freightItems.push({
                            label: "Extra Stop",
                            value: extraStop
                          });
                          if (lateFee !== 0) freightItems.push({
                            label: "Late Fee",
                            value: -lateFee
                          });
                          if (noTrackingFee !== 0) freightItems.push({
                            label: "No Tracking",
                            value: -noTrackingFee
                          });
                          if (wrongAddressFee !== 0) freightItems.push({
                            label: "Wrong Address",
                            value: -wrongAddressFee
                          });
                          if (escortFee !== 0) freightItems.push({
                            label: "Escort",
                            value: escortFee
                          });
                          if (lumper !== 0) freightItems.push({
                            label: "Lumper",
                            value: lumper
                          });
                          if (otherCharges !== 0) {
                            const reason = String((order as any).otherChargesReason || "").trim();
                            freightItems.push({
                              label: reason || "Other Charges",
                              value: -otherCharges
                            });
                          }
                          if (otherAdditionals !== 0) {
                            const reason = String((order as any).otherAdditionalsReason || "").trim();
                            freightItems.push({
                              label: reason || "Other Additionals",
                              value: otherAdditionals
                            });
                          }

                          // Build driver items - late fee, no tracking, wrong address are deductions (negative)
                          if (detentionDriver !== 0) driverItems.push({
                            label: "Detention",
                            value: detentionDriver
                          });
                          if (layoverDriver !== 0) driverItems.push({
                            label: "Layover",
                            value: layoverDriver
                          });
                          if (tonuDriver !== 0) driverItems.push({
                            label: "TONU",
                            value: tonuDriver
                          });
                          if (extraStopDriver !== 0) driverItems.push({
                            label: "Extra Stop",
                            value: extraStopDriver
                          });
                          if (lateFeeDriver !== 0) driverItems.push({
                            label: "Late Fee",
                            value: -lateFeeDriver
                          });
                          if (noTrackingFeeDriver !== 0) driverItems.push({
                            label: "No Tracking",
                            value: -noTrackingFeeDriver
                          });
                          if (wrongAddressFeeDriver !== 0) driverItems.push({
                            label: "Wrong Address",
                            value: -wrongAddressFeeDriver
                          });
                          if (lumperDriver !== 0) driverItems.push({
                            label: "Lumper",
                            value: lumperDriver
                          });
                          if (otherChargesDriver !== 0) {
                            const reason = String((order as any).otherChargesReason || "").trim();
                            driverItems.push({
                              label: reason || "Other Charges",
                              value: -otherChargesDriver
                            });
                          }
                          if (otherAdditionalsDriver !== 0) {
                            const reason = String((order as any).otherAdditionalsReason || "").trim();
                            driverItems.push({
                              label: reason || "Other Additionals",
                              value: otherAdditionalsDriver
                            });
                          }
                          const driverDifference = totalDriverPay - driverPrice;
                          const hasDriverItems = driverItems.length > 0;
                          return <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
                                        <img src={moneyStackIcon} alt={isPositive ? "Additional pay" : "Reduced pay"} className={`h-5 w-5 object-contain ${!isPositive ? "grayscale brightness-75 hue-rotate-180" : ""}`} />
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
                                  return <div key={idx} className="text-muted-foreground pl-2">
                                              {item.label}: {sign}{formatCurrency(Math.abs(item.value))}
                                            </div>;
                                })}
                                        <div className="pt-1 border-t">Total: {formatCurrency(totalFreightVal)}</div>
                                        <div className={`font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
                                          Difference: {isPositive ? "+" : ""}{formatCurrency(difference)}
                                        </div>
                                      </div>

                                      {/* Driver Section */}
                                      {primaryRole !== 'dispatch' && hasDriverItems && <div className="space-y-1 text-sm mt-3 pt-3 border-t">
                                          <div className="font-medium text-muted-foreground">Driver Pay</div>
                                          <div>Base: {formatCurrency(driverPrice)}</div>
                                          {driverItems.map((item, idx) => {
                                  const sign = item.value >= 0 ? "+" : "-";
                                  return <div key={idx} className="text-muted-foreground pl-2">
                                                {item.label}: {sign}{formatCurrency(Math.abs(item.value))}
                                              </div>;
                                })}
                                          <div className="pt-1 border-t">Total: {formatCurrency(totalDriverPay)}</div>
                                          <div className={`font-semibold ${driverDifference >= 0 ? "text-green-500" : "text-red-500"}`}>
                                            Difference: {driverDifference >= 0 ? "+" : ""}{formatCurrency(driverDifference)}
                                          </div>
                                        </div>}
                                    </PopoverContent>
                                  </Popover>;
                        })()}
                              {/* Rescheduled icon */}
                              {(order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "" && <Popover>
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
                                </Popover>}
                              {/* Lumper Missing Revised RC icon */}
                              {orderIdsWithMissingLumperRC.has(order.id) && <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button className="inline-flex p-1" onClick={e => {
                                e.stopPropagation();
                                setLumperMissingDataDialog({
                                  orderId: order.id,
                                  driverId: (order as any).driver1Id || "",
                                  driverName: order.driverName || "Unknown"
                                });
                              }}>
                                        <img src={lumperReceiptIcon} alt="Lumper Receipt" className="h-4 w-4 cursor-pointer" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Lumper - Missing Receipt</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>}
                            </div>
                          </TableCell>
                          <TableCell className="w-20 font-medium">{order.truckNumber}</TableCell>
                          <TableCell className="w-32">
                            <div className="line-clamp-2">{order.driverName}</div>
                          </TableCell>
                          <TableCell className="w-20">
                            <div className="flex items-center gap-1">
                              {(order as any).isPartial && <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Layers className="h-3.5 w-3.5 text-primary" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Partial Load</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>}
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
                            {(order as any).isPartial && (order as any).partialBrokers?.length > 0 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="line-clamp-2 cursor-help">
                                      {(order as any).partialBrokers.find((b: string) => b) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBrokers.map((broker: string, idx: number) => broker ? <div key={idx}>
                                            Partial {idx + 1}: {broker}
                                          </div> : null)}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : <div className="line-clamp-2">{order.brokerName}</div>}
                          </TableCell>
                          <TableCell className="w-28">
                            {(order as any).isPartial && (order as any).partialBrokerLoads?.length > 0 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="cursor-help">
                                      {(order as any).partialBrokerLoads.find((n: string) => n) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBrokerLoads.map((loadNum: string, idx: number) => loadNum ? <div key={idx}>
                                            Partial {idx + 1}: {loadNum}
                                          </div> : null)}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : <>{order.brokerLoadNumber}</>}
                          </TableCell>
                          {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && <TableCell className="w-20">
                            {primaryRole === 'manager' || primaryRole === 'supervisor' ? (
                              <span>{order.invoiced ? "Yes" : "No"}</span>
                            ) : (
                              <span
                                className="cursor-pointer hover:underline"
                                onClick={() => {
                                  setPendingInvoicedOrder({
                                    id: order.id,
                                    currentInvoiced: order.invoiced === true
                                  });
                                  setInvoicedConfirmDialogOpen(true);
                                }}
                              >
                                {order.invoiced ? "Yes" : "No"}
                              </span>
                            )}
                          </TableCell>}
                          <TableCell className="w-20">
                            {order.notes && <Button variant="ghost" size="sm" className="h-auto p-1 text-xs font-normal hover:underline" onClick={() => {
                        setSelectedNotes(order.notes);
                        setNotesDialogOpen(true);
                      }}>
                                {order.notes.length > 12 ? order.notes.substring(0, 12) + "..." : order.notes}
                              </Button>}
                          </TableCell>
                          {primaryRole !== 'dispatch' && <TableCell className="w-24">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency((order as any).totalDriverPay)}
                            </div>
                          </TableCell>}
                          <TableCell className="w-28">
                            <div className="font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(order.totalFreightAmount)}
                            </div>
                          </TableCell>
                          <TableCell className="w-28">
                            {(order as any).isPartial && (order as any).partialBookedByCompanies?.length > 0 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="line-clamp-2 cursor-help">
                                      {(order as any).partialBookedByCompanies.find((c: string) => c) || ""}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-1">
                                      {(order as any).partialBookedByCompanies.map((company: string, idx: number) => company ? <div key={idx}>
                                            Partial {idx + 1}: {company}
                                          </div> : null)}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : <div className="line-clamp-2">{order.bookedByCompanyName}</div>}
                          </TableCell>
                          <TableCell className="w-24">
                            <div className="line-clamp-2">{order.bookedBy}</div>
                          </TableCell>
                          <TableCell className="w-24 text-center">
                            <div className="flex gap-1 flex-wrap justify-center">
                              {order.rcFiles && order.rcFiles.length > 0 ? <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                          const file = order.rcFiles[0];
                          const {
                            data,
                            error
                          } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);
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
                        }}>
                                  {order.rcFiles[0].file_name.length > 8 ? order.rcFiles[0].file_name.substring(0, 8) + "..." : order.rcFiles[0].file_name}
                                </Button> : <Badge variant="destructive" className="text-xs">
                                  Missing
                                </Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="w-24 text-center">
                            <div className="flex gap-1 flex-wrap justify-center">
                              {(() => {
                          const deliveryCount = order.pickup_drops?.filter((pd: any) => pd.type === 'delivery').length || 1;
                          const podCount = order.podFiles?.length || 0;
                          const isComplete = podCount >= deliveryCount;
                          if (podCount > 0) {
                            return <Button variant="outline" size="sm" className={`text-xs ${!isComplete ? 'border-warning text-warning' : ''}`} onClick={async () => {
                              const file = order.podFiles[0];
                              const {
                                data,
                                error
                              } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);
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
                            }}>
                                      {deliveryCount > 1 ? `POD ${podCount}/${deliveryCount}` : order.podFiles[0].file_name.length > 8 ? order.podFiles[0].file_name.substring(0, 8) + "..." : order.podFiles[0].file_name}
                                    </Button>;
                          } else {
                            return <Badge variant="destructive" className="text-xs">
                                      {deliveryCount > 1 ? `Missing 0/${deliveryCount}` : 'Missing'}
                                    </Badge>;
                          }
                        })()}
                            </div>
                          </TableCell>
                          <TableCell className="w-32 text-center">
                            <div className="flex gap-1 w-32 justify-center">
                              <Button variant="outline" size="sm" onClick={() => navigateToEditOrder(order.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {primaryRole !== 'manager' && primaryRole !== 'supervisor' && (hasRole("admin") || hasRole("accounting")) && <Button variant="outline" size="sm" onClick={() => toggleOrderLock(order.id, order.locked)} title={order.locked ? "Unlock load" : "Lock load"}>
                                    {order.locked ? <Lock className="h-4 w-4 text-destructive" /> : <LockOpen className="h-4 w-4 text-muted-foreground" />}
                                  </Button>}
                              {(hasRole("manager") || hasRole("admin") || hasRole("accounting") || hasRole("supervisor")) && <>
                                  {!order.locked && !order.canceled && <Button variant="outline" size="sm" onClick={() => openCancelDialog(order.id)} title="Cancel load">
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    </Button>}
                                  {order.canceled && !order.locked && <Button variant="outline" size="sm" onClick={() => handleRevertCancellation(order.id)} title="Revert cancellation">
                                        <Undo2 className="h-4 w-4 text-primary" />
                                      </Button>}
                                </>}
                              {canCancelOrders && !order.locked && !order.canceled && <Button variant="outline" size="sm" onClick={() => openCancelDialog(order.id)} title="Cancel load">
                                  <XCircle className="h-4 w-4 text-destructive" />
                                </Button>}
                              {canCancelOrders && order.canceled && !order.locked && <Button variant="outline" size="sm" onClick={() => handleRevertCancellation(order.id)} title="Revert cancellation">
                                  <Undo2 className="h-4 w-4 text-primary" />
                                </Button>}
                            </div>
                          </TableCell>
                          {primaryRole !== 'dispatch' && primaryRole !== 'afterhours' && <TableCell className="w-20 text-center">
                              <div className="flex justify-center">
                                {primaryRole === 'manager' || primaryRole === 'supervisor' ? (
                                  <span className="text-sm">{order.paid ? "Yes" : "No"}</span>
                                ) : (
                                  <Checkbox checked={order.paid === true} onCheckedChange={() => {
                                    setPendingPaidOrder({
                                      id: order.id,
                                      currentPaid: order.paid === true
                                    });
                                    setPaidConfirmDialogOpen(true);
                                  }} aria-label={`Mark load ${order.loadNumber} as ${order.paid ? 'unpaid' : 'paid'}`} />
                                )}
                              </div>
                            </TableCell>}
                        </TableRow>;
                })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
                {effectiveTotalCount > ORDERS_PER_PAGE && <div className="flex items-center justify-between px-6 py-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ORDERS_PER_PAGE + 1} to {Math.min(currentPage * ORDERS_PER_PAGE, effectiveTotalCount)} of {effectiveTotalCount}{" "}
                  loads
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>

                    {/* First page */}
                    {currentPage > 2 && <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                          1
                        </PaginationLink>
                      </PaginationItem>}

                    {/* Ellipsis before current */}
                    {currentPage > 3 && <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>}

                    {/* Previous page */}
                    {currentPage > 1 && <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage - 1)} className="cursor-pointer">
                          {currentPage - 1}
                        </PaginationLink>
                      </PaginationItem>}

                    {/* Current page */}
                    <PaginationItem>
                      <PaginationLink isActive className="cursor-default">
                        {currentPage}
                      </PaginationLink>
                    </PaginationItem>

                    {/* Next page */}
                    {currentPage < totalPages && <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(currentPage + 1)} className="cursor-pointer">
                          {currentPage + 1}
                        </PaginationLink>
                      </PaginationItem>}

                    {/* Ellipsis after current */}
                    {currentPage < totalPages - 2 && <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>}

                    {/* Last page */}
                    {currentPage < totalPages - 1 && <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>}

                    <PaginationItem>
                      <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>}

            {/* Server-side search indicator */}
            {isSearching && <div className="flex items-center justify-center gap-2 px-6 py-4 border-t bg-muted/30">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Searching all orders...</span>
              </div>}

            {/* Load more filtered results */}
            {hasActiveFilter && hasMoreFiltered && !isFilteredLoading && (
              <div className="flex items-center justify-center gap-2 px-6 py-4 border-t">
                <Button variant="outline" onClick={loadMoreFiltered}>
                  Load More Results
                </Button>
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
                <Input id="tonu" type="number" step="0.01" placeholder="0.00" value={cancelFormData.tonu} onChange={e => setCancelFormData({
                ...cancelFormData,
                tonu: e.target.value
              })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverRate">Driver Rate ($)</Label>
                <Input id="driverRate" type="number" step="0.01" placeholder="0.00" value={cancelFormData.driverRate} onChange={e => setCancelFormData({
                ...cancelFormData,
                driverRate: e.target.value
              })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dhMiles">DH Miles</Label>
                <Input id="dhMiles" type="number" placeholder="0" value={cancelFormData.dhMiles} onChange={e => setCancelFormData({
                ...cancelFormData,
                dhMiles: e.target.value
              })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Cancellation Notes</Label>
                <Input id="notes" placeholder="Enter reason for cancellation" value={cancelFormData.notes} onChange={e => setCancelFormData({
                ...cancelFormData,
                notes: e.target.value
              })} />
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
        {selectionMode && <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[400px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Selected Loads</h3>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelectionMode(false)}>
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
              
              {Object.keys(selectedByCompany).length > 0 && <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-muted-foreground mb-1">By Company:</p>
                  {Object.entries(selectedByCompany).map(([company, data]: [string, {
              count: number;
              freight: number;
            }]) => <div key={company} className="flex justify-between text-xs">
                      <span className="truncate max-w-[150px]">{company} ({data.count})</span>
                      <span>{formatCurrency(data.freight)}</span>
                    </div>)}
                </div>}
              
              {primaryRole !== 'manager' && primaryRole !== 'supervisor' && (hasRole("admin") || hasRole("accounting")) && <Button className="w-full mt-3" size="sm" onClick={bulkLockOrders} disabled={selectedOrderIds.size === 0}>
                  <Lock className="h-4 w-4 mr-2" />
                  Lock Selected ({selectedOrders.filter(o => !o.locked).length})
                </Button>}
            </div>
          </div>}

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
        <Dialog open={paidConfirmDialogOpen} onOpenChange={open => {
        setPaidConfirmDialogOpen(open);
        if (!open) setPendingPaidOrder(null);
      }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Payment Status Change</DialogTitle>
              <DialogDescription>
                {pendingPaidOrder?.currentPaid ? "Are you sure you want to mark this load as unpaid?" : "Are you sure you want to mark this load as paid?"}
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
        {/* Invoiced Confirmation Dialog */}
        <Dialog open={invoicedConfirmDialogOpen} onOpenChange={open => {
        setInvoicedConfirmDialogOpen(open);
        if (!open) setPendingInvoicedOrder(null);
      }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Invoiced Status Change</DialogTitle>
              <DialogDescription>
                {pendingInvoicedOrder?.currentInvoiced ? "Are you sure you want to mark this load as not invoiced?" : "Are you sure you want to mark this load as invoiced?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
              setInvoicedConfirmDialogOpen(false);
              setPendingInvoicedOrder(null);
            }}>
                Cancel
              </Button>
              <Button onClick={handleConfirmInvoicedChange}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Lumper Missing Data Dialog */}
        <LumperMissingDataDialog open={!!lumperMissingDataDialog} onOpenChange={open => !open && setLumperMissingDataDialog(null)} driverId={lumperMissingDataDialog?.driverId || ""} driverName={lumperMissingDataDialog?.driverName || ""} filterOrderId={lumperMissingDataDialog?.orderId} />
        {/* Invoice Warnings Dialog */}
        <Dialog open={invoiceWarningDialogOpen} onOpenChange={setInvoiceWarningDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Invoice File Attachment Issues
              </DialogTitle>
              <DialogDescription>
                Some files had issues during invoice generation. See details below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {(() => {
                const skippedWarnings = invoiceWarnings.filter(w => w.reason === 'skipped');
                const fallbackWarnings = invoiceWarnings.filter(w => w.reason === 'fallback');
                return <>
                  {skippedWarnings.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" />
                        Missing Files — could NOT be attached
                      </div>
                      {skippedWarnings.map((warning, idx) => (
                        <div key={`skip-${idx}`} className="border border-destructive/30 rounded-lg p-3 bg-destructive/5 mb-2">
                          <div className="font-medium text-sm mb-2">Invoice: {warning.invoice}</div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {warning.files.map((file, fileIdx) => (
                              <li key={fileIdx} className="flex items-center gap-2">
                                <span className="text-xs font-medium bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                                  {file.type}
                                </span>
                                <span className="truncate">{file.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                  {fallbackWarnings.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-yellow-600 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        Embedded as Attachments — open in Adobe Acrobat (paperclip icon)
                      </div>
                      {fallbackWarnings.map((warning, idx) => (
                        <div key={`fb-${idx}`} className="border border-yellow-500/30 rounded-lg p-3 bg-yellow-500/5 mb-2">
                          <div className="font-medium text-sm mb-2">Invoice: {warning.invoice}</div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {warning.files.map((file, fileIdx) => (
                              <li key={fileIdx} className="flex items-center gap-2">
                                <span className="text-xs font-medium bg-yellow-500/10 text-yellow-700 px-1.5 py-0.5 rounded">
                                  {file.type}
                                </span>
                                <span className="truncate">{file.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </>;
              })()}
            </div>
            <DialogFooter>
              <Button onClick={() => setInvoiceWarningDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>;
};
export default Orders;