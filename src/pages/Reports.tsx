import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EfsRequestDialog } from "@/components/EfsRequestDialog";
import { HosRequestDialog } from "@/components/HosRequestDialog";
import { DriverProblemDialog } from "@/components/DriverProblemDialog";
import { AllProblemsDialog } from "@/components/AllProblemsDialog";
import { EditDriverDialog } from "@/components/EditDriverDialog";
import { AddOrderSalaryChargeDialog } from "@/components/AddOrderSalaryChargeDialog";
import { useDriverProblems } from "@/hooks/useDriverProblems";
import { useDrivers } from "@/hooks/useDrivers";
import { useCompanies } from "@/hooks/useCompanies";
import { useBrokers } from "@/hooks/useBrokers";
import { Combobox } from "@/components/ui/combobox";
import {
  MapPin,
  AlertCircle,
  Loader2,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Clock,
  Maximize2,
  UserPlus,
  History,
  HelpCircle,
  Home,
  Warehouse,
  Ban,
  Upload,
  CalendarIcon,
  Pill,
  DollarSign,
  Map as MapIcon,
  Undo2,
  ClipboardCopy,
  Fuel,
  Search,
  Download,
  CreditCard,
  ShieldCheck,
  CircleDot,
  Settings,
  IdCard,
  FileText,
  Building2,
  HeartPulse,
  FileWarning,
  AlertTriangle,
} from "lucide-react";
import { TruckNoteHistoryDialog } from "@/components/TruckNoteHistoryDialog";
import { TranslatableOrderNote } from "@/components/TranslatableOrderNote";
import { TruckWeekRevenuePopover } from "@/components/TruckWeekRevenuePopover";
import { ArrivalTimeDialog } from "@/components/ArrivalTimeDialog";
import { CheckInOutTimeDialog } from "@/components/CheckInOutTimeDialog";
import { EditLostDayNoteDialog } from "@/components/EditLostDayNoteDialog";

import { useNavigate } from "react-router-dom";
import { HosCircularTimer } from "@/components/HosCircularTimer";
// NOTE: Reports must call exactly ONE reports hook. The adapter internally toggles legacy/date-window.
import {
  useReportsDateWindowAdapter,
  USE_DATE_WINDOW_LOADING,
  invalidateOrderFilesCacheForOrder,
  ensureLostDayNotesForDateRange,
  upsertLostDayNoteInAccumulator,
  removeLostDayNoteFromAccumulator,
} from "@/hooks/useReportsDateWindowAdapter";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";
import { removeOrderFromGlobalStore } from "@/hooks/useReportsDateWindow";
import { useDispatcherLazyOrders, clearDispatcherLazyData } from "@/hooks/useDispatcherLazyOrders";
import { useEfsMissingByDriver } from "@/hooks/useEfsMissingByDriver";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
import lumperReceiptIcon from "@/assets/lumper-receipt-icon.png";
import wrenchIcon from "@/assets/wrench-icon.png";
import dotInspectionIcon from "@/assets/dot-inspection-icon.png";
import { ClipboardList } from "lucide-react";
import gasStationIcon from "@/assets/gas-station.png";
import biohazardSignIcon from "@/assets/biohazard-sign.png";
import tankerTruckIcon from "@/assets/tanker-truck.png";
import portIcon from "@/assets/port.png";
import passportIcon from "@/assets/passport.png";
import greenCardIcon from "@/assets/green-card.png";
import criminalDatabaseIcon from "@/assets/criminal-database.png";
import strapIcon from "@/assets/strap.png";
import loadBarIcon from "@/assets/load_bar.png";
import ventedIcon from "@/assets/vented-icon.png";
import { EfsMissingDataDialog } from "@/components/EfsMissingDataDialog";
import { LumperMissingDataDialog } from "@/components/LumperMissingDataDialog";
import { TemporaryPlateUploadDialog } from "@/components/TemporaryPlateUploadDialog";
import { AddDailyReportRowDialog } from "@/components/AddDailyReportRowDialog";
import { useDailyReportPermissions } from "@/hooks/useDailyReportPermissions";
import { useDriverDrugTests } from "@/hooks/useDriverDrugTests";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";

import { supabase } from "@/integrations/supabase/client";
import React, { useState, useEffect, useMemo, memo, useRef, useCallback, startTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCarousel } from "@/components/ui/calendar-carousel";
import { Calendar } from "@/components/ui/calendar";
import { startOfWeek, addDays, isSameDay, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { TruckMapDialog, TruckMapView } from "@/components/TruckMapDialog";
import { DispatcherFleetMapView } from "@/components/DispatcherFleetMapDialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { DatePicker } from "@/components/ui/date-picker";
import { useReportsDialogs } from "./Reports/useReportsDialogs";
import { useReportsFilters } from "./Reports/useReportsFilters";
import { useDebounce } from "@/hooks/useDebounce";
import { useAfterhoursDriverMap } from "@/hooks/useAfterhoursDriverMap";
import { useAutoSwitchOffice } from "@/hooks/useAutoSwitchOffice";
import { uploadOrderFilePreserveName } from "@/utils/orderFilesUpload";
import {
  WeightBolDialog,
  getWeightDiscrepancyWarning,
  SCALE_TICKET_THRESHOLD_LBS,
  needsScaleTicket,
} from "@/components/WeightBolDialog";
import { ScaleTicketDialog } from "@/components/ScaleTicketDialog";
import {
  getCompanyBackgroundColor,
  getChicagoToday,
  formatDocuments,
  formatDateTime,
  formatTime,
  formatTimeRange,
  has5SecondsPassed,
  hasPreviousOrdersWithoutPOD,
  shouldShowGoingToPickup,
  shouldShowAtPickup,
  shouldShowGoingToDelivery,
  shouldShowAtDelivery,
  getPickupCellColor,
  getDeliveryCellColor,
  getLostDayNote,
  isGameOverDay,
  isSameDayPickupDelivery,
  parseOrdersWithDates,
  getPreviousLoadDeliveryStatus,
  getStatusColors,
  getMaintenanceIconStatus,
  getDotInspectionIconStatus,
  isLateDeliveryTime,
  haversineDistanceMiles,
  getNextStopInSequence,
  getPlateExpirationIconStatus,
  getInsuranceExpirationIconStatus,
  getTiresSwapIconStatus,
  getMaintenanceCheckIconStatus,
  getCdlExpirationIconStatus,
  getMvrDateIconStatus,
  getClearingHouseIconStatus,
  getMedicalCardIconStatus,
  collectTruckAlerts,
  collectDriverAlerts,
} from "./Reports/helpers";
import { formatInternalLoadNumber, getCompanyNameFromSuffix } from "@/utils/formatInternalLoadNumber";
import type { GameOverType } from "./Reports/helpers";
interface EditingState {
  truckId: string;
  field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note" | "miles-away";
  value: string;
}
interface DispatcherCalendarState {
  [dispatcherId: string]: Date;
}
// getStatusBadge - kept locally as it returns JSX
const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-transit))] text-[hsl(var(--cell-transit-foreground))] border border-border">
          In Transit
        </span>
      );
    case "Loading":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-loading))] text-[hsl(var(--cell-loading-foreground))] border border-border">
          Loading
        </span>
      );
    case "Available":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-available))] text-[hsl(var(--cell-available-foreground))] border border-border">
          Available
        </span>
      );
    case "Maintenance":
      return (
        <span className="px-1 py-0.5 text-[10px] bg-[hsl(var(--cell-maintenance))] text-[hsl(var(--cell-maintenance-foreground))] border border-border">
          Maintenance
        </span>
      );
    default:
      return (
        <span className="px-1 py-0.5 text-[10px] bg-muted text-muted-foreground border border-border">{status}</span>
      );
  }
};

// EditableNoteField component to avoid hooks violation
const EditableNoteField = ({
  truckId,
  driverId,
  value,
  handleNoteChange,
  setNoteDialogContent,
  setNoteDialogOpen,
  onHistoryClick,
  isFinalUpdateWindow,
  isFinalUpdateSent,
}: {
  truckId: string;
  driverId: string | null;
  value: string;
  handleNoteChange: (truckId: string, driverId: string | null, value: string) => Promise<void>;
  setNoteDialogContent: (value: string) => void;
  setNoteDialogOpen: (data: { truckId: string; driverId: string | null } | null) => void;
  onHistoryClick: (driverId: string | null) => void;
  isFinalUpdateWindow?: boolean;
  isFinalUpdateSent?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  // Update local value when prop changes (e.g., after successful save)
  useEffect(() => {
    if (!isEditing && !isSaving) {
      setLocalValue(value);
    }
  }, [value, isEditing, isSaving]);
  const hasContent = localValue && localValue.trim().length > 0 && localValue.trim() !== "Add note...";
  // Gold during final-update window unless already sent today; otherwise purple if has content
  const showGold = !!isFinalUpdateWindow && !isFinalUpdateSent;
  const bgClass = showGold ? "bg-yellow-400/30" : hasContent ? "bg-purple-500/20" : "bg-transparent";
  const handleBlur = async () => {
    if (localValue !== value) {
      setIsSaving(true);
      try {
        await handleNoteChange(truckId, driverId, localValue);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };
  return (
    <div className="relative w-full h-full group">
      {isEditing ? (
        <Textarea
          value={localValue || ""}
          onChange={(e) => setLocalValue(e.target.value)}
          autoFocus
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setLocalValue(value); // Reset to original value
              setIsEditing(false);
            }
          }}
          className={`text-[0.624rem] font-bold border-none rounded-none resize-none text-left ${bgClass} focus:outline-none focus:ring-0 focus:border-transparent p-1 w-full leading-tight`}
          style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px",
            boxShadow: "none",
            lineHeight: "14px",
          }}
          placeholder="Add note..."
          spellCheck={false}
        />
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className={`text-[0.624rem] font-bold cursor-text ${bgClass} p-1 w-full h-full overflow-hidden leading-tight line-clamp-2 ${isSaving ? "opacity-70" : ""}`}
          style={{
            height: "32px",
            minHeight: "32px",
            maxHeight: "32px",
            lineHeight: "14px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
          title={localValue || ""}
        >
          {hasContent ? localValue : <span className="text-muted-foreground">Add note...</span>}
        </div>
      )}
      {hasContent && (
        <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <History
            className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onHistoryClick(driverId);
            }}
          />
          <Maximize2
            className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setNoteDialogContent(localValue || "");
              setNoteDialogOpen({ truckId, driverId });
            }}
          />
        </div>
      )}
    </div>
  );
};

// Memoized wrapper for dispatcher groups to prevent re-renders during progressive rendering.
// During tab switches, visibleGroupCount increments each frame. Without memo, all visible groups
// re-create JSX each frame. With memo, only the newly added group renders; existing groups skip
// because their group data and memoKey haven't changed.
const MemoizedDispatcherGroup = React.memo<{
  group: any;
  memoKey: object;
  renderGroup: () => React.ReactNode;
}>(
  ({ renderGroup }) => <>{renderGroup()}</>,
  (prev, next) => prev.group === next.group && prev.memoKey === next.memoKey,
);
MemoizedDispatcherGroup.displayName = "MemoizedDispatcherGroup";

// Helper to check if an order matches the load number search filter
const orderMatchesLoadFilter = (order: any, searchTerm: string): boolean => {
  if (!searchTerm || !order) return false;
  const term = searchTerm.toLowerCase();
  const brokerMatch = String(order.broker_load_number || "")
    .toLowerCase()
    .includes(term);
  if (brokerMatch) return true;
  const internalLoadNumber = order.internal_load_number;
  const companyName = order.company?.name || order.driver1?.company?.name;
  if (internalLoadNumber) {
    const formattedInternal = formatInternalLoadNumber(internalLoadNumber, companyName).toLowerCase();
    if (formattedInternal.includes(term)) return true;
    if (String(internalLoadNumber).toLowerCase().includes(term)) return true;
  }
  return false;
};

const getOrderPickupDateForCarousel = (order: any): Date | null => {
  const pickupDatetime = order?.pickupStops?.[0]?.datetime || order?.pickupStop?.datetime || order?.pickup_datetime;
  if (!pickupDatetime) return null;
  const parsed = parseSimpleDateTime(pickupDatetime);
  return new Date(parsed.year, parsed.month - 1, parsed.day);
};

const Reports = () => {
  const { profile, hasRole, roles, getPrimaryRole } = useAuthContext();
  const { individualMode } = useIndividualMode();
  const navigate = useNavigate();

  // Use consolidated filter hook
  const {
    showEmptyTrucks,
    setShowEmptyTrucks,
    showNewDrivers,
    setShowNewDrivers,
    showTwoWeekNotice,
    setShowTwoWeekNotice,
    showLateTrucks,
    setShowLateTrucks,
    showProblems,
    setShowProblems,
    truckDriverFilter,
    setTruckDriverFilter,
    dispatchNameFilter,
    setDispatchNameFilter,
    loadNumberFilter,
    setLoadNumberFilter,
    companyFilter,
    setCompanyFilter,
    debouncedTruckDriverFilter,
    debouncedDispatchNameFilter,
    debouncedLoadNumberFilter,
    isNewDriver,
    hasGameOverDays,
  } = useReportsFilters();

  // Use consolidated dialog hook
  const dialogs = useReportsDialogs();
  const { data: companiesList = [] } = useCompanies();
  const { data: brokersList = [] } = useBrokers();

  const { drugTests, upsertDrugTest, getDrugTestForDriver } = useDriverDrugTests();
  const { hasDriverMissingData: hasEfsMissingData } = useEfsMissingByDriver();
  const { hasDriverMissingRevisedRC: hasLumperMissingRC } = useLumperMissingRevisedRC();
  const { hasDriverProblem, getProblemForDriver } = useDriverProblems();
  const { driverAfterhoursMap, isWeekendWindow } = useAfterhoursDriverMap();

  // Temporary plates query
  const { data: temporaryPlates } = useQuery({
    queryKey: ["temporary-plates-list"],
    queryFn: async () => {
      const { data } = await supabase.from("temporary_plates").select("id, truck_id");
      return data || [];
    },
  });
  const temporaryPlatesByTruckId = useMemo(() => {
    const map = new Map<string, string>();
    (temporaryPlates || []).forEach((tp: any) => map.set(tp.truck_id, tp.id));
    return map;
  }, [temporaryPlates]);

  // Supervised dispatcher ids (for supervisors viewing the $ revenue popover)
  const { data: supervisedDispatcherIds = [] } = useQuery({
    queryKey: ["reports-supervised-dispatchers", profile?.user_id],
    enabled: !!profile?.user_id && hasRole("supervisor"),
    queryFn: async () => {
      const { data } = await supabase
        .from("dispatcher_supervisors")
        .select("dispatcher_id")
        .eq("supervisor_id", profile!.user_id);
      return (data || []).map((r: any) => r.dispatcher_id as string);
    },
  });

  const canSeeWeekRevenue = useCallback(
    (truck: any) => {
      // Use raw roles check so accounting/safety (which get dispatch-like access
      // via hasRole) cannot see the $ revenue popover.
      if (roles.includes("admin") || roles.includes("manager")) return true;
      if (roles.includes("supervisor")) {
        if (!truck?.dispatcherId) return false;
        return (
          truck.dispatcherId === profile?.user_id ||
          supervisedDispatcherIds.includes(truck.dispatcherId)
        );
      }
      if (roles.includes("dispatch")) {
        return !!truck?.dispatcherId && truck.dispatcherId === profile?.user_id;
      }
      return false;
    },
    [roles, profile?.user_id, supervisedDispatcherIds],
  );

  // Temporary plate upload dialog state
  const [tempPlateDialog, setTempPlateDialog] = useState<{
    truckId: string;
    truckNumber: string;
    temporaryPlateId: string;
  } | null>(null);

  const getDriverCellStyle = useCallback(
    (truck: any) => {
      // Check for game over first - it takes priority
      if (hasGameOverDays(truck)) {
        return {
          backgroundColor: "black",
          color: "white",
        };
      }

      // Otherwise check for drug test styling
      if (!truck.driverId) return {};
      const drugTest = getDrugTestForDriver(truck.driverId);
      const isNew = isNewDriver(truck);
      if (!isNew) return {};
      if (drugTest?.result === "positive") {
        return {
          backgroundColor: "hsl(0, 72%, 53%)",
          color: "white",
        };
      } else if (drugTest?.result === "negative") {
        return {
          backgroundColor: "hsl(142, 76%, 36%)",
          color: "white",
        };
      }
      return {};
    },
    [hasGameOverDays, getDrugTestForDriver, isNewDriver],
  );

  // Note: Drug test notes are now added directly to truck notes when status changes
  // formatDateTime, formatTime, formatTimeRange are imported from ./Reports/helpers

  // Offices list - values must match database enum values
  // For afterhours users in Individual Mode whose office is one of the BG floors,
  // collapse "BG 1st floor" and "BG 4th floor" into a single virtual "BG" tab so
  // all of their assigned trucks across both floors are visible in one place.
  const useCombinedBgTab =
    getPrimaryRole() === "afterhours" &&
    individualMode &&
    (profile?.office === "BG 1st floor" || profile?.office === "BG 4th floor");
  const offices = useCombinedBgTab
    ? ["Čačak", "KRAGUJEVAC", "BG", "Recovery"]
    : ["Čačak", "KRAGUJEVAC", "BG 1st floor", "BG 4th floor", "Recovery"];

  // Map the virtual "BG" tab to the real underlying office values.
  const expandOffice = useCallback(
    (tab: string): string[] => (tab === "BG" && useCombinedBgTab ? ["BG 1st floor", "BG 4th floor"] : [tab]),
    [useCombinedBgTab],
  );

  // Display names for offices (uppercase for UI consistency)
  const getOfficeDisplayName = (office: string) => {
    if (office === "Čačak") return "ČAČAK";
    if (office === "BG") return "BG";
    return office;
  };

  // Set initial tab based on user's office, default to "Čačak" if not found
  const getInitialTab = () => {
    if (useCombinedBgTab) return "BG";
    if (profile?.office && offices.includes(profile.office)) {
      return profile.office;
    }
    return "Čačak";
  };
  // State for date-window navigation (used when USE_DATE_WINDOW_LOADING is true)
  const [selectedDateForWindow, setSelectedDateForWindow] = useState<Date>(new Date());

  // Track active office tab state - defined early so it can be used in hook
  const [activeTab, setActiveTabRaw] = useState<string>(getInitialTab());

  const setActiveTab = useCallback((office: string) => {
    setActiveTabRaw(office);
  }, []);

  // Spotlight driver: when load# search resolves to a driver in a different
  // office, this id is set so useReportsDateWindow can publish that one
  // driver first and load the rest of the office in the background.
  const [spotlightDriverId, setSpotlightDriverId] = useState<string | null>(null);

  // Determine if there's an active search (any filter has meaningful input)
  // Used to bypass Individual Mode office restrictions when searching
  const hasActiveSearch = !!(
    debouncedLoadNumberFilter.trim().length >= 3 ||
    debouncedTruckDriverFilter.trim().length >= 2 ||
    debouncedDispatchNameFilter.trim().length >= 2
  );

  // Reports.tsx must call exactly ONE reports hook consistently.
  // Use activeTab to fetch data for the currently selected office tab
  const activeHook = useReportsDateWindowAdapter({
    // When the virtual "BG" tab is active, do not constrain by a single office
    // value; the individual-mode driver-id scope already narrows correctly.
    priorityOffice: activeTab === "BG" && useCombinedBgTab ? null : activeTab,
    dispatcherId: profile?.user_id || null,
    dispatcherProfileId: profile?.id || null,
    selectedDate: selectedDateForWindow,
    hasActiveSearch, // Bypass Individual Mode office restrictions when searching
    spotlightDriverId,
  });

  const {
    data: rawGroupedReports,
    isLoading,
    error,
    isFetchingBackground,
    updateTruckStatus,
    updateTruckMilesAway,
    updateTruckNote,
    updatePickupDrop,
    updateLostDayNote,
    updatePickupDropArrival,
    updateCheckInOutTimes,
    markGoingToPickup,
    markGoingToDelivery,
    ...restHookData
  } = activeHook;

  // Extract isViewingOtherOfficeInIndividualMode (only present in date-window adapter)
  const isViewingOtherOfficeInIndividualMode = (restHookData as any).isViewingOtherOfficeInIndividualMode ?? false;

  // Use rawGroupedReports directly - progressive rendering handles tab switch performance.
  const groupedReports = rawGroupedReports;

  // Companies that have at least 1 truck in the currently selected office
  const companiesInOffice = useMemo(() => {
    if (!groupedReports) return [];
    const companies = new Set<string>();
    groupedReports
      .filter((group) => expandOffice(activeTab).includes(group.office))
      .forEach((group) => {
        group.trucks.forEach((truck: any) => {
          if (truck.companyName) companies.add(truck.companyName);
        });
      });
    return Array.from(companies).sort();
  }, [groupedReports, activeTab, expandOffice]);

  // Auto-switch office based on filter inputs (shared engine for all 3 filters)
  const { ambiguousMatch, searchStatus, foundOrderMeta } = useAutoSwitchOffice({
    truckDriverFilter: debouncedTruckDriverFilter,
    dispatchNameFilter: debouncedDispatchNameFilter,
    loadNumberFilter: debouncedLoadNumberFilter,
    activeTab,
    setActiveTab,
    offices,
    groupedReports,
    setSpotlightDriverId,
  });

  // Once the spotlighted driver appears in any loaded group, drop the
  // spotlight so future tab interactions aren't gated by it. The hook also
  // clears it when the load filter is emptied.
  useEffect(() => {
    if (!spotlightDriverId || !groupedReports) return;
    const present = groupedReports.some(
      (g: any) =>
        Array.isArray(g?.trucks) &&
        g.trucks.some((t: any) => {
          const d1 = t?.driver1?.id || t?.driver1Id || t?.driver_id;
          const d2 = t?.driver2?.id || t?.driver2Id;
          return d1 === spotlightDriverId || d2 === spotlightDriverId;
        }),
    );
    if (present) setSpotlightDriverId(null);
  }, [spotlightDriverId, groupedReports]);

  // Auto-navigate calendar when load search finds an order outside the visible date window
  useEffect(() => {
    if (foundOrderMeta?.pickupDate) {
      const loadDate = getOrderPickupDateForCarousel({ pickup_datetime: foundOrderMeta.pickupDate });
      if (!loadDate) return;
      if (isNaN(loadDate.getTime())) return;
      const windowStart = addDays(selectedDateForWindow, -2);
      const windowEnd = addDays(selectedDateForWindow, 3);
      if (loadDate < windowStart || loadDate > windowEnd) {
        setSelectedDateForWindow(addDays(loadDate, -1));
      }
    }
  }, [foundOrderMeta?.pickupDate]);

  // Auto-scroll each affected dispatcher's calendar carousel to show the matched load
  const loadFilterWasActiveRef = useRef(false);
  useEffect(() => {
    const hasLoadFilter = debouncedLoadNumberFilter.trim().length >= 3;
    // When the load filter is cleared, return Reports to today's default calendar window.
    if (!hasLoadFilter) {
      if (loadFilterWasActiveRef.current) {
        setSelectedDateForWindow(getChicagoToday());
        setCalendarDates({});
      }
      loadFilterWasActiveRef.current = false;
      return;
    }
    loadFilterWasActiveRef.current = true;

    const updates: Record<string, Date> = {};
    for (const group of (groupedReports || []) as any[]) {
      const dispatcherId = group?.dispatcherId;
      if (!dispatcherId || !Array.isArray(group?.trucks)) continue;
      let loadDate: Date | null = null;
      for (const truck of group.trucks) {
        const matchedOrder = (truck?.allOrders || []).find((order: any) =>
          orderMatchesLoadFilter(order, debouncedLoadNumberFilter),
        );
        if (matchedOrder) {
          loadDate = getOrderPickupDateForCarousel(matchedOrder);
          break;
        }
      }
      if (!loadDate) continue;
      const targetStart = addDays(loadDate, -1);
      const currentStart = calendarDates[dispatcherId] || addDays(getChicagoToday(), -2);
      if (isSameDay(currentStart, targetStart)) continue;
      updates[dispatcherId] = targetStart;
    }

    if (Object.keys(updates).length === 0) return;

    setCalendarDates((prev) => ({ ...prev, ...updates }));
    for (const [dispatcherId, newDate] of Object.entries(updates)) {
      const previousStartDate = calendarDates[dispatcherId] || addDays(getChicagoToday(), -2);
      loadDispatcherOrders(dispatcherId, newDate);
      loadDispatcherOrders(dispatcherId, addDays(newDate, 5));
      if (newDate < previousStartDate) {
        ensureLostDayNotesForDateRange(newDate, addDays(previousStartDate, -1));
      } else if (newDate > previousStartDate) {
        ensureLostDayNotesForDateRange(addDays(previousStartDate, 6), addDays(newDate, 5));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundOrderMeta?.pickupDate, debouncedLoadNumberFilter, groupedReports]);

  const { data: samsaraLocations, isLoading: isLoadingSamsara } = useSamsaraLocations();
  const queryClient = useQueryClient();

  // Dispatcher-specific lazy loading for calendar navigation
  // This loads orders immediately when a specific dispatcher's calendar is navigated
  // Orders are injected directly into globalAccumulatedOrders, triggering re-renders via version subscription
  const { loadOrdersForDate: loadDispatcherOrders, isLoading: isDispatcherLoading } = useDispatcherLazyOrders({
    onOrdersLoaded: (dispatcherId, orders) => {
      console.log(`[Reports] Dispatcher ${dispatcherId} loaded ${orders.length} orders via lazy loading`);
      // No need to invalidate queries - the version subscription in useReportsDateWindow handles re-renders
    },
  });

  // Delete lost day note mutation
  const deleteLostDayNote = useMutation({
    mutationFn: async ({ driverId, date }: { driverId: string; date: string }) => {
      const { error } = await supabase.from("lost_day_notes").delete().eq("driver_id", driverId).eq("date", date);
      if (error) throw error;
    },
    // Patch Home Time locally; already-loaded dates must not be refetched after deletes.
    onMutate: async ({ driverId, date }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      const previousAdapterNotes = queryClient.getQueriesData({ queryKey: ["adapter-lost-day-notes"] });
      const previousAccumulatorNote = (() => {
        for (const [, data] of previousAdapterNotes as Array<[any, any]>) {
          if (Array.isArray(data)) {
            const found = data.find((n: any) => n?.driver_id === driverId && n?.date === date);
            if (found) return found;
          }
        }
        return null;
      })();
      removeLostDayNoteFromAccumulator(driverId, date);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => {
            if (truck.driverId !== driverId) return truck;
            const updatedNotes = (truck.lost_day_notes ?? truck.lostDayNotes ?? []).filter((n: any) => n.date !== date);
            return { ...truck, lost_day_notes: updatedNotes, lostDayNotes: updatedNotes };
          }),
        }));
      });
      return { previousData, previousAccumulatorNote, driverId, date };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
      if (context?.previousAccumulatorNote) {
        upsertLostDayNoteInAccumulator(context.previousAccumulatorNote);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const lastZoomedLoadCloseTime = useRef<number>(0);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const [expandedTruckMap, setExpandedTruckMap] = useState<string | null>(null);
  const [expandedDispatcherMap, setExpandedDispatcherMap] = useState<string | null>(null);
  // activeTab state is defined earlier (line 348) to be used in the reports hook
  const [visibleTrucks, setVisibleTrucks] = useState<{
    [dispatcherId: string]: number;
  }>({});
  const [noteDialogOpen, setNoteDialogOpen] = useState<{ truckId: string; driverId: string | null } | null>(null);
  const [noteDialogContent, setNoteDialogContent] = useState<string>("");
  const [historyDialogDriverId, setHistoryDialogDriverId] = useState<string | null>(null);
  const [truckMapView, setTruckMapView] = useState<{
    truckNumber: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  // Final Update window: 15:45 - 16:30 Chicago time
  const [isFinalUpdateWindow, setIsFinalUpdateWindow] = useState(false);
  const [finalUpdateSentTruckIds, setFinalUpdateSentTruckIds] = useState<Set<string>>(new Set());
  const [finalUpdateDate, setFinalUpdateDate] = useState<string>("");

  useEffect(() => {
    const computeWindow = () => {
      const chicagoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
      const minutes = chicagoNow.getHours() * 60 + chicagoNow.getMinutes();
      const inWindow = minutes >= 15 * 60 + 45 && minutes < 16 * 60 + 30;
      setIsFinalUpdateWindow(inWindow);
      const y = chicagoNow.getFullYear();
      const m = String(chicagoNow.getMonth() + 1).padStart(2, "0");
      const d = String(chicagoNow.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      setFinalUpdateDate((prev) => {
        if (prev !== dateStr) {
          setFinalUpdateSentTruckIds(new Set());
          return dateStr;
        }
        return prev;
      });
    };
    computeWindow();
    const i = setInterval(computeWindow, 30_000);
    return () => clearInterval(i);
  }, []);

  // Load already-sent records for today so cell stays purple after a refresh
  useEffect(() => {
    if (!finalUpdateDate) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("final_update_sends").select("truck_id").eq("send_date", finalUpdateDate);
      if (cancelled || !data) return;
      setFinalUpdateSentTruckIds(new Set(data.map((r: any) => r.truck_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [finalUpdateDate]);

  const [lateDeliveries, setLateDeliveries] = useState<Set<string>>(new Set());
  const [latePickups, setLatePickups] = useState<Set<string>>(new Set());
  const [lateTrucks, setLateTrucks] = useState<Set<string>>(new Set()); // Track late trucks by truck ID
  const [notifiedLateStops, setNotifiedLateStops] = useState<Set<string>>(new Set());
  // Ref to track notified stops without causing re-renders (prevents infinite loop in late-check effect)
  const notifiedLateStopsRef = useRef<Set<string>>(new Set());
  const [yardActionDialog, setYardActionDialog] = useState<{
    driverId: string;
    driverName: string;
    driver2Id?: string;
    driver2Name?: string;
    truckNumber?: string;
  } | null>(null);
  const [yardActionType, setYardActionType] = useState<"maintenance" | "return_truck" | "recovery" | "safety" | "">("");
  const [yardActionComment, setYardActionComment] = useState("");
  const [yardActionDatetime, setYardActionDatetime] = useState<Date | undefined>(new Date());

  const [twoWeekNoticeDialog, setTwoWeekNoticeDialog] = useState<{
    driverId: string;
    driverName: string;
    driver2Id?: string;
    driver2Name?: string;
  } | null>(null);
  const [twoWeekNoticeDate, setTwoWeekNoticeDate] = useState<Date | undefined>(new Date());
  const [zoomedLoad, setZoomedLoad] = useState<{
    orderId: string;
    loadNumber: string;
    brokerLoadNumber: string;
    allPickupStops: any[];
    allDeliveryStops: any[];
    documents: string[];
    orderFiles: { id: string; file_name: string; file_path: string; file_category: string }[];
    notes: string;
    truckNumber: string;
    driverNames: string;
    companyName: string;
    internalLoadNumber: string;
    freightAmount: number;
    loadedMiles: number;
    dhMiles: number;
    driverPay: number;
    canceled: boolean;
    bookedBy: string;
    bookedByCompanyName?: string | null;
    brokerName?: string | null;
    weightRc?: number | null;
    weightBol?: number | null;
  } | null>(null);

  // Additional files popover state
  const [additionalFilesPopover, setAdditionalFilesPopover] = useState<{
    open: boolean;
    files: { id: string; file_name: string; file_path: string; file_category: string }[];
    anchorEl: HTMLElement | null;
  }>({ open: false, files: [], anchorEl: null });
  const [docSignedUrls, setDocSignedUrls] = useState<Record<string, string>>({});
  const [legendDialogOpen, setLegendDialogOpen] = useState(false);
  const [forceCompleteConfirm, setForceCompleteConfirm] = useState<{ type: "BOL" | "POD"; orderId: string } | null>(
    null,
  );
  const [salaryChargeOpen, setSalaryChargeOpen] = useState(false);

  // Proximity search state
  const [proximityAddress, setProximityAddress] = useState("");
  const [proximitySearching, setProximitySearching] = useState(false);
  const [proximityMatchedTrucks, setProximityMatchedTrucks] = useState<Map<string, number> | null>(null);
  const [proximityCoords, setProximityCoords] = useState<{ lat: number; lon: number } | null>(null);
  const proximityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupedReportsRef = useRef(groupedReports);
  useEffect(() => {
    groupedReportsRef.current = groupedReports;
  }, [groupedReports]);

  // Accumulated per-truck last delivery across date-carousel navigation and
  // background refetches. We keep the entry with the most recent pickup so
  // that switching dates does not cause matched trucks to disappear just
  // because their relevant order is outside the current date window.
  const truckLastDeliveryRef = useRef<Map<string, { lat: number; lon: number; date: string }>>(new Map());
  const [truckLastDeliveryVersion, setTruckLastDeliveryVersion] = useState(0);
  useEffect(() => {
    if (!groupedReports || groupedReports.length === 0) return;
    let changed = false;
    const map = truckLastDeliveryRef.current;
    for (const group of groupedReports) {
      for (const truck of group.trucks) {
        const sortedOrders = (truck.allOrders || [])
          .filter((o: any) => !o.canceled && o.notes !== "GAME|OVER")
          .sort((a: any, b: any) => {
            const aDate = a.pickupStops?.[0]?.datetime || a.pickup_datetime || "";
            const bDate = b.pickupStops?.[0]?.datetime || b.pickup_datetime || "";
            return aDate.localeCompare(bDate);
          });
        const lastOrder = sortedOrders[sortedOrders.length - 1];
        if (!lastOrder) continue;
        const deliveryStops = lastOrder.deliveryStops || [];
        const lastDrop = deliveryStops[deliveryStops.length - 1];
        if (!lastDrop?.latitude || !lastDrop?.longitude) continue;
        const date = lastOrder.pickupStops?.[0]?.datetime || lastOrder.pickup_datetime || "";
        const existing = map.get(truck.id);
        if (!existing || date >= existing.date) {
          map.set(truck.id, { lat: lastDrop.latitude, lon: lastDrop.longitude, date });
          changed = true;
        }
      }
    }
    if (changed) setTruckLastDeliveryVersion((v) => v + 1);
  }, [groupedReports]);

  // Proximity search effect - debounced 500ms, geocodes the address into coords
  useEffect(() => {
    if (proximityDebounceRef.current) clearTimeout(proximityDebounceRef.current);

    const trimmed = proximityAddress.trim();
    if (!trimmed) {
      setProximityMatchedTrucks(null);
      setProximityCoords(null);
      setProximitySearching(false);
      return;
    }

    setProximitySearching(true);
    proximityDebounceRef.current = setTimeout(async () => {
      try {
        const { geocodeAddress } = await import("@/utils/mapboxRouteCalculator");
        const searchCoords = await geocodeAddress(trimmed);
        if (!searchCoords) {
          setProximityCoords(null);
          setProximityMatchedTrucks(new Map());
          setProximitySearching(false);
          return;
        }
        setProximityCoords({ lat: searchCoords.lat, lon: searchCoords.lon });
      } catch (err) {
        console.error("Proximity search error:", err);
        setProximityCoords(null);
        setProximityMatchedTrucks(new Map());
      }
    }, 500);

    return () => {
      if (proximityDebounceRef.current) clearTimeout(proximityDebounceRef.current);
    };
  }, [proximityAddress]);

  // Recompute matched trucks whenever coords or grouped reports (office switch, data refresh) change
  useEffect(() => {
    if (!proximityCoords) {
      if (!proximityAddress.trim()) setProximityMatchedTrucks(null);
      return;
    }
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 3959;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const matched = new Map<string, number>();
    // Match against the accumulated per-truck last-delivery map so trucks
    // remain matched even when the visible date window shifts away from the
    // order that produced the coordinates.
    for (const [truckId, entry] of truckLastDeliveryRef.current.entries()) {
      const straightLine = haversine(proximityCoords.lat, proximityCoords.lon, entry.lat, entry.lon);
      const roadMiles = Math.round(straightLine * 1.3);
      if (roadMiles <= 150) {
        matched.set(truckId, roadMiles);
      }
    }
    setProximityMatchedTrucks(matched);
    setProximitySearching(false);
  }, [proximityCoords, proximityAddress, truckLastDeliveryVersion]);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelFormData, setCancelFormData] = useState({ tonu: "", driverRate: "", dhMiles: "", notes: "" });

  // Lumper Request state
  const [lumperDialogOpen, setLumperDialogOpen] = useState(false);
  const [lumperAmount, setLumperAmount] = useState("");
  const [lumperConfirmation, setLumperConfirmation] = useState<string | null>(null);
  const [isSubmittingLumper, setIsSubmittingLumper] = useState(false);

  // EFS Request dialog state (includes Cash Advance and Other tabs)
  const [efsRequestDialog, setEfsRequestDialog] = useState<{
    driverId: string;
    driverName: string;
    truckNumber: string;
    companyName: string;
  } | null>(null);

  // HOS Request dialog state
  const [hosRequestDialog, setHosRequestDialog] = useState<{
    driverName: string;
    truckNumber: string;
    companyName: string;
    teamDriverName?: string;
  } | null>(null);

  // EFS Missing Data dialog state
  const [efsMissingDataDialog, setEfsMissingDataDialog] = useState<{
    driverId: string;
    driverName: string;
  } | null>(null);

  // Lumper Missing Revised RC dialog state
  const [lumperMissingDataDialog, setLumperMissingDataDialog] = useState<{
    driverId: string;
    driverName: string;
  } | null>(null);

  // Add Daily Report Row dialog state
  const [addDailyReportDialog, setAddDailyReportDialog] = useState<{
    truckNumber: string;
    driverName: string | null;
    dispatcherName: string | null;
    office: string | null;
  } | null>(null);
  const { canEdit: canEditDailyReport } = useDailyReportPermissions();
  // Driver Problem dialog state
  const [problemDialog, setProblemDialog] = useState<{
    driverId: string;
    driverName: string;
    truckNumber: string;
    dispatcherName: string;
  } | null>(null);

  // All Problems dialog state
  const [allProblemsDialogOpen, setAllProblemsDialogOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const { data: allDrivers } = useDrivers();

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  // Pending BOL weight prompt (Reports BOL upload flow)
  const [bolWeightDialogOpen, setBolWeightDialogOpen] = useState(false);
  const [pendingBolWeight, setPendingBolWeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Scale ticket dialog state (Reports load zoom dialog)
  const [scaleTicketDialogOpen, setScaleTicketDialogOpen] = useState(false);
  const [scaleTicketDefaults, setScaleTicketDefaults] = useState<{
    steerAxle: number | null;
    driveAxle: number | null;
    trailerAxle: number | null;
    gross: number | null;
  }>({ steerAxle: null, driveAxle: null, trailerAxle: null, gross: null });
  const [arrivalTimeDialog, setArrivalTimeDialog] = useState<{
    pickupDropId: string;
    type: "pickup" | "delivery";
  } | null>(null);

  const [checkInOutDialog, setCheckInOutDialog] = useState<{
    pickupDropId: string;
    type: "pickup" | "delivery";
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null>(null);
  const [homeTimeDialog, setHomeTimeDialog] = useState<{
    truckId: string;
    truckNumber: string;
    driverId: string;
    date: string;
    isCurrentlyHomeTime: boolean;
  } | null>(null);

  const [redCellDialog, setRedCellDialog] = useState<{
    truckId: string;
    truckNumber: string;
    driverId: string;
    date: string;
    currentNote: string;
  } | null>(null);
  const [redCellNote, setRedCellNote] = useState("");
  const [redCellIsHomeTime, setRedCellIsHomeTime] = useState(false);

  // Helper function to check if 5 seconds have passed since button click
  const has5SecondsPassed = (timestamp: string | null | undefined): boolean => {
    if (!timestamp) return false;
    const clickTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    return now - clickTime >= 5000;
  };

  // Helper to check if any previous orders are missing POD (delivery not completed)
  const hasPreviousOrdersWithoutPOD = (truck: any | null, currentOrder: any): boolean => {
    if (!truck || !truck.allOrders || !currentOrder) return false;

    // Find orders that came before the current one and don't have POD
    return truck.allOrders.some((order: any) => {
      // Skip the current order
      if (order.id === currentOrder.id) return false;

      // Skip GAME-OVER orders
      if (order.notes === "GAME|OVER") return false;

      // Check if this order has BOL but no POD (incomplete delivery)
      const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
      const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");

      return hasBOL && !hasPOD;
    });
  };

  // Helper to determine if we should show Going to Pickup button
  const shouldShowGoingToPickup = (
    order: any,
    stop: any,
    truck: any | null = null,
    previousLoadDeliveryComplete: boolean = false,
  ): boolean => {
    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const goingToPickupClicked = !!stop.going_to_at;
    const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);

    // Don't show if stuck on previous load (has incomplete deliveries)
    if (hasIncompleteDeliveries) return false;

    // Don't show if already has BOL or already clicked going to
    if (hasBOL || goingToPickupClicked) return false;

    // Don't show for late pickups - they should just click "Arrived"
    if (latePickups.has(order.id)) return false;

    // Don't show if previous load is complete (cyan state) - already implies going to pickup
    if (previousLoadDeliveryComplete) return false;

    return true;
  };

  // Helper to determine if we should show At Pickup button
  const shouldShowAtPickup = (
    order: any,
    stop: any,
    truck: any | null = null,
    previousLoadDeliveryComplete: boolean = false,
  ): boolean => {
    if (stop.arrived_at) return false; // Already arrived

    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    if (hasBOL) return false; // Already has BOL, past pickup stage

    const hasIncompleteDeliveries = hasPreviousOrdersWithoutPOD(truck, order);
    if (hasIncompleteDeliveries) return false;

    const goingToPickupClicked = !!stop.going_to_at;
    const isLate = latePickups.has(order.id);

    // Show immediately for late pickups (no need to wait for "Going to" first)
    if (isLate) return true;

    // Show immediately if previous load is complete (cyan state)
    if (previousLoadDeliveryComplete) return true;

    // Otherwise require "Going to" clicked and 5 seconds passed
    const fiveSecondsPassed = has5SecondsPassed(stop.going_to_at);
    return goingToPickupClicked && fiveSecondsPassed;
  };

  // Helper to determine if we should show Going to Delivery button
  const shouldShowGoingToDelivery = (order: any, stop: any, _truck: any | null = null): boolean => {
    // Never show "Going to Delivery" - having BOL already implies going to delivery
    // User should just click "Arrived at Delivery" directly
    return false;
  };

  // Helper to determine if we should show At Delivery button
  const shouldShowAtDelivery = (order: any, stop: any, _truck: any | null = null): boolean => {
    if (stop.arrived_at) return false; // Already arrived

    const hasBOL = order.order_files?.some((file: any) => file.file_category === "BOL");
    const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");

    // Don't show if already has POD
    if (hasPOD) return false;

    // Show "Arrived at Delivery" if has BOL (lime green or late)
    return hasBOL;
  };

  // Helper to get all load details for zoom dialog - uses cached data, no DB call needed
  const getLoadDetailsForZoom = useCallback(
    (orderId: string, truck: any) => {
      const order = truck.allOrders?.find((o: any) => o.id === orderId);
      if (!order) return null;

      // Build driver names from driver1Name and driver2Name
      let driverNames = truck.driver1Name || "";
      if (truck.driver2Name) {
        driverNames = driverNames ? `${driverNames} / ${truck.driver2Name}` : truck.driver2Name;
      }

      // Helper to convert to number
      const toNum = (val: any): number => {
        if (val === null || val === undefined) return 0;
        const num = Number(val);
        return Number.isFinite(num) ? num : 0;
      };

      // Calculate financial totals from cached order data
      // Late fee, no tracking fee, wrong address fee, other charges SUBTRACT from freight
      const freightAmount =
        toNum(order.freight_amount) +
        toNum(order.detention) +
        toNum(order.layover) +
        toNum(order.tonu) +
        toNum(order.extra_stop) +
        toNum(order.lumper) -
        toNum(order.late_fee) -
        toNum(order.no_tracking_fee) -
        toNum(order.wrong_address_fee) +
        toNum(order.escort_fee) -
        toNum(order.other_charges);

      const loadedMiles = toNum(order.loaded_miles) || toNum(order.mileage);

      // Late fee, no tracking fee, wrong address fee SUBTRACT from driver pay (penalties)
      const driverPay =
        toNum(order.driver_price) +
        toNum(order.detention_driver) +
        toNum(order.layover_driver) +
        toNum(order.tonu_driver) +
        toNum(order.extra_stop_driver) +
        toNum(order.lumper_driver) -
        toNum(order.late_fee_driver) -
        toNum(order.no_tracking_fee_driver) -
        toNum(order.wrong_address_fee_driver) -
        toNum(order.other_charges_driver) +
        toNum(order.other_additionals_driver);

      return {
        orderId: order.id,
        loadNumber: order.loadDetails.loadNumber,
        brokerLoadNumber: order.loadDetails.brokerLoadNumber,
        allPickupStops: order.pickupStops || [],
        allDeliveryStops: order.deliveryStops || [],
        documents: (order.loadDetails.documents || []).map((d: any) => d.category),
        orderFiles: (order.order_files || []).map((f: any) => ({
          id: f.id,
          file_name: f.file_name,
          file_path: f.file_path,
          file_category: f.file_category,
        })),
        notes: order.loadDetails.notes,
        truckNumber: truck.truckNumber,
        driverNames: driverNames || "Unassigned",
        companyName: truck.companyName || "",
        internalLoadNumber: formatInternalLoadNumber(order.internal_load_number, truck.companyName),
        freightAmount,
        loadedMiles,
        dhMiles: toNum(order.dh_miles),
        driverPay,
        canceled: order.canceled || false,
        bookedBy: order.booked_by || "",
        bookedByCompanyName:
          order.bookedByCompanyName ||
          order.booked_by_company?.name ||
          companiesList.find((c: any) => c.id === order.booked_by_company_id)?.name ||
          getCompanyNameFromSuffix(order.internal_load_number) ||
          null,
        brokerName:
          order.brokerName ||
          order.broker?.name ||
          brokersList.find((b: any) => b.id === order.broker_id)?.name ||
          null,
        bolForceComplete: order.bol_force_complete || order.order?.bol_force_complete || false,
        podForceComplete: order.pod_force_complete || order.order?.pod_force_complete || false,
        weightRc: order.weight_rc ?? order.weightRc ?? null,
        weightBol: order.weight_bol ?? order.weightBol ?? null,
      };
    },
    [companiesList, brokersList],
  );

  // Force complete handler
  const handleForceComplete = async (type: "BOL" | "POD", orderId: string) => {
    try {
      const updateData: any = {};
      if (type === "BOL") {
        updateData.bol_force_complete = true;
      } else {
        updateData.pod_force_complete = true;
        updateData.status = "delivered";
      }

      const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
      if (error) throw error;

      // POD: set checked_out_at on all delivery stops that don't have it
      if (type === "POD") {
        await supabase
          .from("pickup_drops")
          .update({ checked_out_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .eq("type", "delivery")
          .is("checked_out_at", null);
      }

      // Optimistic update: update zoomedLoad state
      setZoomedLoad((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          bolForceComplete: type === "BOL" ? true : prev.bolForceComplete,
          podForceComplete: type === "POD" ? true : prev.podForceComplete,
        };
      });

      // Optimistic update reports cache
      const reportsCacheKeys = [["reports", "priority"], ["reports", "full"], ["reports"]];
      for (const key of reportsCacheKeys) {
        queryClient.setQueriesData({ queryKey: key }, (oldData: any) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          return oldData.map((truck: any) => {
            if (!truck.allOrders) return truck;
            return {
              ...truck,
              allOrders: truck.allOrders.map((o: any) => {
                if (o.id !== orderId) return o;
                const updated = { ...o };
                const orderFiles = [...(updated.order_files || [])];

                if (type === "BOL") {
                  updated.bol_force_complete = true;
                  if (updated.order) updated.order = { ...updated.order, bol_force_complete: true };
                  // Inject synthetic BOL files up to pickup stop count
                  const pickupStopCount = (updated.pickupStops || []).length;
                  const existingBolCount = orderFiles.filter((f: any) => f.file_category === "BOL").length;
                  for (let i = existingBolCount; i < pickupStopCount; i++) {
                    orderFiles.push({
                      id: `synthetic-bol-${i}`,
                      file_category: "BOL",
                      file_name: "force-complete",
                      file_path: "",
                    });
                  }
                } else {
                  updated.pod_force_complete = true;
                  updated.isActive = false;
                  updated.isRecentCompleted = true;
                  if (updated.order)
                    updated.order = { ...updated.order, pod_force_complete: true, status: "delivered" };
                  // Inject synthetic POD files up to delivery stop count
                  const deliveryStopCount = (updated.deliveryStops || []).length;
                  const existingPodCount = orderFiles.filter((f: any) => f.file_category === "POD").length;
                  for (let i = existingPodCount; i < deliveryStopCount; i++) {
                    orderFiles.push({
                      id: `synthetic-pod-${i}`,
                      file_category: "POD",
                      file_name: "force-complete",
                      file_path: "",
                    });
                  }
                  // Set checked_out_at on delivery stops
                  if (updated.deliveryStops) {
                    updated.deliveryStops = updated.deliveryStops.map((s: any) =>
                      s.checked_out_at ? s : { ...s, checked_out_at: new Date().toISOString() },
                    );
                  }
                }
                updated.order_files = orderFiles;
                // Recompute document status from files
                const hasBOL = orderFiles.some((f: any) => f.file_category === "BOL");
                const hasPOD = orderFiles.some((f: any) => f.file_category === "POD");
                updated.documentStatus = hasPOD ? "complete" : hasBOL ? "partial" : "missing";
                updated.documentColors = { bol: hasBOL, pod: hasPOD };
                return updated;
              }),
            };
          });
        });
      }

      // Invalidate orders cache for other pages
      queryClient.invalidateQueries({ queryKey: ["orders"] });

      toast({
        title: `${type} Force Complete`,
        description: `All ${type === "BOL" ? "pickup" : "delivery"} stops marked as complete`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to force complete",
        variant: "destructive",
      });
    }
  };

  const handleDocumentClick = (docType: string, isChecked: boolean) => {
    if (!isChecked) {
      setUploadDocType(docType);
      setUploadFiles([]);
      setUploadDialogOpen(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadDocument = async (weightOverride?: number) => {
    if (!uploadFiles.length || !zoomedLoad?.orderId) return;

    const effectiveWeight = weightOverride ?? pendingBolWeight;

    // For BOL uploads, require a weight value first. If not yet provided, open the weight dialog.
    if (uploadDocType === "BOL" && effectiveWeight == null) {
      setBolWeightDialogOpen(true);
      return;
    }

    setIsUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user?.id || "")
        .single();

      // Get current timestamp in Chicago timezone for checkout time
      const chicagoTime = toZonedTime(new Date(), "America/Chicago");
      const checkoutTimestamp = chicagoTime.toISOString();

      // Upload all files
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const filePath = await uploadOrderFilePreserveName({
          orderId: zoomedLoad.orderId,
          folder: uploadDocType,
          file,
        });

        // Insert into order_files table
        const { error: fileError } = await supabase.from("order_files").insert({
          order_id: zoomedLoad.orderId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          content_type: file.type,
          file_category: uploadDocType,
          uploaded_by: profile?.full_name || profile?.email || "Unknown User",
        });

        if (fileError) throw fileError;
      }

      // Auto-set checked_out_at based on document type
      if (uploadDocType === "BOL" && zoomedLoad.allPickupStops?.length > 0) {
        // BOL upload → set checked_out_at for first pickup stop
        const firstPickup = zoomedLoad.allPickupStops[0];
        if (firstPickup?.id) {
          const { error: updateError } = await supabase
            .from("pickup_drops")
            .update({ checked_out_at: checkoutTimestamp })
            .eq("id", firstPickup.id);

          if (updateError) {
            console.error("Error updating pickup checkout time:", updateError);
          }
        }
      } else if (uploadDocType === "POD" && zoomedLoad.allDeliveryStops?.length > 0) {
        // POD upload → count existing PODs to determine which delivery stop to update
        const { data: existingFiles } = await supabase
          .from("order_files")
          .select("id")
          .eq("order_id", zoomedLoad.orderId)
          .eq("file_category", "POD");

        const podCount = existingFiles?.length || 0;
        const deliveryIndex = podCount - 1; // 1st POD = index 0, 2nd POD = index 1, etc.

        if (deliveryIndex >= 0 && deliveryIndex < zoomedLoad.allDeliveryStops.length) {
          const deliveryStop = zoomedLoad.allDeliveryStops[deliveryIndex];
          if (deliveryStop?.id) {
            const { error: updateError } = await supabase
              .from("pickup_drops")
              .update({ checked_out_at: checkoutTimestamp })
              .eq("id", deliveryStop.id);

            if (updateError) {
              console.error("Error updating delivery checkout time:", updateError);
            }
          }
        }

        // Auto-set status to "delivered" when POD uploaded and all deliveries have PODs
        const totalDeliveries = zoomedLoad.allDeliveryStops?.length || 1;
        if (podCount >= totalDeliveries) {
          await supabase.from("orders").update({ status: "delivered" }).eq("id", zoomedLoad.orderId);
        }
      }

      toast({
        title: "Success",
        description: `${uploadFiles.length} file${uploadFiles.length > 1 ? "s" : ""} uploaded successfully`,
      });

      // BOL-specific: persist weight_bol and surface weight warnings
      if (uploadDocType === "BOL" && effectiveWeight != null) {
        await supabase.from("orders").update({ weight_bol: effectiveWeight }).eq("id", zoomedLoad.orderId);

        // Update local zoomedLoad weightBol so the alert in the dialog reflects the new value
        setZoomedLoad((prev) => (prev ? { ...prev, weightBol: effectiveWeight } : prev));

        const weightRc = zoomedLoad.weightRc ?? null;
        const warning = getWeightDiscrepancyWarning(effectiveWeight, weightRc);
        if (warning) {
          toast({
            title: "Check RC weight",
            description: warning,
            variant: "destructive",
          });
        }
        // Note: scale ticket reminder is surfaced via the grid indicator (needsScaleTicket),
        // so we don't block the BOL upload or show an error toast here.
      }

      // Clear module-level cache for this order, then refetch adapter query
      invalidateOrderFilesCacheForOrder(zoomedLoad.orderId);
      queryClient.invalidateQueries({ queryKey: ["adapter-order-files"], refetchType: "active" });

      // Optimistically update zoomedLoad state so dialog immediately reflects the new file
      setZoomedLoad((prev) => {
        if (!prev) return prev;
        const newFiles = uploadFiles.map((file, i) => ({
          id: `temp-${Date.now()}-${i}`,
          file_name: file.name,
          file_path: `${prev.orderId}/${uploadDocType}/${file.name}`,
          file_category: uploadDocType,
        }));
        const updatedOrderFiles = [...prev.orderFiles, ...newFiles];
        const updatedDocuments = [...new Set([...prev.documents, uploadDocType])];
        return { ...prev, orderFiles: updatedOrderFiles, documents: updatedDocuments };
      });

      // Optimistically inject new order_files into the reports + orders caches so
      // grid indicators (e.g. scale-ticket warning) update immediately without
      // waiting for the next realtime/refetch cycle.
      {
        const targetOrderId = zoomedLoad.orderId;
        const docType = uploadDocType;
        const syntheticFiles = uploadFiles.map((file, i) => ({
          id: `temp-upload-${Date.now()}-${i}`,
          file_name: file.name,
          file_path: `${targetOrderId}/${docType}/${file.name}`,
          file_category: docType,
        }));

        // Reports cache (truck rows with allOrders)
        const reportsCacheKeys = [["reports", "priority"], ["reports", "full"], ["reports"]];
        for (const key of reportsCacheKeys) {
          queryClient.setQueriesData({ queryKey: key }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((truck: any) => {
              if (!truck?.allOrders) return truck;
              return {
                ...truck,
                allOrders: truck.allOrders.map((o: any) => {
                  if (o.id !== targetOrderId) return o;
                  return { ...o, order_files: [...(o.order_files || []), ...syntheticFiles] };
                }),
              };
            });
          });
        }

        // Orders cache (flat list used by other views)
        queryClient.setQueriesData({ queryKey: ["orders"] }, (oldData: any) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          return oldData.map((o: any) => {
            if (o.id !== targetOrderId) return o;
            return { ...o, order_files: [...(o.order_files || []), ...syntheticFiles] };
          });
        });

        // Synthetic entries are reconciled by the order_files realtime channel
        // (which patches ["adapter-order-files"] in the date-window adapter).
        // We intentionally do NOT blanket-invalidate ["reports"] or ["orders"]
        // here: doing so caused multi-second grid flicker and, in some cases,
        // rows to vanish until manual refresh while the broad refetches raced
        // with realtime patches.
      }

      // Close dialog and reset state
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadDocType("");
      setPendingBolWeight(null);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel order handlers
  const handleCancelOrder = async () => {
    if (!zoomedLoad?.orderId) return;

    try {
      // Validate inputs
      const tonu = parseFloat(cancelFormData.tonu);
      const driverRate = parseFloat(cancelFormData.driverRate);
      const dhMiles = parseInt(cancelFormData.dhMiles);

      if (isNaN(tonu) || isNaN(driverRate) || isNaN(dhMiles)) {
        toast({
          title: "Error",
          description: "Please enter valid numbers for all fields",
          variant: "destructive",
        });
        return;
      }

      if (!cancelFormData.notes.trim()) {
        toast({
          title: "Error",
          description: "Notes are required",
          variant: "destructive",
        });
        return;
      }

      // First, get current order values to backup
      const { data: currentOrder, error: fetchError } = await supabase
        .from("orders")
        .select("freight_amount, driver_price, loaded_miles, dh_miles, tonu, tonu_driver, notes")
        .eq("id", zoomedLoad.orderId)
        .single();

      if (fetchError) throw fetchError;

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Save backup of original values
      const { error: backupError } = await supabase.from("canceled_orders_backup").insert({
        order_id: zoomedLoad.orderId,
        canceled_by: user?.id,
        original_freight_amount: currentOrder.freight_amount,
        original_driver_price: currentOrder.driver_price,
        original_loaded_miles: currentOrder.loaded_miles,
        original_dh_miles: currentOrder.dh_miles,
        original_tonu: currentOrder.tonu,
        original_tonu_driver: currentOrder.tonu_driver,
        original_notes: currentOrder.notes,
        cancel_tonu: tonu,
        cancel_driver_rate: driverRate,
        cancel_dh_miles: dhMiles,
        cancel_notes: cancelFormData.notes,
      });

      if (backupError) throw backupError;

      // Update order with cancel values
      const { error } = await supabase
        .from("orders")
        .update({
          tonu: tonu,
          tonu_driver: driverRate,
          dh_miles: dhMiles,
          notes: cancelFormData.notes,
          freight_amount: 0,
          driver_price: 0,
          loaded_miles: 0,
          mileage: dhMiles, // For canceled loads: loaded_miles (0) + dh_miles
          canceled: true,
        })
        .eq("id", zoomedLoad.orderId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Load cancelled successfully",
      });
      setCancelDialogOpen(false);
      setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
      setZoomedLoad(null);

      // Optimistic removal — idempotent with the subsequent realtime flush
      removeOrderFromGlobalStore(zoomedLoad.orderId);
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast({
        title: "Error",
        description: "Failed to cancel load",
        variant: "destructive",
      });
    }
  };

  // Revert cancellation handler
  const handleRevertCancellation = async () => {
    if (!zoomedLoad?.orderId) return;

    try {
      // Get the backup data
      const { data: backup, error: fetchError } = await supabase
        .from("canceled_orders_backup")
        .select("*")
        .eq("order_id", zoomedLoad.orderId)
        .order("canceled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!backup) {
        toast({
          title: "Warning",
          description: "No backup found for this order - reverting with current values",
        });
        // Just uncancel without restoring original values
        const { error: updateError } = await supabase
          .from("orders")
          .update({ canceled: false })
          .eq("id", zoomedLoad.orderId);
        if (updateError) throw updateError;
        toast({
          title: "Success",
          description: "Load uncanceled",
        });
        setZoomedLoad(null);
        // Realtime subscription handles cache update
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
        .eq("id", zoomedLoad.orderId);

      if (updateError) throw updateError;

      // Delete the backup record
      const { error: deleteError } = await supabase.from("canceled_orders_backup").delete().eq("id", backup.id);

      if (deleteError) console.error("Error deleting backup:", deleteError);

      toast({
        title: "Success",
        description: "Load cancellation reverted successfully",
      });
      setZoomedLoad(null);

      // Refresh reports list
      // Realtime subscription handles cache update
    } catch (error) {
      console.error("Error reverting cancellation:", error);
      toast({
        title: "Error",
        description: "Failed to revert cancellation",
        variant: "destructive",
      });
    }
  };

  // Lumper request handler
  const handleLumperRequest = async () => {
    if (!zoomedLoad?.orderId || !lumperAmount) return;

    const amount = parseFloat(lumperAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingLumper(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-efs-request", {
        body: {
          orderId: zoomedLoad.orderId,
          lumperAmount: amount,
          truckNumber: zoomedLoad.truckNumber,
          driverName: zoomedLoad.driverNames || "Unknown Driver",
          loadNumber: zoomedLoad.brokerLoadNumber || zoomedLoad.loadNumber,
          companyName: zoomedLoad.companyName,
          requesterEmail: profile?.email,
          requesterName: profile?.full_name,
        },
      });

      if (error) throw error;

      // Check for business logic errors (returned with success: false)
      if (data?.success === false) {
        toast({
          title: "Lumper request failed",
          description: data.error || "Request failed",
          variant: "destructive",
        });
        return;
      }

      // Show confirmation message
      setLumperConfirmation(data.confirmationMessage);

      toast({
        title: "Success",
        description: "Lumper request sent and order updated",
      });

      // Refresh reports list
      // Realtime subscription handles cache update
    } catch (error) {
      console.error("Error sending lumper request:", error);
      toast({
        title: "Error",
        description: "Failed to send lumper request",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingLumper(false);
    }
  };

  // Note: localStorage persistence for filters is handled by useReportsFilters hook
  // Removed: 30-second interval invalidation - it was causing UI blocking after every action
  // The real-time subscription already handles data updates
  const { toast } = useToast();
  const { open: sidebarOpen } = useSidebar();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const INITIAL_TRUCK_COUNT = 12;
  const LOAD_MORE_COUNT = 6;

  // Initialize visible trucks count when data loads (only for new dispatchers)
  useEffect(() => {
    // Skip expensive state updates during background fetch
    if (!groupedReports || isFetchingBackground) return;

    setVisibleTrucks((prev) => {
      const updated = { ...prev };
      let hasChanges = false;
      groupedReports.forEach((group) => {
        // Only set initial count for dispatchers we haven't seen yet
        if (updated[group.dispatcherId] === undefined) {
          updated[group.dispatcherId] = INITIAL_TRUCK_COUNT;
          hasChanges = true;
        }
      });
      return hasChanges ? updated : prev;
    });
  }, [groupedReports, isFetchingBackground]);

  // Setup intersection observer for lazy loading
  const handleLoadMore = useCallback((dispatcherId: string) => {
    setVisibleTrucks((prev) => ({
      ...prev,
      [dispatcherId]: (prev[dispatcherId] || INITIAL_TRUCK_COUNT) + LOAD_MORE_COUNT,
    }));
  }, []);

  // Miles away are now calculated by a background job every 10 minutes

  const handleEdit = (
    truckId: string,
    field: "pickup-location" | "pickup-datetime" | "delivery-location" | "delivery-datetime" | "note" | "miles-away",
    currentValue: string,
  ) => {
    setEditing({
      truckId,
      field,
      value: currentValue,
    });
  };
  const handleSave = async () => {
    if (!editing) return;
    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap((group) => group.trucks);
      const truck = allTrucks.find((t) => t.id === editing.truckId);

      if (editing.field === "miles-away") {
        const milesValue = parseFloat(editing.value);
        if (isNaN(milesValue) || milesValue < 0) {
          toast({
            title: "Invalid value",
            description: "Please enter a valid number for miles away",
            variant: "destructive",
          });
          return;
        }
        await updateTruckMilesAway.mutateAsync({
          truckId: editing.truckId,
          milesAway: milesValue,
        });
      } else if (editing.field === "note") {
        await updateTruckNote.mutateAsync({
          truckId: truck.id,
          note: editing.value.trim(),
        });
      } else if (editing.field.startsWith("pickup-") && truck?.pickup.id) {
        const updates: any = {};
        if (editing.field === "pickup-location") {
          updates.address = editing.value;
        } else if (editing.field === "pickup-datetime") {
          const dt = new Date(editing.value);
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
        }
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.pickup.id,
          address: updates.address || truck.pickup.location,
          ...(updates.datetime && {
            datetime: updates.datetime,
          }),
        });
      } else if (editing.field.startsWith("delivery-") && truck?.delivery.id) {
        const updates: any = {};
        if (editing.field === "delivery-location") {
          updates.address = editing.value;
        } else if (editing.field === "delivery-datetime") {
          const dt = new Date(editing.value);
          updates.datetime = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
        }
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.delivery.id,
          address: updates.address || truck.delivery.location,
          ...(updates.datetime && {
            datetime: updates.datetime,
          }),
        });
      }
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace("-", " ")} has been updated.`,
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive",
      });
    }
  };
  const handleCancel = () => {
    setEditing(null);
  };
  const getCalendarStartDate = (dispatcherId: string) => {
    if (calendarDates[dispatcherId]) {
      return calendarDates[dispatcherId];
    }
    // Default to 2 days before current day (Chicago time) to show 6 days
    return addDays(getChicagoToday(), -2);
  };
  const handleCalendarDateChange = useCallback(
    (dispatcherId: string, newDate: Date) => {
      const previousStartDate = calendarDates[dispatcherId] || addDays(getChicagoToday(), -2);

      // Update the per-dispatcher calendar position
      setCalendarDates((prev) => ({
        ...prev,
        [dispatcherId]: newDate,
      }));

      // Immediately trigger dispatcher-specific loading for the new visible date range
      // This loads only the orders for THIS dispatcher's drivers, not globally
      console.log(`[Reports] Calendar navigation for dispatcher ${dispatcherId} to ${format(newDate, "yyyy-MM-dd")}`);

      // Load orders for the start and end of the visible 6-day range
      loadDispatcherOrders(dispatcherId, newDate);
      loadDispatcherOrders(dispatcherId, addDays(newDate, 5));

      // Also expand the lost_day_notes window so Home Time / Game Over icons
      // appear for past/future dates the user scrolls into.
      if (newDate < previousStartDate) {
        ensureLostDayNotesForDateRange(newDate, addDays(previousStartDate, -1));
      } else if (newDate > previousStartDate) {
        ensureLostDayNotesForDateRange(addDays(previousStartDate, 6), addDays(newDate, 5));
      }
    },
    [calendarDates, loadDispatcherOrders],
  );
  const getStatusColors = (status: string) => {
    switch (status) {
      case "In Transit":
        return {
          bg: "bg-[hsl(var(--cell-transit))]",
          text: "text-[hsl(var(--cell-transit-foreground))]",
          border: "border-border",
        };
      case "Loading":
        return {
          bg: "bg-[hsl(var(--cell-loading))]",
          text: "text-[hsl(var(--cell-loading-foreground))]",
          border: "border-border",
        };
      case "Available":
        return {
          bg: "bg-[hsl(var(--cell-available))]",
          text: "text-[hsl(var(--cell-available-foreground))]",
          border: "border-border",
        };
      case "Maintenance":
        return {
          bg: "bg-[hsl(var(--cell-maintenance))]",
          text: "text-[hsl(var(--cell-maintenance-foreground))]",
          border: "border-border",
        };
      default:
        return {
          bg: "bg-muted",
          text: "text-muted-foreground",
          border: "border-border",
        };
    }
  };
  const renderTruckCalendarCells = (truck: any, startDate: Date, truckIndex: number, totalTrucks: number) => {
    const isFirstTruck = truckIndex === 0;
    const isLastTruck = truckIndex === totalTrucks - 1;
    const days = Array.from(
      {
        length: 6,
      },
      (_, i) => addDays(startDate, i),
    );
    const parseDate = (dateStr: string) => {
      if (dateStr === "—" || !dateStr) return null;
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    // Pickup/delivery cell colors use the imported helpers from helpers.ts
    // which handle force-complete via synthetic files in order_files.

    // Helper function to get lost day note for a specific date
    // NOTE: Some code paths (legacy vs date-window adapter) may provide notes under
    // `lost_day_notes` (snake_case) or `lostDayNotes` (camelCase). Always check both.
    const getLostDayNote = (date: Date): string => {
      const dateStr = format(date, "yyyy-MM-dd");
      const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
      // NOTE: Some code paths may provide `date` as an ISO timestamp string; normalize to YYYY-MM-DD.
      const lostDayNote = allLostDayNotes.find((note: any) => String(note?.date || "").slice(0, 10) === dateStr);

      // If no existing note, check if this is 1 day in future
      if (!lostDayNote) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        const oneDayFuture = addDays(today, 1);
        if (isSameDay(checkDate, oneDayFuture)) {
          return "No pre-book 🥺?";
        }
        // Show "Empty" for current day, "Lost day" for other days
        if (isSameDay(checkDate, today)) {
          return "Empty";
        }
        return "Lost day";
      }

      // If note_type is home_time, return "Home Time" regardless of note value
      if (lostDayNote.note_type === "home_time") {
        return "Home Time";
      }

      return lostDayNote.note || "Lost day";
    };

    // Helper function to check if a date has "game over" note (any type)
    const isGameOverDay = (
      date: Date,
    ): {
      isGameOver: boolean;
      type: GameOverType | null;
    } => {
      const dateStr = format(date, "yyyy-MM-dd");
      const allLostDayNotes: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
      // NOTE: Some code paths may provide `date` as an ISO timestamp string; normalize to YYYY-MM-DD.
      const lostDayNote = allLostDayNotes.find((note: any) => String(note?.date || "").slice(0, 10) === dateStr);
      const note = lostDayNote?.note?.toLowerCase();
      if (note === "game over - yard")
        return {
          isGameOver: true,
          type: "yard",
        };
      if (note === "game over - at road")
        return {
          isGameOver: true,
          type: "at_road",
        };
      return {
        isGameOver: false,
        type: null,
      };
    };

    // Helper function to check if pickup and delivery are on the same date
    const isSameDayPickupDelivery = (order: any) => {
      return order.pickupDate && order.deliveryDate && isSameDay(order.pickupDate, order.deliveryDate);
    };

    // Get all orders with their pickup/delivery dates sorted chronologically
    const ordersWithDates =
      truck.allOrders
        ?.map((order: any) => {
          // For transfer drivers, use their segment dates (from transfer-aware pickupStops/deliveryStops)
          // instead of the original order dates
          const firstPickupStop = order.pickupStops?.[0];
          const lastDeliveryStop = order.deliveryStops?.[order.deliveryStops?.length - 1];

          // Use first pickup stop datetime (transfer-aware) if available, otherwise fall back to order datetime
          const pickupDatetimeToUse = firstPickupStop?.datetime || order.pickup_datetime;
          const pickupParsed = pickupDatetimeToUse ? parseSimpleDateTime(pickupDatetimeToUse) : null;
          const pickupDate = pickupParsed
            ? new Date(
                pickupParsed.year,
                pickupParsed.month - 1,
                pickupParsed.day,
                pickupParsed.hours,
                pickupParsed.minutes,
              )
            : null;

          // Some loads store "00:00" as a placeholder time (especially when stop-level datetime is missing).
          // Treat those as "unknown time" for same-day ordering so they don't incorrectly become the previous load.
          const isPickupTimePlaceholder =
            !!pickupParsed &&
            pickupParsed.hours === 0 &&
            pickupParsed.minutes === 0 &&
            pickupDatetimeToUse === order.pickup_datetime &&
            typeof order.pickup_datetime === "string" &&
            /(T|\s)00:00(:00)?/.test(order.pickup_datetime);

          // Use last delivery stop datetime (transfer-aware) if available, otherwise fall back to order datetime
          const deliveryDatetimeToUse = lastDeliveryStop?.datetime || order.delivery_datetime;
          const deliveryDate = deliveryDatetimeToUse
            ? (() => {
                const parsed = parseSimpleDateTime(deliveryDatetimeToUse);
                return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
              })()
            : null;

          // Count pickup and delivery stops for this order on each date
          const pickupStopsByDate = new Map<string, number>();
          const deliveryStopsByDate = new Map<string, number>();
          order.pickupStops?.forEach((stop: any) => {
            if (stop.datetime) {
              const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
              pickupStopsByDate.set(stopDate, (pickupStopsByDate.get(stopDate) || 0) + 1);
            }
          });
          order.deliveryStops?.forEach((stop: any) => {
            if (stop.datetime) {
              const stopDate = formatDateTime(stop.datetime, "yyyy-MM-dd");
              deliveryStopsByDate.set(stopDate, (deliveryStopsByDate.get(stopDate) || 0) + 1);
            }
          });
          return {
            ...order,
            pickupDate,
            deliveryDate,
            isPickupTimePlaceholder,
            pickupStopsByDate,
            deliveryStopsByDate,
            pickupLocation: order.pickupStop
              ? order.pickupStop.city && order.pickupStop.state
                ? `${order.pickupStop.city}, ${order.pickupStop.state}`
                : order.pickupStop.address || "—"
              : "—",
            deliveryLocation: order.deliveryStop
              ? order.deliveryStop.city && order.deliveryStop.state
                ? `${order.deliveryStop.city}, ${order.deliveryStop.state}`
                : order.deliveryStop.address || "—"
              : "—",
          };
        })
        .sort((a, b) => {
          // Sort by pickup date
          if (!a.pickupDate && !b.pickupDate) return 0;
          if (!a.pickupDate) return 1;
          if (!b.pickupDate) return -1;

          // First: sort by day (ignores time)
          const aDay = new Date(a.pickupDate.getFullYear(), a.pickupDate.getMonth(), a.pickupDate.getDate()).getTime();
          const bDay = new Date(b.pickupDate.getFullYear(), b.pickupDate.getMonth(), b.pickupDate.getDate()).getTime();
          if (aDay !== bDay) return aDay - bDay;

          // Same day: if one pickup time is a placeholder "00:00", push it AFTER known times.
          if (!!a.isPickupTimePlaceholder !== !!b.isPickupTimePlaceholder) {
            return a.isPickupTimePlaceholder ? 1 : -1;
          }

          // Same day, both known (or both placeholder): use time
          const timeDiff = a.pickupDate.getTime() - b.pickupDate.getTime();
          if (timeDiff !== 0) return timeDiff;

          // Final tie-break: created_at for stable ordering
          const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
          return aCreated - bCreated;
        }) || [];

    // Helper to check if previous load's delivery is complete (dark green)
    const getPreviousLoadDeliveryStatus = (currentOrder: any): boolean => {
      const currentIndex = ordersWithDates.findIndex((o) => o.id === currentOrder.id);
      if (currentIndex <= 0) return true; // First load, no previous

      const previousOrder = ordersWithDates[currentIndex - 1];
      const hasPOD = previousOrder.order_files?.some((file: any) => file.file_category === "POD");
      return !!hasPOD; // Dark green if POD exists
    };

    // Find the first pickup date for this truck
    const firstPickupDate = ordersWithDates
      .filter((order) => order.pickupDate)
      .sort((a, b) => a.pickupDate.getTime() - b.pickupDate.getTime())[0]?.pickupDate;

    // Red box logic is based on actual current date, not the carousel viewing window
    const chicagoToday = getChicagoToday();
    const oneDayInFuture = addDays(chicagoToday, 1);
    return days.map((day, index) => {
      // Check if this day matches the 2-week block date
      const twoWeekBlockDate = truck.twoWeekBlockDate
        ? new Date(truck.twoWeekBlockDate.split("T")[0] + "T00:00:00")
        : null;
      const isBlockDay = twoWeekBlockDate && isSameDay(day, twoWeekBlockDate);

      // Check if this day has "game over" in lost day notes
      const gameOverCheck = isGameOverDay(day);
      const isGameOver = gameOverCheck.isGameOver;
      const gameOverType = gameOverCheck.type;

      // If this is the game over day, render black cell (full takeover)
      if (isGameOver) {
        const displayText =
          gameOverType === "yard"
            ? {
                line1: "Left truck",
                line2: "on the Yard",
              }
            : {
                line1: "Recovery",
                line2: "On the road",
              };
        const isToday = isSameDay(day, getChicagoToday());
        return (
          <td
            key={index}
            className={`border-b-[6px] border-gray-400 ${index > 0 ? "border-l border-border" : ""} ${index === 4 ? "border-r border-border" : ""} p-0 w-[12%] bg-black relative`}
            style={{
              minWidth: "120px",
              maxWidth: "120px",
              width: "120px",
              height: "64px",
            }}
          >
            {/* Red border overlay for today column */}
            {isToday && (
              <div
                className="absolute"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderLeft: "6px solid #dc2626",
                  borderRight: "6px solid #dc2626",
                  ...(isLastTruck
                    ? {
                        borderBottom: "6px solid #dc2626",
                      }
                    : {}),
                  zIndex: 100,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Top half */}
            <div
              className="border-b border-gray-400 flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line1}</div>
            </div>

            {/* Bottom half */}
            <div
              className="flex flex-col items-center justify-center bg-black"
              style={{
                height: "32px",
                minHeight: "32px",
                maxHeight: "32px",
              }}
            >
              <div className="text-[11px] font-bold text-white leading-tight">{displayText.line2}</div>
            </div>
          </td>
        );
      }

      // Find all orders for this day and categorize them
      const dayStr = format(day, "yyyy-MM-dd");

      // Check if order has any stops on this day
      const allDayOrders = ordersWithDates.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        return hasPickupOnDay || hasDeliveryOnDay;
      });

      // Separate same-day orders from different-day orders
      // Same-day means ALL pickups and deliveries happen on the same day
      // Orders that have BOTH pickup AND delivery on THIS specific day
      // (includes true same-day orders AND multi-day orders that happen to have stops on the same day)
      const ordersWithBothOnDay = allDayOrders.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        return hasPickupOnDay && hasDeliveryOnDay;
      });

      // True same-day orders (first pickup and first delivery on same day)
      const sameDayOrders = ordersWithBothOnDay.filter((order) => isSameDayPickupDelivery(order));

      // Orders with both stops on THIS day but NOT true same-day orders (multi-day loads with overlapping stops)
      // These need to show BOTH pickup and delivery cells on this day
      const mixedDayOrders = ordersWithBothOnDay.filter((order) => !isSameDayPickupDelivery(order));

      const pickupOnlyOrders = allDayOrders.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has pickup on this day but not delivery on this day
        return hasPickupOnDay && !hasDeliveryOnDay;
      });
      const deliveryOnlyOrders = allDayOrders.filter((order) => {
        const hasPickupOnDay = order.pickupStopsByDate?.has(dayStr);
        const hasDeliveryOnDay = order.deliveryStopsByDate?.has(dayStr);
        // Has delivery on this day but not pickup on this day
        return hasDeliveryOnDay && !hasPickupOnDay;
      });

      // Combine for rendering: pickups include mixedDayOrders, deliveries include mixedDayOrders
      const allPickupOrders = [...pickupOnlyOrders, ...mixedDayOrders];
      const allDeliveryOrders = [...deliveryOnlyOrders, ...mixedDayOrders];

      // Count total stops for this day (sum of all pickup/delivery stops from all orders)
      const totalPickupStops = allPickupOrders.reduce(
        (sum, order) => sum + (order.pickupStopsByDate?.get(dayStr) || 0),
        0,
      );
      const totalDeliveryStops = allDeliveryOrders.reduce(
        (sum, order) => sum + (order.deliveryStopsByDate?.get(dayStr) || 0),
        0,
      );

      // Check if this day is in transit (between pickup and delivery) for any order
      const inTransitOrders = ordersWithDates.filter((order) => {
        if (!order.pickupDate || !order.deliveryDate || isSameDayPickupDelivery(order)) return false;
        const dayTime = day.getTime();
        const pickupTime = order.pickupDate.getTime();
        const deliveryTime = order.deliveryDate.getTime();
        // Day is in transit if it's after pickup and before delivery
        // This includes future loads that haven't been picked up yet (2-3 day loads)
        return dayTime > pickupTime && dayTime < deliveryTime;
      });
      // Only show in-transit if there are no other orders on this day
      const isInTransit = inTransitOrders.length > 0 && allDayOrders.length === 0;

      // Check if any orders have rescheduling notes for THIS specific day
      const hasRescheduledOrders = [
        ...inTransitOrders,
        ...deliveryOnlyOrders,
        ...pickupOnlyOrders,
        ...sameDayOrders,
      ].some((order) => {
        if (!order.date_change_notes || !order.date_change_notes.includes("Supposed to deliver")) {
          return false;
        }
        // Extract the date from "Supposed to deliver on MM/DD/YYYY"
        const match = order.date_change_notes.match(/Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return false;

        const [, monthStr, dayStr, yearStr] = match;
        const supposedDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
        supposedDate.setHours(0, 0, 0, 0);

        // Check if this day matches the supposed delivery date
        return isSameDay(supposedDate, day);
      });

      // Check if there's a game over day before this day
      const hasGameOverBefore = days.slice(0, index).some((prevDay) => {
        const check = isGameOverDay(prevDay);
        return check.isGameOver;
      });

      // Check if this is a "continuing delivery" scenario
      // This happens when TODAY has deliveries and there are MORE deliveries coming after
      // Show ">>>" only if truck is still in transit (not on final delivery day)
      let shouldShowContinuingDelivery = false;
      if (allDeliveryOrders.length > 0) {
        // Check if any delivery order has MORE deliveries after this day for the SAME order
        shouldShowContinuingDelivery = allDeliveryOrders.some((order) => {
          if (!order.deliveryStopsByDate) return false;

          // Get all delivery dates for this order
          const deliveryDates = Array.from(order.deliveryStopsByDate.keys()).map((dateStr: string) => {
            const parts = dateStr.split("-");
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          });

          // Check if there are deliveries after today for THIS order
          const dayTime = day.getTime();
          return deliveryDates.some((deliveryDate) => deliveryDate.getTime() > dayTime);
        });
      }

      // Check if this empty day is BETWEEN deliveries (should show ">>>")
      // This applies to days with no pickups AND no deliveries, but between deliveries of the SAME order
      let isInTransitBetweenDeliveries = false;
      if (allPickupOrders.length === 0 && allDeliveryOrders.length === 0 && sameDayOrders.length === 0) {
        // Check if this day falls between deliveries of the same order
        isInTransitBetweenDeliveries = ordersWithDates.some((order) => {
          if (!order.deliveryStopsByDate || order.deliveryStopsByDate.size === 0) return false;

          // Get all delivery dates for this order
          const deliveryDates = Array.from(order.deliveryStopsByDate.keys())
            .map((dateStr: string) => {
              const parts = dateStr.split("-");
              return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            })
            .sort((a, b) => a.getTime() - b.getTime());

          if (deliveryDates.length < 2) return false; // Need at least 2 deliveries to be "between"

          const dayTime = day.getTime();
          const firstDeliveryTime = deliveryDates[0].getTime();
          const lastDeliveryTime = deliveryDates[deliveryDates.length - 1].getTime();

          // Day is between if it's after first delivery and before last delivery
          return dayTime > firstDeliveryTime && dayTime < lastDeliveryTime;
        });
      }

      // Check if pickup cell should show ">>>" for in-transit days
      // This should ONLY apply if the truck is on an active multi-day load
      // Not just any delivery in the future within the carousel window
      let shouldShowPickupInTransit = false;
      shouldShowPickupInTransit = ordersWithDates.some((order) => {
        if (!order.pickupDate || !order.pickupStopsByDate || !order.deliveryStopsByDate) return false;

        // Get the last delivery date for this order by finding the max date in deliveryStopsByDate
        const deliveryDates = Array.from(order.deliveryStopsByDate.keys()).map((dateStr: string) => {
          const parts = dateStr.split("-");
          return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        });

        if (deliveryDates.length === 0) return false;
        const lastDeliveryDate = new Date(Math.max(...deliveryDates.map((d) => d.getTime())));

        // Check if today is between pickup and last delivery (exclusive of both ends)
        const dayTime = day.getTime();
        const pickupTime = order.pickupDate.getTime();
        const lastDeliveryTime = lastDeliveryDate.getTime();

        // Must be after pickup and before or on last delivery
        if (dayTime <= pickupTime || dayTime > lastDeliveryTime) {
          return false; // Not in the active date range of this order
        }

        // Check if this specific day has a pickup or delivery for this order
        const hasPickupToday = order.pickupStopsByDate.has(dayStr);
        const hasDeliveryToday = order.deliveryStopsByDate.has(dayStr);

        // Show ">>>" only if it's in the date range but NOT a pickup/delivery day
        return !hasPickupToday && !hasDeliveryToday;
      });

      // Check if this is a missing pickup (red cell) - empty pickup cell after first pickup
      // Show red if no pickup on this day, regardless of transit state
      // IMPORTANT: Don't show red if truck is in transit (should show >>> instead)
      const isEmptyPickup = allPickupOrders.length === 0 && sameDayOrders.length === 0;
      const isAfterFirstPickup = firstPickupDate && day >= firstPickupDate;
      const isWithinTimeframe = day <= oneDayInFuture;
      const isOneDayFuture = isSameDay(day, oneDayInFuture);
      const isMissingPickup =
        isEmptyPickup &&
        isAfterFirstPickup &&
        isWithinTimeframe &&
        !isInTransit &&
        !hasGameOverBefore &&
        !shouldShowContinuingDelivery &&
        !shouldShowPickupInTransit &&
        !isOneDayFuture;

      // Check if there's a late (>= 16:00) delivery on this day — overrides red cell
      const hasLateIncompleteDelivery =
        isMissingPickup &&
        [...allDeliveryOrders, ...sameDayOrders].some((order: any) => {
          const deliveryStopsForDay =
            order.deliveryStops?.filter((stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr) || [];
          return deliveryStopsForDay.some((stop: any) => isLateDeliveryTime(stop.datetime));
        });

      // Check if this day is today (Chicago time) - always use actual today for the red border
      const isToday = isSameDay(day, chicagoToday);
      type LoadMatchSlot = { matched: boolean; orderId: string };
      const buildLoadMatchSlots = (sources: any[][], stopKey: "pickupStops" | "deliveryStops"): LoadMatchSlot[] => {
        if (!debouncedLoadNumberFilter) return [];
        const slots: LoadMatchSlot[] = [];
        for (const list of sources) {
          for (const order of list) {
            const stopsForDay = (order[stopKey] || []).filter(
              (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
            );
            const matched = orderMatchesLoadFilter(order, debouncedLoadNumberFilter);
            for (let i = 0; i < stopsForDay.length; i++) slots.push({ matched, orderId: order.id });
          }
        }
        return slots;
      };
      const deliveryLoadMatchSlots = buildLoadMatchSlots([allDeliveryOrders, sameDayOrders], "deliveryStops");
      const pickupLoadMatchSlots = buildLoadMatchSlots([sameDayOrders, allPickupOrders], "pickupStops");
      const hasHighlightedLoadSlot =
        deliveryLoadMatchSlots.some((slot) => slot.matched) || pickupLoadMatchSlots.some((slot) => slot.matched);
      // Apply left border to all cells except the first
      const showLeftBorder = index > 0;
      // Apply right border to the last day (5th day, index 4)
      const showRightBorder = index === 4;
      return (
        <td
          key={index}
          className={`border-b-[6px] border-gray-400 ${showLeftBorder ? "border-l border-border" : ""} p-0 relative`}
          style={{
            width: "120px",
            minWidth: "120px",
            maxWidth: "120px",
            verticalAlign: "top",
            ...(showRightBorder
              ? {
                  borderRight: "1px solid hsl(var(--border))",
                }
              : {}),
          }}
        >
          {/* Red border overlay for today column */}
          {isToday && !hasHighlightedLoadSlot && (
            <div
              className="absolute"
              style={{
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderLeft: "6px solid #dc2626",
                borderRight: "6px solid #dc2626",
                ...(isLastTruck
                  ? {
                      borderBottom: "6px solid #dc2626",
                    }
                  : {}),
                zIndex: 100,
                pointerEvents: "none",
              }}
            />
          )}
          {/* Golden outline overlay for load# search match (rendered outside cell, like today's red border) */}
          <div
            className="flex flex-row relative"
            style={{
              width: "120px",
              height: "64px",
            }}
          >
            {/* Two Week Notice vertical strip */}
            {isBlockDay && (
              <div
                className="bg-black flex items-center justify-center shrink-0"
                style={{
                  width:
                    allDeliveryOrders.length > 0 || allPickupOrders.length > 0 || sameDayOrders.length > 0
                      ? "40%"
                      : "100%",
                  height: "64px",
                }}
              >
                <span
                  className="text-[10px] font-semibold text-white whitespace-pre-line leading-tight text-center tracking-wide"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                >
                  TWO WEEK{"\n"}NOTICE
                </span>
              </div>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Delivery cell (top half) - NOW includes same-day delivery stops */}
              <div
                className={`border-b ${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${allDeliveryOrders.length > 0 || sameDayOrders.length > 0 ? "" : "bg-muted"} overflow-hidden`}
                style={{
                  height: "32px",
                  minHeight: "32px",
                  maxHeight: "32px",
                }}
              >
                {allDeliveryOrders.length > 0 || sameDayOrders.length > 0 ? (
                  <div className="flex-1 p-0 overflow-hidden flex flex-row">
                    {allDeliveryOrders.flatMap((order) => {
                      // Get all delivery stops for this day
                      const dayStr = format(day, "yyyy-MM-dd");
                      const deliveryStopsForDay =
                        order.deliveryStops?.filter(
                          (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                        ) || [];

                      // Render a separate cell for each delivery stop
                      return deliveryStopsForDay.map((stop: any, stopIdx: number) => {
                        const cellColor = getDeliveryCellColor(order, stop, lateDeliveries);
                        const totalCellsOnDay =
                          allDeliveryOrders.reduce(
                            (sum, o) =>
                              sum +
                              (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                                .length || 0),
                            0,
                          ) +
                          sameDayOrders.reduce(
                            (sum, o) =>
                              sum +
                              (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                                .length || 0),
                            0,
                          );
                        const isFirstDeliveryOfOrder =
                          !!order.deliveryStops?.[0] && stop.id === order.deliveryStops[0].id;
                        const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                        const showScaleTicketWarning =
                          isFirstDeliveryOfOrder &&
                          !hasPOD &&
                          needsScaleTicket(order.weightBol ?? order.weight_bol, order.order_files);
                        return (
                          <div
                            key={`delivery-${order.id}-stop-${stop.id || stopIdx}`}
                            className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`}
                            style={{
                              ...(totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}),
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (Date.now() - lastZoomedLoadCloseTime.current < 100) return;
                              const loadDetails = getLoadDetailsForZoom(order.id, truck);
                              if (loadDetails) setZoomedLoad(loadDetails);
                            }}
                          >
                            {showScaleTicketWarning && (
                              <div
                                className={`absolute top-0 ${isToday ? "right-1" : "right-0"} z-20 flex items-center justify-center bg-yellow-400 text-black rounded-bl rounded-tr leading-none`}
                                style={{ width: 12, height: 12 }}
                                title="Scale ticket required (BOL weight ≥ 30,000 lbs)"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                              </div>
                            )}
                            <div
                              className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                            >
                              {stop.city}, {stop.state}
                            </div>
                            <div
                              className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                            >
                              {formatTimeRange(stop.datetime, stop.end_datetime)}
                            </div>
                          </div>
                        );
                      });
                    })}
                    {sameDayOrders.flatMap((order) => {
                      // Get all delivery stops for this day
                      const dayStr = format(day, "yyyy-MM-dd");
                      const deliveryStopsForDay =
                        order.deliveryStops?.filter(
                          (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                        ) || [];

                      // Render a separate cell for each delivery stop
                      return deliveryStopsForDay.map((stop: any, stopIdx: number) => {
                        const cellColor = getDeliveryCellColor(order, stop, lateDeliveries);
                        const totalCellsOnDay =
                          allDeliveryOrders.reduce(
                            (sum, o) =>
                              sum +
                              (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                                .length || 0),
                            0,
                          ) +
                          sameDayOrders.reduce(
                            (sum, o) =>
                              sum +
                              (o.deliveryStops?.filter((s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr)
                                .length || 0),
                            0,
                          );
                        const isFirstDeliveryOfOrder =
                          !!order.deliveryStops?.[0] && stop.id === order.deliveryStops[0].id;
                        const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                        const showScaleTicketWarning =
                          isFirstDeliveryOfOrder &&
                          !hasPOD &&
                          needsScaleTicket(order.weightBol ?? order.weight_bol, order.order_files);
                        return (
                          <div
                            key={`delivery-same-day-${order.id}-stop-${stop.id || stopIdx}`}
                            className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`}
                            style={{
                              ...(totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}),
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (Date.now() - lastZoomedLoadCloseTime.current < 100) return;
                              const loadDetails = getLoadDetailsForZoom(order.id, truck);
                              if (loadDetails) setZoomedLoad(loadDetails);
                            }}
                          >
                            {showScaleTicketWarning && (
                              <div
                                className={`absolute top-0 ${isToday ? "right-1" : "right-0"} z-20 flex items-center justify-center bg-yellow-400 text-black rounded-bl rounded-tr leading-none`}
                                style={{ width: 12, height: 12 }}
                                title="Scale ticket required (BOL weight ≥ 30,000 lbs)"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                              </div>
                            )}
                            <div
                              className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                            >
                              {stop.city}, {stop.state}
                            </div>
                            <div
                              className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                            >
                              {formatTimeRange(stop.datetime, stop.end_datetime)}
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                ) : (
                  (() => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const allLostDayNotesDelivery: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
                    const homeTimeNote = allLostDayNotesDelivery.find(
                      (note: any) => String(note?.date || "").slice(0, 10) === dayStr && note.note_type === "home_time",
                    );
                    const hasHomeTime = !!homeTimeNote;

                    return (
                      <div
                        className={`text-xs h-full flex items-center justify-center ${isInTransit || shouldShowContinuingDelivery || isInTransitBetweenDeliveries ? (hasRescheduledOrders ? "bg-orange-500 text-black font-semibold" : "text-foreground font-semibold") : "text-muted-foreground cursor-pointer"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isInTransit && !shouldShowContinuingDelivery && !isInTransitBetweenDeliveries) {
                            setHomeTimeDialog({
                              truckId: truck.id,
                              truckNumber: truck.truckNumber || truck.truck_number || "Unknown",
                              driverId: truck.driverId,
                              date: dayStr,
                              isCurrentlyHomeTime: hasHomeTime,
                            });
                          }
                        }}
                      >
                        {(() => {
                          if (hasHomeTime) {
                            return <Home className="h-4 w-4" />;
                          }

                          if (isInTransit || shouldShowContinuingDelivery || isInTransitBetweenDeliveries) {
                            return hasRescheduledOrders ? "RESCHEDULED" : ">>>";
                          }

                          return "—";
                        })()}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Pickup cell (bottom half) - includes same-day orders */}
              {(() => {
                const dayStrPickup = format(day, "yyyy-MM-dd");
                const allLostDayNotesPickupBg: any[] = (truck.lost_day_notes ?? truck.lostDayNotes ?? []) as any[];
                const hasHomeTimePickup = allLostDayNotesPickupBg.some(
                  (note: any) =>
                    String(note?.date || "").slice(0, 10) === dayStrPickup && note.note_type === "home_time",
                );
                const pickupBgClass =
                  allPickupOrders.length > 0 || sameDayOrders.length > 0
                    ? ""
                    : isMissingPickup && !hasLateIncompleteDelivery && !hasHomeTimePickup
                      ? "bg-[hsl(0_72%_53%)] dark:bg-[hsl(var(--destructive-light))]"
                      : "bg-muted";
                return (
                  <div
                    className={`${!isToday && index > 0 ? "border-l" : ""} ${!isToday ? "border-r" : ""} border-gray-400 flex flex-col ${pickupBgClass} overflow-hidden`}
                    style={{
                      height: "32px",
                      minHeight: "32px",
                      maxHeight: "32px",
                    }}
                  >
                    {allPickupOrders.length > 0 || sameDayOrders.length > 0 ? (
                      <div className="flex-1 p-0 overflow-hidden flex flex-row" onClick={(e) => e.stopPropagation()}>
                        {sameDayOrders.flatMap((order) => {
                          const previousComplete = getPreviousLoadDeliveryStatus(order);
                          // Get all pickup stops for this day
                          const dayStr = format(day, "yyyy-MM-dd");
                          const pickupStopsForDay =
                            order.pickupStops?.filter(
                              (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                            ) || [];

                          // Render a separate cell for each pickup stop
                          return pickupStopsForDay.map((stop: any, stopIdx: number) => {
                            const cellColor = getPickupCellColor(order, previousComplete, latePickups, stop);
                            const totalCellsOnDay =
                              allPickupOrders.reduce(
                                (sum, o) =>
                                  sum +
                                  (o.pickupStops?.filter(
                                    (s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr,
                                  ).length || 0),
                                0,
                              ) +
                              sameDayOrders.reduce(
                                (sum, o) =>
                                  sum +
                                  (o.pickupStops?.filter(
                                    (s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr,
                                  ).length || 0),
                                0,
                              );
                            const isFirstPickupOfOrder =
                              !!order.pickupStops?.[0] && stop.id === order.pickupStops[0].id;
                            const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                            const showScaleTicketWarning =
                              isFirstPickupOfOrder &&
                              !hasPOD &&
                              needsScaleTicket(order.weightBol ?? order.weight_bol, order.order_files);
                            return (
                              <div
                                key={`pickup-same-day-${order.id}-stop-${stop.id || stopIdx}`}
                                className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`}
                                style={{
                                  ...(totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}),
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (Date.now() - lastZoomedLoadCloseTime.current < 100) return;
                                  const loadDetails = getLoadDetailsForZoom(order.id, truck);
                                  if (loadDetails) setZoomedLoad(loadDetails);
                                }}
                              >
                                {showScaleTicketWarning && (
                                  <div
                                    className={`absolute top-0 ${isToday ? "right-1" : "right-0"} z-20 flex items-center justify-center bg-yellow-400 text-black rounded-bl rounded-tr leading-none`}
                                    style={{ width: 12, height: 12 }}
                                    title="Scale ticket required (BOL weight ≥ 30,000 lbs)"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                                  </div>
                                )}
                                <div
                                  className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                                >
                                  {stop.city}, {stop.state}
                                </div>
                                <div
                                  className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                                >
                                  {formatTimeRange(stop.datetime, stop.end_datetime)}
                                </div>
                              </div>
                            );
                          });
                        })}
                        {allPickupOrders.flatMap((order) => {
                          const previousComplete = getPreviousLoadDeliveryStatus(order);
                          // Get all pickup stops for this day
                          const dayStr = format(day, "yyyy-MM-dd");
                          const pickupStopsForDay =
                            order.pickupStops?.filter(
                              (stop: any) => formatDateTime(stop.datetime, "yyyy-MM-dd") === dayStr,
                            ) || [];

                          // Render a separate cell for each pickup stop
                          return pickupStopsForDay.map((stop: any, stopIdx: number) => {
                            const cellColor = getPickupCellColor(order, previousComplete, latePickups, stop);
                            const totalCellsOnDay =
                              allPickupOrders.reduce(
                                (sum, o) =>
                                  sum +
                                  (o.pickupStops?.filter(
                                    (s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr,
                                  ).length || 0),
                                0,
                              ) +
                              sameDayOrders.reduce(
                                (sum, o) =>
                                  sum +
                                  (o.pickupStops?.filter(
                                    (s: any) => formatDateTime(s.datetime, "yyyy-MM-dd") === dayStr,
                                  ).length || 0),
                                0,
                              );
                            const isFirstPickupOfOrder =
                              !!order.pickupStops?.[0] && stop.id === order.pickupStops[0].id;
                            const hasPOD = order.order_files?.some((file: any) => file.file_category === "POD");
                            const showScaleTicketWarning =
                              isFirstPickupOfOrder &&
                              !hasPOD &&
                              needsScaleTicket(order.weightBol ?? order.weight_bol, order.order_files);
                            return (
                              <div
                                key={`pickup-${order.id}-stop-${stop.id || stopIdx}`}
                                className={`${cellColor} border rounded relative flex flex-col px-1 py-0.5 ${totalCellsOnDay === 1 ? "flex-1" : "shrink-0"} h-full cursor-pointer`}
                                style={{
                                  ...(totalCellsOnDay > 1 ? { width: `${100 / totalCellsOnDay}%` } : {}),
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (Date.now() - lastZoomedLoadCloseTime.current < 100) return;
                                  const loadDetails = getLoadDetailsForZoom(order.id, truck);
                                  if (loadDetails) setZoomedLoad(loadDetails);
                                }}
                              >
                                {showScaleTicketWarning && (
                                  <div
                                    className={`absolute top-0 ${isToday ? "right-1" : "right-0"} z-20 flex items-center justify-center bg-yellow-400 text-black rounded-bl rounded-tr leading-none`}
                                    style={{ width: 12, height: 12 }}
                                    title="Scale ticket required (BOL weight ≥ 30,000 lbs)"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                                  </div>
                                )}
                                <div
                                  className={`${totalCellsOnDay > 1 ? "text-[7px]" : "text-[9px]"} font-medium leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                                >
                                  {stop.city}, {stop.state}
                                </div>
                                <div
                                  className={`${totalCellsOnDay > 1 ? "text-[8px]" : "text-[8px]"} opacity-70 leading-tight ${totalCellsOnDay === 1 ? "truncate" : ""} ${isToday ? "pl-[2%]" : ""}`}
                                >
                                  {formatTimeRange(stop.datetime, stop.end_datetime)}
                                </div>
                              </div>
                            );
                          });
                        })}
                      </div>
                    ) : (
                      (() => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const allLostDayNotesPickup: any[] = (truck.lost_day_notes ??
                          truck.lostDayNotes ??
                          []) as any[];
                        const homeTimeNote = allLostDayNotesPickup.find(
                          (note: any) =>
                            String(note?.date || "").slice(0, 10) === dateStr && note.note_type === "home_time",
                        );
                        const hasHomeTime = !!homeTimeNote;
                        const hasDeliveryThisDay = allDeliveryOrders.length > 0;

                        return (
                          <div
                            className={`text-xs h-full flex items-center justify-center ${hasLateIncompleteDelivery ? "text-muted-foreground font-semibold" : isMissingPickup && !hasHomeTime ? "text-white dark:text-[hsl(var(--destructive-light-foreground))] font-semibold cursor-pointer" : isInTransit || shouldShowPickupInTransit ? (hasRescheduledOrders ? "bg-orange-500 text-black font-semibold" : "text-foreground font-semibold") : "text-muted-foreground cursor-pointer"}`}
                            onClick={(e) => {
                              e.stopPropagation();

                              if (hasLateIncompleteDelivery) {
                                // Do nothing — late delivery indicator is not clickable
                              } else if (isMissingPickup) {
                                const currentNote = getLostDayNote(day);
                                const allLostDayNotes: any[] = (truck.lost_day_notes ??
                                  truck.lostDayNotes ??
                                  []) as any[];
                                const lostDayNoteData = allLostDayNotes.find(
                                  (note: any) => String(note?.date || "").slice(0, 10) === dateStr,
                                );
                                const isCurrentlyHomeTime = lostDayNoteData?.note_type === "home_time";
                                const actualNoteValue = lostDayNoteData?.note || "";

                                setRedCellDialog({
                                  truckId: truck.id,
                                  truckNumber: truck.truckNumber || truck.truck_number || "Unknown",
                                  driverId: truck.driverId,
                                  date: dateStr,
                                  currentNote: currentNote,
                                });
                                // Show display text if no database value exists
                                setRedCellNote(actualNoteValue || currentNote);
                                setRedCellIsHomeTime(isCurrentlyHomeTime);
                              } else if (!isInTransit && !shouldShowPickupInTransit) {
                                // Open home time dialog for empty cells
                                setHomeTimeDialog({
                                  truckId: truck.id,
                                  truckNumber: truck.truckNumber || truck.truck_number || "Unknown",
                                  driverId: truck.driverId,
                                  date: dateStr,
                                  isCurrentlyHomeTime: hasHomeTime,
                                });
                              }
                            }}
                          >
                            {hasLateIncompleteDelivery ? (
                              <span className="text-center">
                                {">>"}
                                <span>LATE DEL</span>
                                {"<<"}
                              </span>
                            ) : isMissingPickup ? (
                              hasHomeTime ? (
                                <Home className="h-4 w-4" />
                              ) : (
                                <span className="line-clamp-2 text-center px-0.5" title={getLostDayNote(day)}>
                                  {getLostDayNote(day)}
                                </span>
                              )
                            ) : isInTransit || shouldShowPickupInTransit ? (
                              hasRescheduledOrders ? (
                                "RESCHEDULED"
                              ) : (
                                ">>>"
                              )
                            ) : hasHomeTime ? (
                              <Home className="h-4 w-4" />
                            ) : (
                              "—"
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          {/* Golden outline overlay for load# search match — rendered last so it always paints above today's red border */}
          {(() => {
            if (!debouncedLoadNumberFilter) return null;
            const deliverySlots = deliveryLoadMatchSlots;
            const pickupSlots = pickupLoadMatchSlots;
            if (!deliverySlots.some((s) => s.matched) && !pickupSlots.some((s) => s.matched)) return null;

            const dTotal = deliverySlots.length;
            const pTotal = pickupSlots.length;

            // Pair matched delivery+pickup slots only when their column ranges are identical.
            // If one half has multiple stops, a wider paired rectangle would incorrectly outline
            // neighboring stops from a different order.
            const pairedDelivery = new Map<number, { leftPct: number; widthPct: number; orderId: string }>();
            const pairedPickup = new Set<number>();
            if (dTotal > 0 && pTotal > 0) {
              for (let di = 0; di < dTotal; di++) {
                const d = deliverySlots[di];
                if (!d.matched) continue;
                const dWidth = 100 / dTotal;
                const dLeft = dWidth * di;
                const dRight = dLeft + dWidth;
                for (let pi = 0; pi < pTotal; pi++) {
                  const p = pickupSlots[pi];
                  if (!p.matched || pairedPickup.has(pi) || p.orderId !== d.orderId) continue;
                  const pWidth = 100 / pTotal;
                  const pLeft = pWidth * pi;
                  const pRight = pLeft + pWidth;
                  if (Math.abs(pLeft - dLeft) < 0.01 && Math.abs(pRight - dRight) < 0.01) {
                    pairedDelivery.set(di, { leftPct: dLeft, widthPct: dWidth, orderId: d.orderId });
                    pairedPickup.add(pi);
                    break;
                  }
                }
              }
            }

            const overlayStyle = {
              border: "3px solid hsl(var(--warning))",
              borderRadius: 4,
              boxShadow: "0 0 10px hsl(var(--warning) / 0.75)",
              boxSizing: "border-box" as const,
              zIndex: 10000,
            };
            const rangesOverlap = (aLeft: number, aWidth: number, bLeft: number, bWidth: number) =>
              aLeft < bLeft + bWidth && bLeft < aLeft + aWidth;

            const rects: JSX.Element[] = [];

            // Combined rectangles for paired same-order pickup+delivery slots
            pairedDelivery.forEach(({ leftPct, widthPct, orderId }, di) => {
              rects.push(
                <div
                  key={`gold-pair-${orderId}-${di}`}
                  className="absolute pointer-events-none"
                  style={{
                    ...overlayStyle,
                    top: -3,
                    left: `calc(${leftPct}% - 3px)`,
                    width: `calc(${widthPct}% + 6px)`,
                    height: 70,
                  }}
                />,
              );
            });

            // Standalone matched delivery slots (top half only)
            deliverySlots.forEach((slot, i) => {
              if (!slot.matched || pairedDelivery.has(i)) return;
              const widthPct = 100 / dTotal;
              const leftPct = widthPct * i;
              // Drop bottom border only when this delivery slot is fully covered by a same-order pickup
              const pickupWidthPct = 100 / pTotal;
              const fullyCovered = pickupSlots.some((pickupSlot, pickupIndex) => {
                if (!pickupSlot.matched || pickupSlot.orderId !== slot.orderId) return false;
                const pLeft = pickupWidthPct * pickupIndex;
                const pRight = pLeft + pickupWidthPct;
                return pLeft <= leftPct + 0.01 && pRight >= leftPct + widthPct - 0.01;
              });
              rects.push(
                <div
                  key={`gold-d-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    ...overlayStyle,
                    ...(fullyCovered ? { borderBottom: 0 } : {}),
                    top: -3,
                    left: `calc(${leftPct}% - 3px)`,
                    width: `calc(${widthPct}% + 6px)`,
                    height: fullyCovered ? 35 : 38,
                  }}
                />,
              );
            });

            // Standalone matched pickup slots (bottom half only)
            pickupSlots.forEach((slot, i) => {
              if (!slot.matched || pairedPickup.has(i)) return;
              const widthPct = 100 / pTotal;
              const leftPct = widthPct * i;
              const deliveryWidthPct = 100 / dTotal;
              const fullyCovered = deliverySlots.some((deliverySlot, deliveryIndex) => {
                if (!deliverySlot.matched || deliverySlot.orderId !== slot.orderId) return false;
                const dLeft = deliveryWidthPct * deliveryIndex;
                const dRight = dLeft + deliveryWidthPct;
                return dLeft <= leftPct + 0.01 && dRight >= leftPct + widthPct - 0.01;
              });
              rects.push(
                <div
                  key={`gold-p-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    ...overlayStyle,
                    ...(fullyCovered ? { borderTop: 0 } : {}),
                    top: fullyCovered ? 32 : 29,
                    left: `calc(${leftPct}% - 3px)`,
                    width: `calc(${widthPct}% + 6px)`,
                    height: fullyCovered ? 35 : 38,
                  }}
                />,
              );
            });

            return <>{rects}</>;
          })()}
        </td>
      );
    });
  };

  // Filter reports by office - memoized (must be before any early returns)
  const filterReportsByOffice = useMemo(() => {
    return (office: string) => {
      if (!groupedReports) return [];
      const allowed = expandOffice(office);
      let filtered = groupedReports.filter((group) => allowed.includes(group.office));

      // Apply dispatch name filter
      if (debouncedDispatchNameFilter) {
        filtered = filtered.filter((group) =>
          group.dispatcher.toLowerCase().includes(debouncedDispatchNameFilter.toLowerCase()),
        );
      }

      // Apply company filter (driver's company)
      if (companyFilter) {
        filtered = filtered
          .map((group) => ({
            ...group,
            trucks: group.trucks.filter((truck) => truck.companyName === companyFilter),
          }))
          .filter((group) => group.trucks.length > 0);
      }

      // Apply truck/driver and load number filters
      if (debouncedTruckDriverFilter || debouncedLoadNumberFilter) {
        filtered = filtered
          .map((group) => {
            const filteredTrucks = group.trucks.filter((truck) => {
              // Check truck/driver filter
              if (debouncedTruckDriverFilter) {
                const searchLower = debouncedTruckDriverFilter.toLowerCase();
                const isNumericSearch = /^\d+$/.test(debouncedTruckDriverFilter);

                // For numeric searches, use exact match for truck number
                const matchesTruck = isNumericSearch
                  ? truck.truckNumber?.toLowerCase() === searchLower
                  : truck.truckNumber?.toLowerCase().includes(searchLower);
                const matchesDriver = truck.driver?.toLowerCase().includes(searchLower);
                if (!matchesTruck && !matchesDriver) return false;
              }

              // Check load number filter (searches both internal and broker load numbers)
              if (debouncedLoadNumberFilter) {
                const searchTerm = debouncedLoadNumberFilter.toLowerCase();
                const hasMatchingLoad = truck.allOrders?.some((order: any) => {
                  // Exclude canceled orders unless they still appear as red cells in reports
                  // (canceled with pickup today — i.e., no next load yet). Mirrors getPickupCellColor logic.
                  if (order.canceled) {
                    const pickupDateStr =
                      order.pickupStops?.[0]?.datetime || order.pickup_datetime || order.pickupStop?.datetime;
                    if (!pickupDateStr) return false;
                    const datePart = String(pickupDateStr).substring(0, 10);
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                    if (datePart !== todayStr) return false;
                  }
                  // Check broker load number
                  const brokerMatch = String(order.broker_load_number || "")
                    .toLowerCase()
                    .includes(searchTerm);
                  if (brokerMatch) return true;

                  // Check internal load number with suffix (e.g., "123-BFP")
                  const internalLoadNumber = order.internal_load_number;
                  const companyName = order.company?.name || order.driver1?.company?.name;
                  if (internalLoadNumber) {
                    const formattedInternal = formatInternalLoadNumber(internalLoadNumber, companyName).toLowerCase();
                    if (formattedInternal.includes(searchTerm)) return true;
                    // Also check raw internal number
                    if (String(internalLoadNumber).toLowerCase().includes(searchTerm)) return true;
                  }
                  return false;
                });
                if (!hasMatchingLoad) return false;
              }
              return true;
            });
            return {
              ...group,
              trucks: filteredTrucks,
            };
          })
          .filter((group) => group.trucks.length > 0);
      }

      // Apply proximity address filter
      if (proximityMatchedTrucks) {
        filtered = filtered
          .map((group) => ({
            ...group,
            trucks: group.trucks.filter((truck) => proximityMatchedTrucks.has(truck.id)),
          }))
          .filter((group) => group.trucks.length > 0);
      }

      return filtered;
    };
  }, [
    groupedReports,
    debouncedTruckDriverFilter,
    debouncedDispatchNameFilter,
    debouncedLoadNumberFilter,
    companyFilter,
    proximityMatchedTrucks,
    expandOffice,
  ]);

  // Collect all driver IDs for weekly plans hook
  const allDriverIds = useMemo(() => {
    if (!groupedReports) return [];
    const ids = new Set<string>();
    groupedReports.forEach((group) => {
      group.trucks.forEach((truck: any) => {
        if (truck.driverId) ids.add(truck.driverId);
        if (truck.driver2Id) ids.add(truck.driver2Id);
      });
    });
    return Array.from(ids);
  }, [groupedReports]);

  // Weekly plans hook removed — no longer used.
  const hasWeeklyPlan = (_id: string) => false;

  // Check for late pickups/deliveries using eta_minutes from trucks table
  // This runs client-side using already-loaded truck data (no additional API calls)
  // IMPORTANT: Skip while background is fetching to prevent UI freeze
  useEffect(() => {
    if (!groupedReports) return;
    // Skip expensive late check while background data is loading to prevent freeze
    if (isFetchingBackground) return;

    const checkLateStops = () => {
      const newLatePickups = new Set<string>();
      const newLateDeliveries = new Set<string>();
      const newLateTrucks = new Set<string>();
      const lateStopsToNotify: Array<{
        orderId: string;
        stopType: "pickup" | "delivery";
        stopId?: string;
        truckId: string;
        truckNumber: string;
        driverName: string;
        dispatcherEmail: string;
        dispatcherName: string;
        stopAddress: string;
        scheduledTime: string;
        estimatedArrival: string;
        loadNumber: string;
        currentMiles?: number;
      }> = [];

      // Track stops to auto-mark as arrived (truck within 1 mile)
      const stopsToAutoArrive: Array<{ stopId: string; stopType: "pickup" | "delivery" }> = [];

      // Collect new notified keys to batch update
      const newNotifiedKeys: string[] = [];

      // Get current time as naive Chicago wall time (no TZ conversion)
      const chicagoNow = toZonedTime(new Date(), "America/Chicago");
      const now = chicagoNow;
      const todayDateStr = `${chicagoNow.getFullYear()}-${String(chicagoNow.getMonth() + 1).padStart(2, "0")}-${String(chicagoNow.getDate()).padStart(2, "0")}`;

      // Helper to parse datetime as naive Chicago wall time (no timezone conversion)
      // Database stores times that represent Chicago local time
      const parseAsChicagoTime = (dateStr: string): Date => {
        const cleanDate = dateStr.replace(/[+-]\d{2}:\d{2}$|[+-]\d{4}$|Z$/, "");
        const [datePart, timePart] = cleanDate.includes("T") ? cleanDate.split("T") : cleanDate.split(" ");
        const [year, month, day] = datePart.split("-").map(Number);
        const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0);
      };

      // Helper to check if a stop's date is today or in the future (Chicago time)
      const isStopDateCurrentOrFuture = (dateStr: string): boolean => {
        const cleanDate = dateStr.replace(/[+-]\d{2}:\d{2}$|[+-]\d{4}$|Z$/, "");
        const datePart = cleanDate.includes("T") ? cleanDate.split("T")[0] : cleanDate.split(" ")[0];
        return datePart >= todayDateStr;
      };

      // Iterate through all trucks
      Object.values(groupedReports).forEach((group: any) => {
        group.trucks?.forEach((truck: any) => {
          // Skip trucks without miles_away data
          if (!truck.milesAway && truck.milesAway !== 0) return;

          // Determine the current order for this truck (same logic as rendering)
          // Filter out canceled, game over, AND already delivered orders
          const allSortedOrders =
            truck.allOrders
              ?.filter((order: any) => !order.canceled && order.notes !== "GAME|OVER" && order.status !== "delivered")
              .sort((a: any, b: any) => {
                const aDate = a.pickupStop?.datetime || "";
                const bDate = b.pickupStop?.datetime || "";
                return aDate.localeCompare(bDate);
              }) || [];

          if (allSortedOrders.length === 0) return;

          let currentOrder: any = undefined;
          const lastOrder = allSortedOrders[allSortedOrders.length - 1];
          const lastOrderHasBOL = lastOrder?.order_files?.some((f: any) => f.file_category === "BOL");

          if (lastOrderHasBOL) {
            currentOrder = lastOrder;
          } else if (allSortedOrders.length >= 2) {
            const previousOrder = allSortedOrders[allSortedOrders.length - 2];
            const previousHasPOD = previousOrder?.order_files?.some((f: any) => f.file_category === "POD");

            if (previousHasPOD) {
              currentOrder = lastOrder;
            } else {
              const lastWithBOL = [...allSortedOrders]
                .reverse()
                .find((order: any) => order.order_files?.some((file: any) => file.file_category === "BOL"));
              currentOrder = lastWithBOL || lastOrder;
            }
          } else {
            currentOrder = lastOrder;
          }

          if (!currentOrder) return;

          // Double-check: skip if order is already delivered
          if (currentOrder.status === "delivered") return;

          // Check if current order has POD uploaded (means delivery completed)
          const hasPOD = currentOrder.order_files?.some((f: any) => f.file_category === "POD");
          if (hasPOD) return;

          const hasBOL = currentOrder.order_files?.some((f: any) => f.file_category === "BOL");

          // Check pickup stops (only if BOL not yet uploaded)
          if (!hasBOL) {
            const pickupStops = currentOrder.pickupStops || (currentOrder.pickupStop ? [currentOrder.pickupStop] : []);
            pickupStops.forEach((stop: any) => {
              if (stop.arrived_at) return;

              const endDatetime = stop.end_datetime || stop.datetime;
              if (!endDatetime) return;
              if (!isStopDateCurrentOrFuture(endDatetime)) return;

              const scheduledEnd = parseAsChicagoTime(endDatetime);
              if (isNaN(scheduledEnd.getTime())) return;

              // Auto-mark arrival if truck is within 1 mile
              if (truck.milesAway !== undefined && truck.milesAway > 0 && truck.milesAway < 1 && stop.id) {
                stopsToAutoArrive.push({ stopId: stop.id, stopType: "pickup" });
              }

              // ETA-based late check: skip if miles < 10
              const milesAway = truck.milesAway || 0;
              if (milesAway < 10) return;

              const travelTimeMs = (milesAway / 60) * 3600000;
              const etaDate = new Date(now.getTime() + travelTimeMs);
              const ninetyMinMs = 90 * 60 * 1000;
              const isLate = etaDate.getTime() > scheduledEnd.getTime() + ninetyMinMs;

              if (!isLate) return;

              // Next-stop proximity caveat: if distance to next stop < next order's DH + 10, skip
              if (stop.id) {
                const nextStopInfo = getNextStopInSequence(stop.id, currentOrder, allSortedOrders);
                if (nextStopInfo && stop.latitude && stop.longitude) {
                  const distToNext = haversineDistanceMiles(
                    stop.latitude,
                    stop.longitude,
                    nextStopInfo.latitude,
                    nextStopInfo.longitude,
                  );
                  const threshold = nextStopInfo.nextOrderDhMiles + 10;
                  if (distToNext < threshold) return;
                }
              }

              newLatePickups.add(currentOrder.id);
              newLateTrucks.add(truck.id);

              const notifyKey = currentOrder.id;
              if (!notifiedLateStopsRef.current.has(notifyKey) && truck.dispatcherEmail) {
                lateStopsToNotify.push({
                  orderId: currentOrder.id,
                  stopType: "pickup",
                  stopId: stop.id,
                  truckId: truck.id,
                  truckNumber: truck.truckNumber,
                  driverName: truck.driver || "Unknown",
                  dispatcherEmail: truck.dispatcherEmail,
                  dispatcherName: truck.dispatcherName || "Dispatcher",
                  stopAddress: `${stop.city || ""}, ${stop.state || ""}`.trim() || stop.address || "Unknown",
                  scheduledTime: format(scheduledEnd, "MMM dd, yyyy HH:mm"),
                  estimatedArrival: format(etaDate, "MMM dd, yyyy HH:mm"),
                  loadNumber: currentOrder.loadDetails?.loadNumber || currentOrder.load_number || "N/A",
                  currentMiles: milesAway,
                });
                newNotifiedKeys.push(notifyKey);
              }
            });
          }

          // Check delivery stops (only if BOL is uploaded)
          if (hasBOL) {
            const deliveryStops =
              currentOrder.deliveryStops || (currentOrder.deliveryStop ? [currentOrder.deliveryStop] : []);
            deliveryStops.forEach((stop: any) => {
              if (stop.arrived_at) return;

              const endDatetime = stop.end_datetime || stop.datetime;
              if (!endDatetime) return;
              if (!isStopDateCurrentOrFuture(endDatetime)) return;

              const scheduledEnd = parseAsChicagoTime(endDatetime);
              if (isNaN(scheduledEnd.getTime())) return;

              // Auto-mark arrival if truck is within 1 mile
              if (truck.milesAway !== undefined && truck.milesAway > 0 && truck.milesAway < 1 && stop.id) {
                stopsToAutoArrive.push({ stopId: stop.id, stopType: "delivery" });
              }

              // ETA-based late check: skip if miles < 10
              const milesAway = truck.milesAway || 0;
              if (milesAway < 10) return;

              const travelTimeMs = (milesAway / 60) * 3600000;
              const etaDate = new Date(now.getTime() + travelTimeMs);
              const ninetyMinMs = 90 * 60 * 1000;
              const isLate = etaDate.getTime() > scheduledEnd.getTime() + ninetyMinMs;

              if (!isLate) return;

              // Next-stop proximity caveat: if distance to next stop < next order's DH + 10, skip
              if (stop.id) {
                const nextStopInfo = getNextStopInSequence(stop.id, currentOrder, allSortedOrders);
                if (nextStopInfo && stop.latitude && stop.longitude) {
                  const distToNext = haversineDistanceMiles(
                    stop.latitude,
                    stop.longitude,
                    nextStopInfo.latitude,
                    nextStopInfo.longitude,
                  );
                  const threshold = nextStopInfo.nextOrderDhMiles + 10;
                  if (distToNext < threshold) return;
                }
              }

              newLateDeliveries.add(currentOrder.id);
              newLateTrucks.add(truck.id);

              const notifyKey = `${currentOrder.id}-delivery-${stop.id || "main"}`;
              if (!notifiedLateStopsRef.current.has(notifyKey) && truck.dispatcherEmail) {
                lateStopsToNotify.push({
                  orderId: currentOrder.id,
                  stopType: "delivery",
                  stopId: stop.id,
                  truckId: truck.id,
                  truckNumber: truck.truckNumber,
                  driverName: truck.driver || "Unknown",
                  dispatcherEmail: truck.dispatcherEmail,
                  dispatcherName: truck.dispatcherName || "Dispatcher",
                  stopAddress: `${stop.city || ""}, ${stop.state || ""}`.trim() || stop.address || "Unknown",
                  scheduledTime: format(scheduledEnd, "MMM dd, yyyy HH:mm"),
                  estimatedArrival: format(etaDate, "MMM dd, yyyy HH:mm"),
                  loadNumber: currentOrder.loadDetails?.loadNumber || currentOrder.load_number || "N/A",
                  currentMiles: milesAway,
                });
                newNotifiedKeys.push(notifyKey);
              }
            });
          }
        });
      });

      // Batch update all state in a low-priority transition to avoid blocking UI
      startTransition(() => {
        setLatePickups(newLatePickups);
        setLateDeliveries(newLateDeliveries);
        setLateTrucks(newLateTrucks);

        // Batch update notified keys (update ref first to avoid re-triggering effect)
        if (newNotifiedKeys.length > 0) {
          // Update ref immediately (synchronous, no re-render)
          newNotifiedKeys.forEach((key) => notifiedLateStopsRef.current.add(key));

          // Also update state for any components that read it
          setNotifiedLateStops((prev) => {
            const updated = new Set(prev);
            newNotifiedKeys.forEach((key) => updated.add(key));
            return updated;
          });
        }
      });

      // Send late notifications
      // Late email notifications disabled
      // const sendNotificationsSequentially = async () => { ... };
      // if (lateStopsToNotify.length > 0) { sendNotificationsSequentially(); }

      // Auto-mark arrivals for trucks within 1 mile (fire and forget)
      if (stopsToAutoArrive.length > 0) {
        const processAutoArrivals = async () => {
          for (const { stopId, stopType } of stopsToAutoArrive) {
            try {
              await updatePickupDropArrival.mutateAsync({ pickupDropId: stopId });
              console.log(`📍 Auto-marked ${stopType} arrival for stop ${stopId} (truck within 1 mile)`);
            } catch (error) {
              console.error(`Failed to auto-mark ${stopType} arrival:`, error);
            }
          }
        };
        processAutoArrivals();
      }
    };

    // Run immediately
    checkLateStops();

    // Re-run every 60 seconds
    const interval = setInterval(checkLateStops, 60 * 1000);
    return () => clearInterval(interval);
    // NOTE: updatePickupDropArrival is intentionally excluded - it's a mutation with unstable reference
    // NOTE: notifiedLateStops is intentionally excluded from deps to prevent infinite loop
    // The effect uses functional setState to access latest value without retriggering
  }, [groupedReports, isFetchingBackground]);

  // Auto-switch logic is now handled by useAutoSwitchOffice hook

  // Only get filtered reports for the active tab
  const activeOfficeReports = useMemo(() => {
    const reports = filterReportsByOffice(activeTab);

    // Two week notice filter: show only trucks with drivers on 2-week notice
    if (showTwoWeekNotice) {
      return reports
        .map((group) => {
          const twoWeekNoticeTrucks = group.trucks.filter((truck) => {
            return truck.twoWeekBlockDate != null;
          });
          return {
            ...group,
            trucks: twoWeekNoticeTrucks,
          };
        })
        .filter((group) => group.trucks.length > 0);
    }

    // Late trucks filter: show only trucks that are late for current pickup/delivery
    if (showLateTrucks) {
      return reports
        .map((group) => {
          const lateFilteredTrucks = group.trucks.filter((truck) => {
            return lateTrucks.has(truck.id);
          });
          return {
            ...group,
            trucks: lateFilteredTrucks,
          };
        })
        .filter((group) => group.trucks.length > 0);
    }

    // New drivers filter: show only trucks with no loads ever OR exactly 1 load with pickup today
    if (showNewDrivers) {
      const today = getChicagoToday();
      return reports
        .map((group) => {
          const newDriverTrucks = group.trucks.filter((truck) => {
            // Get all non-GAME|OVER orders
            const realOrders = truck.allOrders?.filter((order: any) => order.notes !== "GAME|OVER") || [];

            // Case 1: No loads ever - brand new driver
            if (realOrders.length === 0) {
              return true;
            }

            // Case 2: Exactly 1 load with pickup today - first load starting today
            if (realOrders.length === 1) {
              const order = realOrders[0];
              if (!order.pickupStop?.datetime) return false;
              // Use parseSimpleDateTime to avoid timezone conversion
              const parsed = parseSimpleDateTime(order.pickupStop.datetime);
              const pickupDate = new Date(parsed.year, parsed.month - 1, parsed.day);
              return isSameDay(pickupDate, today);
            }

            // More than 1 load = experienced driver
            return false;
          });
          return {
            ...group,
            trucks: newDriverTrucks,
          };
        })
        .filter((group) => group.trucks.length > 0);
    }

    // Home time filter: show trucks with drivers that have active home-time
    // entries (driver_problems) OR have a home_time note for TODAY.
    if (showProblems) {
      const todayStr = format(getChicagoToday(), "yyyy-MM-dd");
      return reports
        .map((group) => {
          const problemTrucks = group.trucks.filter((truck) => {
            if (truck.driverId && hasDriverProblem(truck.driverId)) return true;
            const notes: any[] = (truck.lost_day_notes ?? (truck as any).lostDayNotes ?? []) as any[];
            return notes.some(
              (note: any) => note?.note_type === "home_time" && String(note?.date || "").slice(0, 10) === todayStr,
            );
          });
          return {
            ...group,
            trucks: problemTrucks,
          };
        })
        .filter((group) => group.trucks.length > 0);
    }

    if (!showEmptyTrucks) {
      return reports;
    }

    // Filter to show only trucks with red cells for today (any text: "Empty", "Lost day", etc.)
    // Must match the exact display logic for isMissingPickup
    const today = getChicagoToday();
    const tomorrow = addDays(today, 1);
    const todayStr = format(today, "yyyy-MM-dd");
    return reports
      .map((group) => {
        const emptyTrucks = group.trucks.filter((truck) => {
          // Find the first pickup date for this truck
          const firstPickupDate = truck.allOrders
            ?.filter((order: any) => order.pickupStop?.datetime && order.notes !== "GAME|OVER")
            .map((order: any) => {
              const parsed = parseSimpleDateTime(order.pickupStop.datetime);
              return new Date(parsed.year, parsed.month - 1, parsed.day);
            })
            .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

          // Check if today is after first pickup
          const isAfterFirstPickup = firstPickupDate && today >= firstPickupDate;
          if (!isAfterFirstPickup) {
            return false; // Only show trucks that have had at least one pickup
          }

          // Check if today is within timeframe (today or tomorrow only)
          const isWithinTimeframe = today.getTime() <= tomorrow.getTime();
          if (!isWithinTimeframe) {
            return false;
          }

          // Check if truck is in transit today
          const isInTransitToday = truck.allOrders?.some((order: any) => {
            if (order.notes === "GAME|OVER") return false;
            if (!order.pickupStop?.datetime || !order.deliveryStop?.datetime) return false;

            // Parse dates the same way as formatDateTime (without timezone conversion)
            const pickupParsed = parseSimpleDateTime(order.pickupStop.datetime);
            const pickupDate = new Date(pickupParsed.year, pickupParsed.month - 1, pickupParsed.day);

            const deliveryParsed = parseSimpleDateTime(order.deliveryStop.datetime);
            const deliveryDate = new Date(deliveryParsed.year, deliveryParsed.month - 1, deliveryParsed.day);

            // In transit if between pickup and delivery (exclusive of both endpoints)
            return today.getTime() > pickupDate.getTime() && today.getTime() < deliveryDate.getTime();
          });
          if (isInTransitToday) {
            return false; // Exclude in-transit trucks
          }

          // Check if truck has any pickup today (check ALL pickup stops for multi-stop loads)
          // NOTE: Canceled orders should NOT count as having a pickup - truck is still empty
          const hasPickupToday = truck.allOrders?.some((order: any) => {
            if (order.notes === "GAME|OVER") return false;
            // Canceled orders don't count as having a pickup
            if (order.canceled) return false;

            // Check all pickup stops (handles multi-stop loads)
            const allPickupStops = order.pickupStops || (order.pickupStop ? [order.pickupStop] : []);

            return allPickupStops.some((stop: any) => {
              if (!stop?.datetime) return false;
              const parsed = parseSimpleDateTime(stop.datetime);
              const pickupDate = new Date(parsed.year, parsed.month - 1, parsed.day);
              return isSameDay(pickupDate, today);
            });
          });
          if (hasPickupToday) {
            return false; // Must have NO pickup today
          }

          // Check for game over before today
          const hasGameOverBefore = truck.lost_day_notes?.some((note: any) => {
            // Parse date without timezone conversion
            const [year, month, day] = note.date.split("-").map(Number);
            const noteDate = new Date(year, month - 1, day);
            if (noteDate >= today) return false; // Only check days before today
            const noteText = note.note?.toLowerCase() || "";
            return noteText.includes("game over");
          });
          if (hasGameOverBefore) {
            return false; // Exclude if game over occurred before today
          }

          // At this point, truck would show a red cell for today
          // (could be "Empty", "Lost day", "Home Time", etc.)
          return true;
        });
        return {
          ...group,
          trucks: emptyTrucks,
        };
      })
      .filter((group) => group.trucks.length > 0); // Only show dispatchers with empty trucks
  }, [
    activeTab,
    filterReportsByOffice,
    showEmptyTrucks,
    showNewDrivers,
    showTwoWeekNotice,
    showLateTrucks,
    showProblems,
    lateTrucks,
    hasDriverProblem,
  ]);
  // Progressive rendering: render dispatcher groups incrementally to avoid freezing.
  // We use a counter that increments on each tab switch to trigger the effect,
  // rather than depending on activeOfficeReports (which gets a new reference on every render).
  const [visibleGroupCount, setVisibleGroupCount] = useState<number>(Infinity);
  const progressiveRenderRef = useRef<number | null>(null);
  const [progressiveTrigger, setProgressiveTrigger] = useState(0);
  const prevActiveTabRef = useRef(activeTab);

  // Detect tab switches and bump the trigger counter
  if (prevActiveTabRef.current !== activeTab) {
    prevActiveTabRef.current = activeTab;
    setProgressiveTrigger((c) => c + 1);
  }

  useEffect(() => {
    if (progressiveRenderRef.current) {
      cancelAnimationFrame(progressiveRenderRef.current);
      progressiveRenderRef.current = null;
    }

    const totalGroups = activeOfficeReports.length;
    if (totalGroups <= 2) {
      setVisibleGroupCount(Infinity);
      return;
    }

    setVisibleGroupCount(1);

    let currentCount = 1;
    const renderNext = () => {
      currentCount += 1;
      if (currentCount >= totalGroups) {
        setVisibleGroupCount(Infinity);
      } else {
        setVisibleGroupCount(currentCount);
        progressiveRenderRef.current = requestAnimationFrame(renderNext);
      }
    };

    progressiveRenderRef.current = requestAnimationFrame(renderNext);

    return () => {
      if (progressiveRenderRef.current) {
        cancelAnimationFrame(progressiveRenderRef.current);
        progressiveRenderRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressiveTrigger]);

  // Memo key that captures all volatile state used inside group rendering.
  // Changes to any of these trigger group re-renders; visibleGroupCount is intentionally
  // excluded so progressive rendering doesn't cause existing groups to re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupMemoKey = useMemo(
    () => ({}),
    [
      editing,
      expandedTruckMap,
      expandedDispatcherMap,
      calendarDates,
      sidebarOpen,
      activeTab,
      visibleTrucks,
      latePickups,
      lateDeliveries,
      hasDriverProblem,
      hasEfsMissingData,
      hasLumperMissingRC,
      hasWeeklyPlan,
      getDrugTestForDriver,
      drugTests,
    ],
  );

  // Loading skeleton component for tab content
  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            <div className="h-6 w-24 bg-muted animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
            <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
            <div className="col-span-1 h-8 bg-muted animate-pulse rounded" />
            {[...Array(7)].map((_, idx) => (
              <div key={idx} className="col-span-1 h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  if (error) {
    // Auto-refresh the page on query timeout errors
    if (error.message?.includes("timeout") || error.message?.includes("connection")) {
      window.location.reload();
      return null;
    }
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>
    );
  }
  const handleNoteChange = async (truckId: string, driverId: string | null, newValue: string) => {
    try {
      await updateTruckNote.mutateAsync({
        truckId,
        driverId: driverId || undefined,
        note: newValue.trim(),
      });
      // Final Update: if we're in the 15:45-16:30 Chicago window and there's a note, send email
      if (isFinalUpdateWindow && newValue.trim() && !finalUpdateSentTruckIds.has(truckId)) {
        try {
          // Look up truck info for subject/body
          const truckInfo = (Object.values(groupedReports || {}) as any[])
            .flatMap((g: any) => g.trucks || [])
            .find((t: any) => t.id === truckId);
          const truckNumber = truckInfo?.truckNumber || "";
          const driverName =
            (truckInfo?.driver1Name || "") + (truckInfo?.driver2Name ? ` / ${truckInfo.driver2Name}` : "");
          // Optimistically mark as sent so cell turns purple
          setFinalUpdateSentTruckIds((prev) => {
            const n = new Set(prev);
            n.add(truckId);
            return n;
          });
          const { error: fnErr } = await supabase.functions.invoke("send-final-update", {
            body: {
              truckId,
              driverId: driverId || null,
              truckNumber,
              driverName: driverName.trim(),
              note: newValue.trim(),
            },
          });
          if (fnErr) throw fnErr;
          toast({ title: "Final update sent", description: `Truck ${truckNumber}` });
        } catch (e: any) {
          // Roll back optimistic mark on failure
          setFinalUpdateSentTruckIds((prev) => {
            const n = new Set(prev);
            n.delete(truckId);
            return n;
          });
          toast({
            title: "Final update email failed",
            description: e?.message || "Could not send final update email.",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "There was an error updating the note.",
        variant: "destructive",
      });
    }
  };
  return (
    <>
      <div className="h-full bg-background flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
          <div className="px-4 pt-2 sticky top-0 bg-background z-[101] border-b border-border">
            {/* Filters Section */}
            <div className="flex flex-wrap gap-2 mb-2 items-center">
              <div className="relative">
                <Input
                  placeholder="Truck # / Driver name"
                  value={truckDriverFilter}
                  onChange={(e) => setTruckDriverFilter(e.target.value)}
                  className={cn(
                    "w-[170px] sm:w-[200px] pr-8",
                    ambiguousMatch?.filter === "truck" && "border-amber-500",
                    searchStatus.truck === "not_found" && truckDriverFilter.length >= 2 && "border-red-400",
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {searchStatus.truck === "searching" && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  )}
                  {searchStatus.truck === "found" && !ambiguousMatch?.filter && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {searchStatus.truck === "not_found" && truckDriverFilter.length >= 2 && (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                  {ambiguousMatch?.filter === "truck" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <AlertCircle className="h-4 w-4 text-amber-500 cursor-pointer hover:text-amber-600" />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Found in multiple offices:</p>
                          <div className="flex flex-wrap gap-1">
                            {ambiguousMatch.offices.map((office) => (
                              <Button
                                key={office}
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab(office)}
                                className={cn(office === activeTab && "bg-primary text-primary-foreground")}
                              >
                                {office}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  placeholder="Dispatch name"
                  value={dispatchNameFilter}
                  onChange={(e) => setDispatchNameFilter(e.target.value)}
                  className={cn(
                    "w-[150px] sm:w-[180px] pr-8",
                    ambiguousMatch?.filter === "dispatch" && "border-amber-500",
                    searchStatus.dispatch === "not_found" && dispatchNameFilter.length >= 2 && "border-red-400",
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {searchStatus.dispatch === "searching" && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  )}
                  {searchStatus.dispatch === "found" && !ambiguousMatch?.filter && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {searchStatus.dispatch === "not_found" && dispatchNameFilter.length >= 2 && (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                  {ambiguousMatch?.filter === "dispatch" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <AlertCircle className="h-4 w-4 text-amber-500 cursor-pointer hover:text-amber-600" />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Found in multiple offices:</p>
                          <div className="flex flex-wrap gap-1">
                            {ambiguousMatch.offices.map((office) => (
                              <Button
                                key={office}
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab(office)}
                                className={cn(office === activeTab && "bg-primary text-primary-foreground")}
                              >
                                {office}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  placeholder="Load #"
                  value={loadNumberFilter}
                  onChange={(e) => setLoadNumberFilter(e.target.value)}
                  className={cn(
                    "w-[150px] sm:w-[180px] pr-8",
                    ambiguousMatch?.filter === "load" && "border-amber-500",
                    searchStatus.load === "not_found" && loadNumberFilter.length >= 3 && "border-red-400",
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {searchStatus.load === "searching" && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  )}
                  {searchStatus.load === "found" && !ambiguousMatch?.filter && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Check
                          className={cn(
                            "h-4 w-4",
                            foundOrderMeta?.isLocked
                              ? "text-blue-500"
                              : foundOrderMeta?.isCanceled
                                ? "text-amber-500"
                                : "text-green-500",
                          )}
                        />
                      </TooltipTrigger>
                      {(foundOrderMeta?.isLocked || foundOrderMeta?.isCanceled) && (
                        <TooltipContent>
                          {foundOrderMeta.isLocked && <p>Order is locked (archived)</p>}
                          {foundOrderMeta.isCanceled && <p>Order was canceled</p>}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}
                  {searchStatus.load === "not_found" && loadNumberFilter.length >= 3 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <X className="h-4 w-4 text-red-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>No order found with this number</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {ambiguousMatch?.filter === "load" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <AlertCircle className="h-4 w-4 text-amber-500 cursor-pointer hover:text-amber-600" />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Found in multiple offices:</p>
                          <div className="flex flex-wrap gap-1">
                            {ambiguousMatch.offices.map((office) => (
                              <Button
                                key={office}
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab(office)}
                                className={cn(office === activeTab && "bg-primary text-primary-foreground")}
                              >
                                {office}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              <Combobox
                options={[
                  { value: "", label: "All companies" },
                  ...companiesInOffice.map((name) => ({ value: name, label: name })),
                ]}
                value={companyFilter}
                onValueChange={(v) => setCompanyFilter(v)}
                placeholder="Company"
                searchPlaceholder="Search company..."
                className="w-[180px]"
              />
              {(truckDriverFilter || dispatchNameFilter || loadNumberFilter || companyFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTruckDriverFilter("");
                    setDispatchNameFilter("");
                    setLoadNumberFilter("");
                    setCompanyFilter("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search address nearby..."
                    value={proximityAddress}
                    onChange={(e) => setProximityAddress(e.target.value)}
                    className="pl-8 w-[220px] h-8 text-sm"
                  />
                  {proximitySearching && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!proximitySearching && proximityMatchedTrucks && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {proximityMatchedTrucks.size}
                    </span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setLegendDialogOpen(true)} className="gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Legend
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <TabsList className={cn("grid flex-1", offices.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
                {offices.map((office) => (
                  <TabsTrigger key={office} value={office} className="text-xs sm:text-sm">
                    {getOfficeDisplayName(office)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(hasRole("supervisor") ||
                hasRole("manager") ||
                hasRole("admin") ||
                hasRole("safety") ||
                hasRole("dispatch") ||
                hasRole("afterhours")) && (
                <div className="flex flex-wrap gap-1 sm:gap-2 sm:ml-4">
                  <Button
                    variant={showEmptyTrucks ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowEmptyTrucks(!showEmptyTrucks)}
                    className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                  >
                    Empty trucks
                  </Button>
                  <Button
                    variant={showLateTrucks ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowLateTrucks(!showLateTrucks)}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                  >
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    Late trucks
                  </Button>
                  {(hasRole("supervisor") || hasRole("manager") || hasRole("admin") || hasRole("safety")) && (
                    <>
                      <Button
                        variant={showTwoWeekNotice ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowTwoWeekNotice(!showTwoWeekNotice)}
                        className="gap-1 sm:gap-2 text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                      >
                        <Ban className="h-3 w-3 sm:h-4 sm:w-4" />2 Week Notice
                      </Button>
                      <Button
                        variant={showNewDrivers ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowNewDrivers(!showNewDrivers)}
                        className="gap-1 sm:gap-2 text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                      >
                        <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                        New drivers
                      </Button>
                      <Button
                        variant={showProblems ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowProblems(!showProblems)}
                        className="gap-1 sm:gap-2 text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                      >
                        <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                        Home time
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Only render the active tab content */}
          <TabsContent value={activeTab} className="mt-0 flex-1 overflow-auto relative">
            {/* Background loading indicator - shown when navigating to new dates */}
            {isFetchingBackground && !isLoading && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 overflow-hidden z-10">
                <div
                  className="h-full w-1/3 bg-primary animate-pulse"
                  style={{ animation: "pulse 1s ease-in-out infinite" }}
                />
              </div>
            )}
            {isLoading || groupedReports == null ? (
              <LoadingSkeleton />
            ) : isViewingOtherOfficeInIndividualMode ? (
              <div className="p-4">
                <div className="text-center py-12">
                  <div className="text-muted-foreground mb-2">
                    You're in <span className="font-semibold text-foreground">Individual Mode</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Switch back to view data from other offices, or use search to find specific loads.
                  </div>
                </div>
              </div>
            ) : activeOfficeReports.length === 0 ? (
              <div className="p-4">
                <div className="text-center py-12 text-muted-foreground">
                  {USE_DATE_WINDOW_LOADING
                    ? "No drivers assigned to your dispatcher (or you have no active loads in this window)."
                    : `No trucks assigned to dispatchers in ${activeTab}`}
                </div>
              </div>
            ) : (
              <div className="px-4 py-2">
                {activeOfficeReports.slice(0, visibleGroupCount).map((group) => (
                  <MemoizedDispatcherGroup
                    key={group.dispatcherId}
                    group={group}
                    memoKey={groupMemoKey}
                    renderGroup={() => {
                      const startDate = getCalendarStartDate(group.dispatcherId);
                      const days = Array.from(
                        {
                          length: 6,
                        },
                        (_, i) => addDays(startDate, i),
                      );
                      return (
                        <div className={`bg-card ${(group as any).isOffDuty ? "opacity-50" : ""}`}>
                          {/* Google Sheets-style table */}
                          <div className="w-full">
                            <table
                              className="w-full border-collapse bg-card border-[3px] border-gray-400"
                              style={{
                                tableLayout: "auto",
                                transform: "translateZ(0)",
                                willChange: "transform",
                              }}
                            >
                              <thead>
                                {/* Date Range Selector Row with Dispatcher Name */}
                                <tr
                                  className={`sticky top-0 z-20 ${(group as any).isOffDuty ? "bg-gray-300" : "bg-muted/50"}`}
                                >
                                  <th
                                    colSpan={3}
                                    className={`border-r border-b-[2px] border-gray-400 px-2 py-1 text-left font-bold ${(group as any).isOffDuty ? "text-gray-500 bg-gray-300" : "text-foreground bg-muted/50"}`}
                                    style={{
                                      fontSize: "0.825rem",
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Toggle expanded dispatcher map
                                          setExpandedDispatcherMap(
                                            expandedDispatcherMap === group.dispatcherId ? null : group.dispatcherId,
                                          );
                                        }}
                                        className="p-1 hover:bg-muted rounded transition-colors"
                                        aria-label="Fleet map"
                                      >
                                        <MapIcon
                                          className={`h-4 w-4 ${expandedDispatcherMap === group.dispatcherId ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                        />
                                      </button>
                                      <span>
                                        {group.dispatcher} ({group.trucks.length} truck
                                        {group.trucks.length !== 1 ? "s" : ""})
                                        {(group as any).isOffDuty && (
                                          <span className="ml-2 text-xs font-normal italic">(Off Duty)</span>
                                        )}
                                      </span>
                                      {group.ext && (
                                        <span className="text-xs font-normal text-muted-foreground">
                                          ext {group.ext}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                  <th
                                    colSpan={6}
                                    className="border-r border-b-[2px] border-gray-400 px-2 py-1 bg-muted/50"
                                  >
                                    <div className="flex items-center justify-center">
                                      <button
                                        onClick={() =>
                                          handleCalendarDateChange(group.dispatcherId, addDays(startDate, -1))
                                        }
                                        className="p-0.5 hover:bg-muted rounded"
                                      >
                                        <ChevronLeft className="h-3 w-3" />
                                      </button>
                                      <div className="text-xs font-medium text-foreground mx-2">
                                        {format(startDate, "MMM dd")} - {format(addDays(startDate, 5), "MMM dd, yyyy")}
                                      </div>
                                      <button
                                        onClick={() =>
                                          handleCalendarDateChange(group.dispatcherId, addDays(startDate, 1))
                                        }
                                        className="p-0.5 hover:bg-muted rounded"
                                      >
                                        <ChevronRight className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </th>
                                  <th
                                    colSpan={4}
                                    className="border-r border-b-[2px] border-gray-400 bg-muted/50"
                                    style={{
                                      width: "220px",
                                      minWidth: "220px",
                                      maxWidth: "220px",
                                    }}
                                  ></th>
                                  <th
                                    colSpan={2}
                                    className={`bg-muted/50 border-l border-b-[2px] border-gray-400 px-2 py-1 text-center text-[10px] font-medium text-muted-foreground ${sidebarOpen ? "border-r border-border" : ""}`}
                                  >
                                    Recent Activity
                                  </th>
                                </tr>
                                {/* Fleet Map Row - shows when dispatcher map is expanded */}
                                {expandedDispatcherMap === group.dispatcherId && (
                                  <tr>
                                    <th colSpan={15} className="p-0 border-b-[3px] border-border bg-card">
                                      <div style={{ height: "600px" }}>
                                        <DispatcherFleetMapView
                                          trucks={group.trucks.map((truck: any) => {
                                            // Build truck data with current order info
                                            const allSortedOrders =
                                              truck.allOrders
                                                ?.filter((order: any) => !order.canceled && order.notes !== "GAME|OVER")
                                                .sort((a: any, b: any) => {
                                                  const aDate = new Date(a.pickup_datetime || "9999-12-31").getTime();
                                                  const bDate = new Date(b.pickup_datetime || "9999-12-31").getTime();
                                                  return aDate - bDate;
                                                }) || [];

                                            let currentOrder: any = undefined;
                                            if (allSortedOrders.length > 0) {
                                              const lastOrder = allSortedOrders[allSortedOrders.length - 1];
                                              const lastOrderHasBOL = lastOrder.order_files?.some(
                                                (file: any) => file.file_category === "BOL",
                                              );

                                              if (lastOrderHasBOL) {
                                                currentOrder = lastOrder;
                                              } else if (allSortedOrders.length >= 2) {
                                                const previousOrder = allSortedOrders[allSortedOrders.length - 2];
                                                const previousHasPOD = previousOrder.order_files?.some(
                                                  (file: any) => file.file_category === "POD",
                                                );

                                                if (previousHasPOD) {
                                                  currentOrder = lastOrder;
                                                } else {
                                                  const lastWithBOL = [...allSortedOrders]
                                                    .reverse()
                                                    .find((order: any) =>
                                                      order.order_files?.some(
                                                        (file: any) => file.file_category === "BOL",
                                                      ),
                                                    );
                                                  currentOrder = lastWithBOL || lastOrder;
                                                }
                                              } else {
                                                currentOrder = lastOrder;
                                              }
                                            }

                                            return {
                                              id: truck.id,
                                              truckNumber: truck.truckNumber,
                                              driverName: truck.driver || truck.driverName || "No driver",
                                              driver2Name: truck.driver2Name,
                                              milesAway: truck.milesAway,
                                              driveMinutes: truck.driveMinutes,
                                              shiftMinutes: truck.shiftMinutes,
                                              breakMinutes: truck.breakMinutes,
                                              cycleMinutes: truck.cycleMinutes,
                                              homeLatitude: truck.homeLatitude ?? truck.driver1?.home_latitude ?? null,
                                              homeLongitude:
                                                truck.homeLongitude ?? truck.driver1?.home_longitude ?? null,
                                              homeCity: truck.homeCity ?? truck.driver1?.home_city ?? null,
                                              homeState: truck.homeState ?? truck.driver1?.home_state ?? null,
                                              currentOrder: currentOrder
                                                ? {
                                                    id: currentOrder.id,
                                                    loadNumber: formatInternalLoadNumber(
                                                      currentOrder.internal_load_number,
                                                      truck.companyName,
                                                    ),
                                                    brokerLoadNumber: currentOrder.broker_load_number,
                                                    pickupAddress: currentOrder.pickupStop?.address,
                                                    deliveryAddress: currentOrder.deliveryStop?.address,
                                                    pickupCity: currentOrder.pickupStop?.city,
                                                    pickupState: currentOrder.pickupStop?.state,
                                                    deliveryCity: currentOrder.deliveryStop?.city,
                                                    deliveryState: currentOrder.deliveryStop?.state,
                                                    pickupLatitude: currentOrder.pickupStop?.latitude,
                                                    pickupLongitude: currentOrder.pickupStop?.longitude,
                                                    deliveryLatitude: currentOrder.deliveryStop?.latitude,
                                                    deliveryLongitude: currentOrder.deliveryStop?.longitude,
                                                    pickupDatetime: currentOrder.pickupStop?.datetime,
                                                    deliveryDatetime: currentOrder.deliveryStop?.datetime,
                                                    hasBOL:
                                                      currentOrder.order_files?.some(
                                                        (f: any) => f.file_category === "BOL",
                                                      ) || false,
                                                    hasPOD:
                                                      currentOrder.order_files?.some(
                                                        (f: any) => f.file_category === "POD",
                                                      ) || false,
                                                    pickupArrived: !!currentOrder.pickupStop?.arrival_time,
                                                  }
                                                : undefined,
                                            };
                                          })}
                                        />
                                      </div>
                                    </th>
                                  </tr>
                                )}
                                {/* Column Headers Row */}
                                <tr className="bg-muted/50 sticky top-[37px] z-10">
                                  <th className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50 w-16">
                                    Truck #
                                  </th>
                                  <th
                                    className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50"
                                    style={{
                                      width: "163px",
                                      minWidth: "163px",
                                      maxWidth: "163px",
                                    }}
                                  >
                                    Driver
                                  </th>
                                  <th
                                    className="border-r border-b-[3px] border-gray-400 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground bg-muted/50"
                                    style={{
                                      width: "136px",
                                      minWidth: "136px",
                                      maxWidth: "136px",
                                    }}
                                  >
                                    Home
                                  </th>
                                  {days.map((day, index) => {
                                    const isToday = isSameDay(day, getChicagoToday());
                                    return (
                                      <th
                                        key={index}
                                        className={`border-b-[3px] border-gray-400 ${index > 0 ? "border-l border-gray-400" : ""} px-2 py-1 text-center text-[10px] font-medium text-muted-foreground bg-muted/50 relative`}
                                        style={{
                                          width: "120px",
                                          minWidth: "120px",
                                          maxWidth: "120px",
                                          ...(isToday
                                            ? {
                                                position: "relative",
                                                zIndex: 10,
                                              }
                                            : {}),
                                        }}
                                      >
                                        {/* Red border overlay for today header */}
                                        {isToday && (
                                          <div
                                            className="absolute"
                                            style={{
                                              top: 0,
                                              left: 0,
                                              right: 0,
                                              bottom: 0,
                                              borderLeft: "6px solid #dc2626",
                                              borderRight: "6px solid #dc2626",
                                              borderTop: "6px solid #dc2626",
                                              borderBottom: "6px solid hsl(var(--border))",
                                              zIndex: 100,
                                              pointerEvents: "none",
                                            }}
                                          />
                                        )}
                                        <div className="relative z-10 text-[10px]">{format(day, "EEEE")}</div>
                                        <div className="text-[9px] text-muted-foreground relative z-10">
                                          {format(day, "M/d/yyyy")}
                                        </div>
                                      </th>
                                    );
                                  })}
                                  <th
                                    colSpan={4}
                                    className="border-t border-l border-r border-b-[3px] border-gray-400 px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground bg-muted/50"
                                    style={{
                                      width: "300px",
                                      minWidth: "300px",
                                      maxWidth: "300px",
                                    }}
                                  >
                                    Away (D) | Drive | Shift | Break | Cycle | Fuel
                                  </th>
                                  <th
                                    className={`border-t border-b-[3px] border-gray-400 px-1 py-1 text-center text-[10px] font-medium text-muted-foreground bg-muted/50 w-[80px] min-w-[80px] max-w-[80px] ${sidebarOpen ? "border-r border-border" : ""}`}
                                  >
                                    Last Edit
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.trucks
                                  .slice(0, visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)
                                  .map((truck, truckIndex) => {
                                    const modifiedCells = renderTruckCalendarCells(
                                      truck,
                                      startDate,
                                      truckIndex,
                                      group.trucks.length,
                                    );
                                    const isLastTruck = truckIndex === group.trucks.length - 1;
                                    const isMapExpanded = expandedTruckMap === truck.id;

                                    // Current order logic (aligned with edge function):
                                    // 1. Default: last/latest load that has BOL
                                    // 2. Exception: if last load has no BOL but previous load has POD, then last load is current
                                    // 3. Fallback: if no load with BOL, use last load
                                    const allSortedOrders =
                                      truck.allOrders
                                        ?.filter((order) => !order.canceled && order.notes !== "GAME|OVER")
                                        .sort((a, b) => {
                                          const aDate = new Date(a.pickup_datetime || "9999-12-31").getTime();
                                          const bDate = new Date(b.pickup_datetime || "9999-12-31").getTime();
                                          return aDate - bDate;
                                        }) || [];

                                    let currentOrder: (typeof allSortedOrders)[0] | undefined = undefined;
                                    if (allSortedOrders.length > 0) {
                                      const lastOrder = allSortedOrders[allSortedOrders.length - 1];
                                      const lastOrderHasBOL = lastOrder.order_files?.some(
                                        (file: any) => file.file_category === "BOL",
                                      );

                                      if (lastOrderHasBOL) {
                                        currentOrder = lastOrder;
                                      } else if (allSortedOrders.length >= 2) {
                                        const previousOrder = allSortedOrders[allSortedOrders.length - 2];
                                        const previousHasPOD = previousOrder.order_files?.some(
                                          (file: any) => file.file_category === "POD",
                                        );

                                        if (previousHasPOD) {
                                          currentOrder = lastOrder;
                                        } else {
                                          const lastWithBOL = [...allSortedOrders]
                                            .reverse()
                                            .find((order) =>
                                              order.order_files?.some((file: any) => file.file_category === "BOL"),
                                            );
                                          currentOrder = lastWithBOL || lastOrder;
                                        }
                                      } else {
                                        currentOrder = lastOrder;
                                      }
                                    }

                                    // Multi-drop support (non-mutating): derive stops if missing
                                    const pickupStopsForDisplay =
                                      currentOrder?.pickupStops ??
                                      (currentOrder?.pickup_drops
                                        ? currentOrder.pickup_drops
                                            .filter((pd: any) => pd.type === "pickup")
                                            .sort((a: any, b: any) => {
                                              const aSeq = a.sequence_number ?? 0;
                                              const bSeq = b.sequence_number ?? 0;
                                              return aSeq - bSeq;
                                            })
                                        : []);

                                    const pickupStopForDisplay = currentOrder?.pickupStop ?? pickupStopsForDisplay[0];

                                    const hasBOL =
                                      currentOrder?.order_files?.some((file: any) => file.file_category === "BOL") ||
                                      false;
                                    const hasPOD =
                                      currentOrder?.order_files?.some((file: any) => file.file_category === "POD") ||
                                      false;
                                    const pickupArrived = !!pickupStopForDisplay?.arrived_at;

                                    // Check if any HOS timer is 0 or below
                                    const hasExpiredHOS =
                                      truck.driveMinutes <= 0 ||
                                      truck.shiftMinutes <= 0 ||
                                      truck.breakMinutes <= 0 ||
                                      truck.cycleMinutes <= 0;

                                    // Get driver cell styling (includes drug test and game over)
                                    const isNew = isNewDriver(truck);
                                    const canManageDrugTests =
                                      hasRole("safety") || hasRole("manager") || hasRole("admin");
                                    const driverCellStyle = getDriverCellStyle(truck);
                                    const shouldShowDrugTestUI = isNew && canManageDrugTests;
                                    return (
                                      <React.Fragment key={truck.id}>
                                        <tr className={truckIndex % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                                          <td
                                            className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs font-medium"
                                            style={{
                                              width: "77px",
                                              minWidth: "77px",
                                              maxWidth: "77px",
                                              ...getCompanyBackgroundColor(truck.companyName),
                                            }}
                                          >
                                            <div className="flex flex-col gap-0.5">
                                              <div className="flex items-center gap-1 font-bold text-black">
                                                {truck.truckNumber}
                                                {hasExpiredHOS && <Clock className="h-3 w-3 text-destructive" />}
                                                {truck.twoWeekBlockDate && (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <button
                                                        className="inline-flex"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <Ban className="h-3 w-3 text-destructive cursor-pointer" />
                                                      </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-2">
                                                      <p className="text-xs font-medium">2-Week Notice</p>
                                                      <p className="text-xs">
                                                        Last day:{" "}
                                                        {format(
                                                          new Date(truck.twoWeekBlockDate.split("T")[0] + "T00:00:00"),
                                                          "MMM dd, yyyy",
                                                        )}
                                                      </p>
                                                    </PopoverContent>
                                                  </Popover>
                                                )}
                                                {(() => {
                                                  const truckAlerts = collectTruckAlerts(truck);
                                                  if (truckAlerts.length === 0) return null;
                                                  if (truckAlerts.length === 1) {
                                                    const alert = truckAlerts[0];
                                                    const IconMap: Record<string, any> = {
                                                      CreditCard,
                                                      ShieldCheck,
                                                      CircleDot,
                                                      Settings,
                                                    };
                                                    if (alert.icon === "dot") {
                                                      return (
                                                        <Tooltip>
                                                          <TooltipTrigger asChild>
                                                            <img
                                                              src={dotInspectionIcon}
                                                              alt="DOT Inspection"
                                                              className="h-4 w-4"
                                                              style={{
                                                                filter:
                                                                  alert.color === "red"
                                                                    ? "brightness(0) saturate(100%) invert(26%) sepia(89%) saturate(6143%) hue-rotate(355deg) brightness(102%) contrast(119%)"
                                                                    : "brightness(0) saturate(100%) invert(83%) sepia(62%) saturate(1000%) hue-rotate(359deg) brightness(103%) contrast(106%)",
                                                              }}
                                                            />
                                                          </TooltipTrigger>
                                                          <TooltipContent>
                                                            <p className="text-xs">{alert.tooltip}</p>
                                                          </TooltipContent>
                                                        </Tooltip>
                                                      );
                                                    }
                                                    const IconComp = IconMap[alert.icon];
                                                    if (!IconComp) return null;
                                                    return (
                                                      <Tooltip>
                                                        <TooltipTrigger asChild>
                                                          <IconComp
                                                            className={`h-3.5 w-3.5 ${alert.color === "red" ? "text-red-500" : "text-yellow-500"}`}
                                                          />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                          <p className="text-xs">{alert.tooltip}</p>
                                                        </TooltipContent>
                                                      </Tooltip>
                                                    );
                                                  }
                                                  // 2+ alerts: show count badge with popover
                                                  const hasRed = truckAlerts.some((a) => a.color === "red");
                                                  return (
                                                    <Popover>
                                                      <PopoverTrigger asChild>
                                                        <button
                                                          className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white cursor-pointer ${hasRed ? "bg-red-500" : "bg-yellow-500"}`}
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          {truckAlerts.length}
                                                        </button>
                                                      </PopoverTrigger>
                                                      <PopoverContent className="w-auto max-w-xs p-3">
                                                        <p className="text-xs font-bold mb-2">Truck & Trailer Alerts</p>
                                                        <div className="space-y-1">
                                                          {truckAlerts.map((alert, i) => (
                                                            <div key={i} className="flex items-center gap-2">
                                                              <span
                                                                className={`h-2 w-2 rounded-full flex-shrink-0 ${alert.color === "red" ? "bg-red-500" : "bg-yellow-500"}`}
                                                              />
                                                              <span className="text-xs">{alert.tooltip}</span>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </PopoverContent>
                                                    </Popover>
                                                  );
                                                })()}
                                              </div>
                                              {truck.companyName && (
                                                <div className="text-[9px] leading-tight font-semibold text-black opacity-60">
                                                  {truck.companyName}
                                                </div>
                                              )}
                                              {truck.hasMultipleOrders && (
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipContent>
                                                      <p className="text-[10px]">
                                                        {truck.totalOrdersCount} total orders ({truck.activeOrdersCount}{" "}
                                                        active)
                                                      </p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                              )}
                                            </div>
                                          </td>
                                          <td
                                            className={`border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs relative ${shouldShowDrugTestUI ? "cursor-pointer hover:opacity-80" : ""}`}
                                            style={{
                                              width: "163px",
                                              minWidth: "163px",
                                              maxWidth: "163px",
                                              ...driverCellStyle,
                                            }}
                                            onClick={(e) => {
                                              // Only trigger drug test dialog if clicking on the cell itself, not the info button
                                              if (
                                                shouldShowDrugTestUI &&
                                                truck.driverId &&
                                                e.target === e.currentTarget
                                              ) {
                                                console.log("Opening drug test dialog for:", {
                                                  driverId: truck.driverId,
                                                  driverName: truck.driver,
                                                  truckId: truck.id,
                                                  truckNumber: truck.truckNumber,
                                                });
                                                dialogs.setDrugTestDialog({
                                                  driverId: truck.driverId,
                                                  driverName: truck.driver,
                                                  truckId: truck.id,
                                                });
                                              }
                                            }}
                                          >
                                            <div className="flex flex-col">
                                              <div
                                                className="flex items-center gap-2"
                                                onClick={(e) => {
                                                  // Also allow clicking on the driver name text
                                                  if (
                                                    shouldShowDrugTestUI &&
                                                    truck.driverId &&
                                                    e.target === e.currentTarget
                                                  ) {
                                                    console.log("Opening drug test dialog for:", {
                                                      driverId: truck.driverId,
                                                      driverName: truck.driver,
                                                      truckId: truck.id,
                                                      truckNumber: truck.truckNumber,
                                                    });
                                                    dialogs.setDrugTestDialog({
                                                      driverId: truck.driverId,
                                                      driverName: truck.driver,
                                                      truckId: truck.id,
                                                    });
                                                  }
                                                }}
                                              >
                                                {truck.driverId &&
                                                  hasDriverProblem(truck.driverId) &&
                                                  !(roles.includes("dispatch") || roles.includes("afterhours")) && (
                                                    <Popover>
                                                      <PopoverTrigger asChild>
                                                        <button
                                                          className="inline-flex"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          <AlertCircle
                                                            className="h-3.5 w-3.5 text-destructive cursor-pointer"
                                                            strokeWidth={2.5}
                                                          />
                                                        </button>
                                                      </PopoverTrigger>
                                                      <PopoverContent className="w-auto max-w-xs p-3">
                                                        <p className="text-xs font-bold text-destructive mb-1">
                                                          Driver Problem
                                                        </p>
                                                        <p className="text-xs whitespace-pre-wrap">
                                                          {getProblemForDriver(truck.driverId)?.reason}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground mt-2">
                                                          {getProblemForDriver(truck.driverId)?.created_at &&
                                                            new Date(
                                                              getProblemForDriver(truck.driverId)!.created_at,
                                                            ).toLocaleString("en-US", { timeZone: "America/Chicago" })}
                                                        </p>
                                                      </PopoverContent>
                                                    </Popover>
                                                  )}
                                                <span>{truck.driver}</span>
                                                {(() => {
                                                  // Collect all driver-row icons into a unified list
                                                  type DriverIcon = {
                                                    key: string;
                                                    label: string;
                                                    tooltip: string;
                                                    color: "red" | "yellow" | "amber";
                                                    renderIcon: () => React.ReactNode;
                                                    onClick?: (e: React.MouseEvent) => void;
                                                  };
                                                  const icons: DriverIcon[] = [];

                                                  // 1. Maintenance / Oil Change
                                                  const maintenanceStatus = getMaintenanceIconStatus(truck);
                                                  if (maintenanceStatus.show) {
                                                    icons.push({
                                                      key: "maintenance",
                                                      label: "Oil Change",
                                                      tooltip: maintenanceStatus.tooltip,
                                                      color: maintenanceStatus.color === "red" ? "red" : "yellow",
                                                      renderIcon: () => (
                                                        <img
                                                          src={wrenchIcon}
                                                          alt="Maintenance"
                                                          className="h-3.5 w-3.5"
                                                          style={{
                                                            filter:
                                                              maintenanceStatus.color === "red"
                                                                ? "invert(27%) sepia(94%) saturate(6193%) hue-rotate(356deg) brightness(103%) contrast(106%)"
                                                                : "invert(79%) sepia(74%) saturate(1042%) hue-rotate(359deg) brightness(103%) contrast(106%)",
                                                          }}
                                                        />
                                                      ),
                                                    });
                                                  }

                                                  // 2. Lumper missing RC
                                                  if (hasLumperMissingRC(truck.driverId)) {
                                                    icons.push({
                                                      key: "lumper",
                                                      label: "Lumper - Missing Receipt",
                                                      tooltip: "Lumper - Missing Receipt",
                                                      color: "amber",
                                                      renderIcon: () => (
                                                        <img
                                                          src={lumperReceiptIcon}
                                                          alt="Lumper Receipt"
                                                          className="h-4 w-4 cursor-pointer"
                                                        />
                                                      ),
                                                      onClick: (e) => {
                                                        e.stopPropagation();
                                                        setLumperMissingDataDialog({
                                                          driverId: truck.driverId!,
                                                          driverName: truck.driver || "Unknown",
                                                        });
                                                      },
                                                    });
                                                  }

                                                  // 3. EFS fuel missing
                                                  if (hasEfsMissingData(truck.driverId)) {
                                                    icons.push({
                                                      key: "efs",
                                                      label: "EFS Fuel - Missing Data",
                                                      tooltip: "EFS Fuel - Missing Data",
                                                      color: "amber",
                                                      renderIcon: () => (
                                                        <Fuel className="h-3.5 w-3.5 text-amber-500 cursor-pointer" />
                                                      ),
                                                      onClick: (e) => {
                                                        e.stopPropagation();
                                                        setEfsMissingDataDialog({
                                                          driverId: truck.driverId!,
                                                          driverName: truck.driver || "Unknown",
                                                        });
                                                      },
                                                    });
                                                  }

                                                  // 4. Random drug test
                                                  if (truck.randomDrugTestDate) {
                                                    icons.push({
                                                      key: "drugtest",
                                                      label: "Random Drug Test",
                                                      tooltip: `Random Drug Test: ${format(new Date(truck.randomDrugTestDate), "MMM dd, yyyy")}`,
                                                      color: "amber",
                                                      renderIcon: () => (
                                                        <Pill className="h-3.5 w-3.5 text-amber-500 animate-pulse cursor-pointer" />
                                                      ),
                                                    });
                                                  }

                                                  // 5. Temporary plate
                                                  const tempPlateId = temporaryPlatesByTruckId.get(truck.id);
                                                  if (tempPlateId) {
                                                    icons.push({
                                                      key: "tempplate",
                                                      label: "Temporary Plate",
                                                      tooltip: "Temporary Plate - Click to upload photos",
                                                      color: "amber",
                                                      renderIcon: () => (
                                                        <FileWarning className="h-3.5 w-3.5 text-amber-500 cursor-pointer" />
                                                      ),
                                                      onClick: (e) => {
                                                        e.stopPropagation();
                                                        setTempPlateDialog({
                                                          truckId: truck.id,
                                                          truckNumber: truck.truckNumber || "",
                                                          temporaryPlateId: tempPlateId,
                                                        });
                                                      },
                                                    });
                                                  }

                                                  // 6. Driver document alerts (CDL, MVR, Clearing House, Medical Card)
                                                  const driverAlerts = collectDriverAlerts(truck);
                                                  const IconMap: Record<string, any> = {
                                                    IdCard,
                                                    FileText,
                                                    Building2,
                                                    HeartPulse,
                                                  };
                                                  driverAlerts.forEach((alert) => {
                                                    icons.push({
                                                      key: `alert-${alert.label}`,
                                                      label: alert.label,
                                                      tooltip: alert.tooltip,
                                                      color: alert.color,
                                                      renderIcon: () => {
                                                        const IconComp = IconMap[alert.icon];
                                                        if (!IconComp) return null;
                                                        return (
                                                          <IconComp
                                                            className={`h-3.5 w-3.5 ${alert.color === "red" ? "text-red-500" : "text-yellow-500"}`}
                                                          />
                                                        );
                                                      },
                                                    });
                                                  });

                                                  if (icons.length === 0) return null;

                                                  const MAX_VISIBLE = 2;
                                                  const visible = icons.slice(0, MAX_VISIBLE);
                                                  const overflow = icons.slice(MAX_VISIBLE);

                                                  const renderSingleIcon = (icon: DriverIcon) => (
                                                    <Tooltip key={icon.key}>
                                                      <TooltipTrigger asChild>
                                                        <button
                                                          className="inline-flex"
                                                          onClick={icon.onClick || ((e) => e.stopPropagation())}
                                                        >
                                                          {icon.renderIcon()}
                                                        </button>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p className="text-xs">{icon.tooltip}</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  );

                                                  return (
                                                    <>
                                                      {icons.length <= MAX_VISIBLE ? (
                                                        visible.map(renderSingleIcon)
                                                      ) : (
                                                        <Popover>
                                                          <PopoverTrigger asChild>
                                                            <button
                                                              className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white cursor-pointer bg-amber-500"
                                                              onClick={(e) => e.stopPropagation()}
                                                            >
                                                              +{icons.length}
                                                            </button>
                                                          </PopoverTrigger>
                                                          <PopoverContent className="w-auto max-w-xs p-3">
                                                            <p className="text-xs font-bold mb-2">
                                                              Driver Alerts ({icons.length})
                                                            </p>
                                                            <div className="space-y-1.5">
                                                              {icons.map((icon) => (
                                                                <button
                                                                  key={icon.key}
                                                                  className="flex items-center gap-2 w-full text-left hover:bg-muted rounded px-1 py-0.5 transition-colors"
                                                                  onClick={(e) => {
                                                                    if (icon.onClick) icon.onClick(e);
                                                                    else e.stopPropagation();
                                                                  }}
                                                                >
                                                                  <span className="flex-shrink-0">
                                                                    {icon.renderIcon()}
                                                                  </span>
                                                                  <span className="text-xs cursor-pointer">
                                                                    {icon.label}
                                                                  </span>
                                                                </button>
                                                              ))}
                                                            </div>
                                                          </PopoverContent>
                                                        </Popover>
                                                      )}
                                                    </>
                                                  );
                                                })()}
                                                {(truck.driverPhone ||
                                                  truck.driverEmail ||
                                                  truck.trailerNumber ||
                                                  truck.driver2Name) && (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <button
                                                        className="inline-flex"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <Info className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                                      </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto">
                                                      <div className="space-y-1">
                                                        {truck.driver2Name ? (
                                                          <>
                                                            <div className="flex items-center justify-between gap-2">
                                                              <p className="font-semibold text-sm">
                                                                Driver 1:{" "}
                                                                <span
                                                                  className="cursor-pointer hover:opacity-70 transition-opacity"
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (truck.driverId)
                                                                      setEditingDriverId(truck.driverId);
                                                                  }}
                                                                >
                                                                  {truck.driver1Name}
                                                                </span>
                                                              </p>
                                                              {truck.driverId && truck.driver2Id && (
                                                                <div className="flex items-center gap-1">
                                                                  {truck.goingYard ? (
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                          // Cancel for both drivers
                                                                          await supabase
                                                                            .from("drivers")
                                                                            .update({ going_yard: false })
                                                                            .in("id", [
                                                                              truck.driverId,
                                                                              truck.driver2Id,
                                                                            ]);

                                                                          await supabase
                                                                            .from("driver_yard_actions")
                                                                            .delete()
                                                                            .in("driver_id", [
                                                                              truck.driverId,
                                                                              truck.driver2Id,
                                                                            ]);

                                                                          toast({
                                                                            title: "Yard action canceled for team",
                                                                          });
                                                                          // Real-time subscription handles cache updates
                                                                        } catch (error) {
                                                                          console.error("Error:", error);
                                                                          toast({
                                                                            title: "Error",
                                                                            description: "Failed to cancel",
                                                                            variant: "destructive",
                                                                          });
                                                                        }
                                                                      }}
                                                                    >
                                                                      <X className="h-3 w-3 text-destructive" />
                                                                    </Button>
                                                                  ) : (
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setYardActionDialog({
                                                                          driverId: truck.driverId!,
                                                                          driverName: truck.driver1Name,
                                                                          driver2Id: truck.driver2Id!,
                                                                          driver2Name: truck.driver2Name,
                                                                          truckNumber: truck.truckNumber,
                                                                        });
                                                                      }}
                                                                    >
                                                                      <Warehouse className="h-3 w-3" />
                                                                    </Button>
                                                                  )}
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setTwoWeekNoticeDialog({
                                                                        driverId: truck.driverId!,
                                                                        driverName: truck.driver1Name,
                                                                        driver2Id: truck.driver2Id!,
                                                                        driver2Name: truck.driver2Name,
                                                                      });
                                                                    }}
                                                                  >
                                                                    <CalendarIcon className="h-3 w-3" />
                                                                  </Button>
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setEfsRequestDialog({
                                                                        driverId: truck.driverId!,
                                                                        driverName: truck.driver1Name,
                                                                        truckNumber: truck.truckNumber,
                                                                        companyName: truck.companyName || "",
                                                                      });
                                                                    }}
                                                                  >
                                                                    <DollarSign className="h-3 w-3" />
                                                                  </Button>
                                                                  {!truck.doNotTouchHos && (
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setHosRequestDialog({
                                                                          driverName: truck.driver1Name,
                                                                          truckNumber: truck.truckNumber,
                                                                          companyName: truck.companyName || "",
                                                                          teamDriverName:
                                                                            truck.driver2Name || undefined,
                                                                        });
                                                                      }}
                                                                    >
                                                                      <Clock className="h-3 w-3" />
                                                                    </Button>
                                                                  )}
                                                                  {(hasRole("manager") ||
                                                                    hasRole("supervisor") ||
                                                                    hasRole("admin")) && (
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setProblemDialog({
                                                                          driverId: truck.driverId!,
                                                                          driverName: truck.driver1Name,
                                                                          truckNumber: truck.truckNumber,
                                                                          dispatcherName: truck.dispatcher || "",
                                                                        });
                                                                      }}
                                                                    >
                                                                      <AlertCircle className="h-3 w-3 text-destructive" />
                                                                    </Button>
                                                                  )}
                                                                </div>
                                                              )}
                                                            </div>
                                                            {truck.driverPhone && (
                                                              <p className="text-xs">📞 {truck.driverPhone}</p>
                                                            )}
                                                            {truck.driverEmail && (
                                                              <div className="flex items-center justify-between gap-1">
                                                                <p className="text-xs">✉️ {truck.driverEmail}</p>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-5 w-5 p-0 flex-shrink-0"
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const text = `Driver 1: ${truck.driver1Name}\n📞 ${truck.driverPhone || "N/A"}\nDriver 2: ${truck.driver2Name || "N/A"}\n📞 ${truck.driver2Phone || "N/A"}\n🚚 Truck: ${truck.truckNumber}\n🚛 Trailer: ${truck.trailerNumber || "N/A"}`;
                                                                    navigator.clipboard.writeText(text);
                                                                    toast({ title: "Copied to clipboard" });
                                                                  }}
                                                                >
                                                                  <ClipboardCopy className="h-3 w-3" />
                                                                </Button>
                                                              </div>
                                                            )}
                                                            <div className="border-t pt-1 mt-1">
                                                              <div className="flex items-center justify-between gap-2">
                                                                <p className="font-semibold text-sm">
                                                                  Driver 2:{" "}
                                                                  <span
                                                                    className="cursor-pointer hover:opacity-70 transition-opacity"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      if (truck.driver2Id)
                                                                        setEditingDriverId(truck.driver2Id);
                                                                    }}
                                                                  >
                                                                    {truck.driver2Name}
                                                                  </span>
                                                                </p>
                                                                <div className="flex items-center gap-1">
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setEfsRequestDialog({
                                                                        driverId: truck.driver2Id!,
                                                                        driverName: truck.driver2Name!,
                                                                        truckNumber: truck.truckNumber,
                                                                        companyName: truck.companyName || "",
                                                                      });
                                                                    }}
                                                                  >
                                                                    <DollarSign className="h-3 w-3" />
                                                                  </Button>
                                                                  {!truck.doNotTouchHos && (
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setHosRequestDialog({
                                                                          driverName: truck.driver2Name!,
                                                                          truckNumber: truck.truckNumber,
                                                                          companyName: truck.companyName || "",
                                                                          teamDriverName:
                                                                            truck.driver1Name || undefined,
                                                                        });
                                                                      }}
                                                                    >
                                                                      <Clock className="h-3 w-3" />
                                                                    </Button>
                                                                  )}
                                                                </div>
                                                              </div>
                                                              {truck.driver2Phone && (
                                                                <p className="text-xs">📞 {truck.driver2Phone}</p>
                                                              )}
                                                              {truck.driver2Email && (
                                                                <p className="text-xs">✉️ {truck.driver2Email}</p>
                                                              )}
                                                            </div>
                                                            <div className="border-t pt-1 mt-1">
                                                              <Popover>
                                                                <PopoverTrigger asChild>
                                                                  <p className="text-xs cursor-pointer hover:opacity-70 transition-opacity">
                                                                    🚚 Truck: {truck.truckNumber}
                                                                  </p>
                                                                </PopoverTrigger>
                                                                <PopoverContent
                                                                  className="w-auto p-2 text-xs space-y-0.5"
                                                                  side="top"
                                                                >
                                                                  <p className="font-semibold">
                                                                    🚚 Truck: {truck.truckNumber}
                                                                  </p>
                                                                  <p>VIN: {(truck as any).truckVin || "N/A"}</p>
                                                                  <p>Plate: {(truck as any).truckPlate || "N/A"}</p>
                                                                </PopoverContent>
                                                              </Popover>
                                                              {truck.trailerNumber && (
                                                                <Popover>
                                                                  <PopoverTrigger asChild>
                                                                    <p className="text-xs cursor-pointer hover:opacity-70 transition-opacity">
                                                                      🚛 Trailer: {truck.trailerNumber}
                                                                    </p>
                                                                  </PopoverTrigger>
                                                                  <PopoverContent
                                                                    className="w-auto p-2 text-xs space-y-0.5"
                                                                    side="top"
                                                                  >
                                                                    <p className="font-semibold">
                                                                      🚛 Trailer: {truck.trailerNumber}
                                                                    </p>
                                                                    <p>VIN: {(truck as any).trailerVin || "N/A"}</p>
                                                                    <p>Plate: {(truck as any).trailerPlate || "N/A"}</p>
                                                                  </PopoverContent>
                                                                </Popover>
                                                              )}
                                                            </div>
                                                            {((truck as any).emergencyContactName ||
                                                              (truck as any).emergencyContactPhone) && (
                                                              <div className="border-t pt-1 mt-1">
                                                                <p className="font-semibold text-xs mb-0.5">
                                                                  Emergency Contact
                                                                </p>
                                                                {(truck as any).emergencyContactName && (
                                                                  <p className="text-xs">
                                                                    👤 {(truck as any).emergencyContactName}
                                                                    {(truck as any).emergencyContactRelation
                                                                      ? ` (${(truck as any).emergencyContactRelation})`
                                                                      : ""}
                                                                  </p>
                                                                )}
                                                                {(truck as any).emergencyContactPhone && (
                                                                  <p className="text-xs">
                                                                    📞 {(truck as any).emergencyContactPhone}
                                                                  </p>
                                                                )}
                                                              </div>
                                                            )}
                                                            <div className="flex items-center gap-1.5 border-t pt-1 mt-1 flex-wrap">
                                                              {(truck as any).driverHazmat && (
                                                                <img
                                                                  src={biohazardSignIcon}
                                                                  alt="Hazmat"
                                                                  className="h-5 w-5"
                                                                  title="Hazmat"
                                                                />
                                                              )}
                                                              {(truck as any).driverTanker && (
                                                                <img
                                                                  src={tankerTruckIcon}
                                                                  alt="Tanker"
                                                                  className="h-5 w-5"
                                                                  title="Tanker"
                                                                />
                                                              )}
                                                              {(truck as any).driverTwic && (
                                                                <img
                                                                  src={portIcon}
                                                                  alt="TWIC"
                                                                  className="h-5 w-5"
                                                                  title="TWIC"
                                                                />
                                                              )}
                                                              {(truck as any).driverCitizen ? (
                                                                <img
                                                                  src={passportIcon}
                                                                  alt="Citizen"
                                                                  className="h-5 w-5"
                                                                  title="Citizen"
                                                                />
                                                              ) : (
                                                                <img
                                                                  src={greenCardIcon}
                                                                  alt="Green-Card"
                                                                  className="h-5 w-5"
                                                                  title="Green-Card"
                                                                />
                                                              )}
                                                              {(truck as any).driverCriminal && (
                                                                <img
                                                                  src={criminalDatabaseIcon}
                                                                  alt="Criminal"
                                                                  className="h-5 w-5"
                                                                  title="Criminal Record"
                                                                />
                                                              )}
                                                              {(truck as any).trailerVented && (
                                                                <img
                                                                  src={ventedIcon}
                                                                  alt="Vented"
                                                                  className="h-5 w-5"
                                                                  title="Vented Trailer"
                                                                />
                                                              )}
                                                              {((truck as any).driverStraps ?? 2) > 0 && (
                                                                <span
                                                                  className="flex items-center gap-0.5"
                                                                  title="Straps"
                                                                >
                                                                  <span className="text-xs font-medium">
                                                                    {(truck as any).driverStraps ?? 2}x
                                                                  </span>
                                                                  <img
                                                                    src={strapIcon}
                                                                    alt="Straps"
                                                                    className="h-5 w-5 pt-[2px]"
                                                                  />
                                                                </span>
                                                              )}
                                                              {((truck as any).driverLoadBars ?? 0) > 0 && (
                                                                <span
                                                                  className="flex items-center gap-0.5"
                                                                  title="Load Bars"
                                                                >
                                                                  <span className="text-xs font-medium">
                                                                    {(truck as any).driverLoadBars}x
                                                                  </span>
                                                                  <img
                                                                    src={loadBarIcon}
                                                                    alt="Load Bars"
                                                                    className="h-[26px] w-[26px]"
                                                                  />
                                                                </span>
                                                              )}
                                                            </div>
                                                          </>
                                                        ) : (
                                                          <>
                                                            <div className="flex items-center justify-between gap-2">
                                                              <p className="font-semibold text-sm">
                                                                <span
                                                                  className="cursor-pointer hover:opacity-70 transition-opacity"
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (truck.driverId)
                                                                      setEditingDriverId(truck.driverId);
                                                                  }}
                                                                >
                                                                  {truck.driver}
                                                                </span>
                                                              </p>
                                                              <div className="flex items-center gap-1">
                                                                {truck.driverId && (
                                                                  <>
                                                                    {truck.goingYard ? (
                                                                      <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                        onClick={async (e) => {
                                                                          e.stopPropagation();
                                                                          try {
                                                                            await supabase
                                                                              .from("drivers")
                                                                              .update({ going_yard: false })
                                                                              .eq("id", truck.driverId);

                                                                            await supabase
                                                                              .from("driver_yard_actions")
                                                                              .delete()
                                                                              .eq("driver_id", truck.driverId)
                                                                              .order("created_at", { ascending: false })
                                                                              .limit(1);

                                                                            toast({
                                                                              title: "Yard action canceled",
                                                                            });
                                                                            // Real-time subscription handles cache updates
                                                                          } catch (error) {
                                                                            console.error("Error:", error);
                                                                            toast({
                                                                              title: "Error",
                                                                              description: "Failed to cancel",
                                                                              variant: "destructive",
                                                                            });
                                                                          }
                                                                        }}
                                                                      >
                                                                        <X className="h-3 w-3 text-destructive" />
                                                                      </Button>
                                                                    ) : (
                                                                      <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                        onClick={(e) => {
                                                                          e.stopPropagation();
                                                                          setYardActionDialog({
                                                                            driverId: truck.driverId!,
                                                                            driverName: truck.driver,
                                                                            truckNumber: truck.truckNumber,
                                                                          });
                                                                        }}
                                                                      >
                                                                        <Warehouse className="h-3 w-3" />
                                                                      </Button>
                                                                    )}
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setTwoWeekNoticeDialog({
                                                                          driverId: truck.driverId!,
                                                                          driverName: truck.driver,
                                                                        });
                                                                      }}
                                                                    >
                                                                      <CalendarIcon className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-6 w-6 p-0"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEfsRequestDialog({
                                                                          driverId: truck.driverId!,
                                                                          driverName: truck.driver,
                                                                          truckNumber: truck.truckNumber,
                                                                          companyName: truck.companyName || "",
                                                                        });
                                                                      }}
                                                                    >
                                                                      <DollarSign className="h-3 w-3" />
                                                                    </Button>
                                                                    {!truck.doNotTouchHos && (
                                                                      <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                        onClick={(e) => {
                                                                          e.stopPropagation();
                                                                          setHosRequestDialog({
                                                                            driverName: truck.driver,
                                                                            truckNumber: truck.truckNumber,
                                                                            companyName: truck.companyName || "",
                                                                          });
                                                                        }}
                                                                      >
                                                                        <Clock className="h-3 w-3" />
                                                                      </Button>
                                                                    )}
                                                                    {(hasRole("manager") ||
                                                                      hasRole("supervisor") ||
                                                                      hasRole("admin")) && (
                                                                      <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                        onClick={(e) => {
                                                                          e.stopPropagation();
                                                                          setProblemDialog({
                                                                            driverId: truck.driverId!,
                                                                            driverName: truck.driver,
                                                                            truckNumber: truck.truckNumber,
                                                                            dispatcherName: truck.dispatcher || "",
                                                                          });
                                                                        }}
                                                                      >
                                                                        <AlertCircle className="h-3 w-3 text-destructive" />
                                                                      </Button>
                                                                    )}
                                                                  </>
                                                                )}
                                                              </div>
                                                            </div>
                                                            <Popover>
                                                              <PopoverTrigger asChild>
                                                                <p className="text-xs cursor-pointer hover:opacity-70 transition-opacity">
                                                                  🚚 Truck: {truck.truckNumber}
                                                                </p>
                                                              </PopoverTrigger>
                                                              <PopoverContent
                                                                className="w-auto p-2 text-xs space-y-0.5"
                                                                side="top"
                                                              >
                                                                <p className="font-semibold">
                                                                  🚚 Truck: {truck.truckNumber}
                                                                </p>
                                                                <p>VIN: {(truck as any).truckVin || "N/A"}</p>
                                                                <p>Plate: {(truck as any).truckPlate || "N/A"}</p>
                                                              </PopoverContent>
                                                            </Popover>
                                                            {truck.trailerNumber && (
                                                              <Popover>
                                                                <PopoverTrigger asChild>
                                                                  <p className="text-xs cursor-pointer hover:opacity-70 transition-opacity">
                                                                    🚛 Trailer: {truck.trailerNumber}
                                                                  </p>
                                                                </PopoverTrigger>
                                                                <PopoverContent
                                                                  className="w-auto p-2 text-xs space-y-0.5"
                                                                  side="top"
                                                                >
                                                                  <p className="font-semibold">
                                                                    🚛 Trailer: {truck.trailerNumber}
                                                                  </p>
                                                                  <p>VIN: {(truck as any).trailerVin || "N/A"}</p>
                                                                  <p>Plate: {(truck as any).trailerPlate || "N/A"}</p>
                                                                </PopoverContent>
                                                              </Popover>
                                                            )}
                                                            {truck.driverPhone && (
                                                              <p className="text-xs">📞 {truck.driverPhone}</p>
                                                            )}
                                                            {truck.driverEmail && (
                                                              <div className="flex items-center justify-between gap-1">
                                                                <p className="text-xs">✉️ {truck.driverEmail}</p>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-5 w-5 p-0 flex-shrink-0"
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const text = `Driver name: ${truck.driver}\n🚚 Truck: ${truck.truckNumber}\n🚛 Trailer: ${truck.trailerNumber || "N/A"}\n📞 ${truck.driverPhone || "N/A"}`;
                                                                    navigator.clipboard.writeText(text);
                                                                    toast({ title: "Copied to clipboard" });
                                                                  }}
                                                                >
                                                                  <ClipboardCopy className="h-3 w-3" />
                                                                </Button>
                                                              </div>
                                                            )}
                                                            {((truck as any).emergencyContactName ||
                                                              (truck as any).emergencyContactPhone) && (
                                                              <div className="border-t pt-1 mt-1">
                                                                <p className="font-semibold text-xs mb-0.5">
                                                                  Emergency Contact
                                                                </p>
                                                                {(truck as any).emergencyContactName && (
                                                                  <p className="text-xs">
                                                                    👤 {(truck as any).emergencyContactName}
                                                                    {(truck as any).emergencyContactRelation
                                                                      ? ` (${(truck as any).emergencyContactRelation})`
                                                                      : ""}
                                                                  </p>
                                                                )}
                                                                {(truck as any).emergencyContactPhone && (
                                                                  <p className="text-xs">
                                                                    📞 {(truck as any).emergencyContactPhone}
                                                                  </p>
                                                                )}
                                                              </div>
                                                            )}
                                                            <div className="flex items-center gap-1.5 border-t pt-1 mt-1 flex-wrap">
                                                              {(truck as any).driverHazmat && (
                                                                <img
                                                                  src={biohazardSignIcon}
                                                                  alt="Hazmat"
                                                                  className="h-5 w-5"
                                                                  title="Hazmat"
                                                                />
                                                              )}
                                                              {(truck as any).driverTanker && (
                                                                <img
                                                                  src={tankerTruckIcon}
                                                                  alt="Tanker"
                                                                  className="h-5 w-5"
                                                                  title="Tanker"
                                                                />
                                                              )}
                                                              {(truck as any).driverTwic && (
                                                                <img
                                                                  src={portIcon}
                                                                  alt="TWIC"
                                                                  className="h-5 w-5"
                                                                  title="TWIC"
                                                                />
                                                              )}
                                                              {(truck as any).driverCitizen ? (
                                                                <img
                                                                  src={passportIcon}
                                                                  alt="Citizen"
                                                                  className="h-5 w-5"
                                                                  title="Citizen"
                                                                />
                                                              ) : (
                                                                <img
                                                                  src={greenCardIcon}
                                                                  alt="Green-Card"
                                                                  className="h-5 w-5"
                                                                  title="Green-Card"
                                                                />
                                                              )}
                                                              {(truck as any).driverCriminal && (
                                                                <img
                                                                  src={criminalDatabaseIcon}
                                                                  alt="Criminal"
                                                                  className="h-5 w-5"
                                                                  title="Criminal Record"
                                                                />
                                                              )}
                                                              {(truck as any).trailerVented && (
                                                                <img
                                                                  src={ventedIcon}
                                                                  alt="Vented"
                                                                  className="h-5 w-5"
                                                                  title="Vented Trailer"
                                                                />
                                                              )}
                                                              {((truck as any).driverStraps ?? 2) > 0 && (
                                                                <span
                                                                  className="flex items-center gap-0.5"
                                                                  title="Straps"
                                                                >
                                                                  <span className="text-xs font-medium">
                                                                    {(truck as any).driverStraps ?? 2}x
                                                                  </span>
                                                                  <img
                                                                    src={strapIcon}
                                                                    alt="Straps"
                                                                    className="h-5 w-5 pt-[2px]"
                                                                  />
                                                                </span>
                                                              )}
                                                              {((truck as any).driverLoadBars ?? 0) > 0 && (
                                                                <span
                                                                  className="flex items-center gap-0.5"
                                                                  title="Load Bars"
                                                                >
                                                                  <span className="text-xs font-medium">
                                                                    {(truck as any).driverLoadBars}x
                                                                  </span>
                                                                  <img
                                                                    src={loadBarIcon}
                                                                    alt="Load Bars"
                                                                    className="h-[26px] w-[26px]"
                                                                  />
                                                                </span>
                                                              )}
                                                            </div>
                                                          </>
                                                        )}
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                )}
                                              </div>
                                              {/* Show original dispatcher name for drivers belonging to off-duty dispatchers (only in active sections) */}
                                              {(truck as any).originalDispatcherName && !(group as any).isOffDuty && (
                                                <div className="text-[9px] text-muted-foreground italic mt-0.5">
                                                  Disp: {(truck as any).originalDispatcherName}
                                                </div>
                                              )}
                                              {/* Show current dispatcher name for drivers in off-duty sections */}
                                              {(truck as any).currentDispatcherName && (group as any).isOffDuty && (
                                                <div className="text-xs text-foreground font-medium mt-0.5">
                                                  Disp: {(truck as any).currentDispatcherName}
                                                </div>
                                              )}
                                              {/* Afterhours/Weekend schedule assignment label - only visible during weekend window */}
                                              {isWeekendWindow &&
                                                truck.driverId &&
                                                driverAfterhoursMap.has(truck.driverId) && (
                                                  <div className="flex items-center gap-0.5 text-[9px] font-semibold mt-0.5 px-1 rounded bg-amber-300/80 text-amber-900 w-fit">
                                                    <CalendarIcon className="h-2.5 w-2.5" />
                                                    {driverAfterhoursMap.get(truck.driverId)!.userName}
                                                  </div>
                                                )}
                                            </div>
                                            {/* Add Daily Report Row Icon - Bottom Right Corner */}
                                            {canEditDailyReport && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    className="absolute bottom-0.5 right-0.5 p-0.5 hover:bg-accent/50 rounded transition-colors text-muted-foreground hover:text-primary"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setAddDailyReportDialog({
                                                        truckNumber: truck.truckNumber || "",
                                                        driverName: truck.driver1Name || truck.driver || null,
                                                        dispatcherName:
                                                          (truck as any).currentDispatcherName ||
                                                          (truck as any).originalDispatcherName ||
                                                          truck.dispatcherName ||
                                                          null,
                                                        office: (group as any).office ?? null,
                                                      });
                                                    }}
                                                  >
                                                    <ClipboardList className="h-4 w-4" />
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs">Add Daily Report Row</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </td>
                                          <td
                                            className="border-r border-b-[6px] border-gray-400 px-2 py-1 text-xs"
                                            style={{
                                              width: "136px",
                                              minWidth: "136px",
                                              maxWidth: "136px",
                                            }}
                                          >
                                            <div
                                              className="flex items-center gap-1"
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              {!truck.home || truck.home === "—" ? (
                                                <TruckMapDialog
                                                  truckNumber={truck.truckNumber}
                                                  truckId={truck.id}
                                                  pickupAddress={
                                                    currentOrder?.pickupStop
                                                      ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim()
                                                      : undefined
                                                  }
                                                  deliveryAddress={
                                                    currentOrder?.deliveryStop
                                                      ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim()
                                                      : undefined
                                                  }
                                                  pickupDate={truck.pickup?.date}
                                                  pickupTime={truck.pickup?.time}
                                                  deliveryDate={truck.delivery?.date}
                                                  deliveryTime={truck.delivery?.time}
                                                  loadNumber={currentOrder?.load_number}
                                                  brokerLoadNumber={currentOrder?.broker_load_number}
                                                  hasBOL={hasBOL}
                                                  hasPOD={hasPOD}
                                                  pickupArrived={pickupArrived}
                                                  isOpen={isMapExpanded}
                                                  onOpenChange={(open) => setExpandedTruckMap(open ? truck.id : null)}
                                                >
                                                  <MapPin
                                                    className="text-destructive cursor-pointer hover:text-destructive/80 transition-colors"
                                                    style={{
                                                      width: "12px",
                                                      height: "12px",
                                                      flexShrink: 0,
                                                    }}
                                                    size={12}
                                                  />
                                                </TruckMapDialog>
                                              ) : (
                                                <>
                                                  <TruckMapDialog
                                                    truckNumber={truck.truckNumber}
                                                    truckId={truck.id}
                                                    pickupAddress={
                                                      currentOrder?.pickupStop
                                                        ? `${currentOrder.pickupStop.address || ""}, ${currentOrder.pickupStop.city || ""}, ${currentOrder.pickupStop.state || ""} ${currentOrder.pickupStop.zip_code || ""}`.trim()
                                                        : undefined
                                                    }
                                                    deliveryAddress={
                                                      currentOrder?.deliveryStop
                                                        ? `${currentOrder.deliveryStop.address || ""}, ${currentOrder.deliveryStop.city || ""}, ${currentOrder.deliveryStop.state || ""} ${currentOrder.deliveryStop.zip_code || ""}`.trim()
                                                        : undefined
                                                    }
                                                    pickupDate={truck.pickup?.date}
                                                    pickupTime={truck.pickup?.time}
                                                    deliveryDate={truck.delivery?.date}
                                                    deliveryTime={truck.delivery?.time}
                                                    loadNumber={currentOrder?.load_number}
                                                    brokerLoadNumber={currentOrder?.broker_load_number}
                                                    hasBOL={hasBOL}
                                                    hasPOD={hasPOD}
                                                    pickupArrived={pickupArrived}
                                                    isOpen={isMapExpanded}
                                                    onOpenChange={(open) => setExpandedTruckMap(open ? truck.id : null)}
                                                  >
                                                    <MapPin
                                                      className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                                      style={{
                                                        width: "12px",
                                                        height: "12px",
                                                        flexShrink: 0,
                                                      }}
                                                      size={12}
                                                    />
                                                  </TruckMapDialog>
                                                  <span className="text-[10px]">{truck.home}</span>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                          {modifiedCells}
                                          {/* Merged cell for Away, Drive, Shift, Cycle with Notes at bottom */}
                                          <td
                                            colSpan={4}
                                            className={`border-r border-b-[6px] border-gray-400 p-0 relative ${hasExpiredHOS ? "bg-destructive/50" : ""}`}
                                            style={{
                                              height: "64px",
                                            }}
                                          >
                                            {/* Proximity sticky note */}
                                            {proximityMatchedTrucks && proximityMatchedTrucks.has(truck.id) && (
                                              <div
                                                className="absolute pointer-events-none"
                                                style={{
                                                  left: "-140px",
                                                  top: "-14px",
                                                  zIndex: 60,
                                                  width: "135px",
                                                  height: "48px",
                                                }}
                                              >
                                                <svg
                                                  width="135"
                                                  height="48"
                                                  viewBox="0 0 135 48"
                                                  fill="none"
                                                  xmlns="http://www.w3.org/2000/svg"
                                                >
                                                  <path
                                                    d="M2 2 L133 2 L133 34 L20 34 L10 46 L10 34 L2 34 Z"
                                                    fill="#F5E6A3"
                                                    stroke="#333"
                                                    strokeWidth="1.2"
                                                  />
                                                </svg>
                                                <span
                                                  className="absolute inset-0 flex items-start justify-center font-bold"
                                                  style={{
                                                    fontSize: "13px",
                                                    color: "#1a1a5e",
                                                    paddingTop: "8px",
                                                    paddingBottom: "14px",
                                                  }}
                                                >
                                                  ~{proximityMatchedTrucks.get(truck.id)} mi away
                                                </span>
                                              </div>
                                            )}
                                            <div
                                              className={`h-8 border-b border-border flex items-center justify-around px-1 ${hasExpiredHOS ? "bg-destructive/50" : ""}`}
                                            >
                                              {/* Away Days - Show distance in miles (read-only) */}
                                              <div className="flex flex-col items-center">
                                                <div className="flex items-center w-[58px] justify-end">
                                                  <div className="text-xs text-[hsl(var(--info))] font-medium px-1 tabular-nums">
                                                    {truck.milesAway == null ? "—" : Math.round(truck.milesAway)}
                                                  </div>
                                                  {truck.totalMiles > 0 && (
                                                    <span className="text-xs text-muted-foreground font-medium tabular-nums">
                                                      /{Math.round(truck.totalMiles)}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              {/* HOS Circular Timers */}
                                              {truck.doNotTouchHos && (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <span className="text-base cursor-pointer select-none">🚧</span>
                                                  </PopoverTrigger>
                                                  <PopoverContent
                                                    side="top"
                                                    className="w-auto px-3 py-1.5 text-xs font-semibold"
                                                  >
                                                    DRIVES LEGALLY
                                                  </PopoverContent>
                                                </Popover>
                                              )}
                                              <HosCircularTimer
                                                minutes={truck.driveMinutes}
                                                maxMinutes={11 * 60}
                                                label="DRIVE"
                                                color="#84cc16"
                                                size={31}
                                                strokeWidth={3}
                                              />
                                              <HosCircularTimer
                                                minutes={truck.shiftMinutes}
                                                maxMinutes={14 * 60}
                                                label="SHIFT"
                                                color="#06b6d4"
                                                size={31}
                                                strokeWidth={3}
                                              />
                                              <HosCircularTimer
                                                minutes={truck.breakMinutes}
                                                maxMinutes={8 * 60}
                                                label="BREAK"
                                                color="#8b5cf6"
                                                size={31}
                                                strokeWidth={3}
                                              />
                                              <HosCircularTimer
                                                minutes={truck.cycleMinutes}
                                                maxMinutes={70 * 60}
                                                label="CYCLE"
                                                color="hsl(var(--muted-foreground))"
                                                size={31}
                                                strokeWidth={3}
                                              />
                                              {truck.doNotTouchHos && (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <span className="text-base cursor-pointer select-none">🚧</span>
                                                  </PopoverTrigger>
                                                  <PopoverContent
                                                    side="top"
                                                    className="w-auto px-3 py-1.5 text-xs font-semibold"
                                                  >
                                                    DRIVES LEGALLY
                                                  </PopoverContent>
                                                </Popover>
                                              )}
                                              {/* Fuel Indicator */}
                                              <div
                                                className="relative flex items-center justify-center"
                                                style={{ width: 31, height: 42 }}
                                              >
                                                <img
                                                  src={gasStationIcon}
                                                  alt="fuel"
                                                  className="w-[31px] h-[31px] opacity-60"
                                                  style={{
                                                    filter:
                                                      truck.fuelLevel != null && truck.fuelLevel < 10
                                                        ? "invert(22%) sepia(95%) saturate(6000%) hue-rotate(355deg) brightness(95%) contrast(95%)"
                                                        : undefined,
                                                  }}
                                                />
                                                <span
                                                  className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums ${truck.fuelLevel != null && truck.fuelLevel < 10 ? "text-destructive" : "text-foreground"}`}
                                                  style={{ paddingTop: 2 }}
                                                >
                                                  {truck.fuelLevel != null ? `${truck.fuelLevel}%` : "—"}
                                                </span>
                                              </div>
                                              {canSeeWeekRevenue(truck) && (
                                                <TruckWeekRevenuePopover
                                                  orders={truck.allOrders}
                                                  referenceDate={addDays(startDate, 2)}
                                                  driverId={truck.driverId}
                                                  driver2Id={truck.driver2Id}
                                                />
                                              )}
                                            </div>
                                            <div className="h-8 p-0 w-full">
                                              <EditableNoteField
                                                truckId={truck.id}
                                                driverId={truck.driverId}
                                                value={truck.note}
                                                handleNoteChange={handleNoteChange}
                                                setNoteDialogContent={setNoteDialogContent}
                                                setNoteDialogOpen={setNoteDialogOpen}
                                                onHistoryClick={setHistoryDialogDriverId}
                                                isFinalUpdateWindow={isFinalUpdateWindow}
                                                isFinalUpdateSent={finalUpdateSentTruckIds.has(truck.id)}
                                              />
                                            </div>
                                          </td>
                                          <td
                                            className={`border-b-[6px] border-gray-400 px-1 py-1 text-[10px] text-muted-foreground text-center ${sidebarOpen ? "border-r border-border" : ""} relative`}
                                            style={{
                                              width: "80px",
                                              minWidth: "80px",
                                              maxWidth: "80px",
                                            }}
                                          >
                                            {activeTab === "Recovery" &&
                                              truck.activeOrders?.some((o: any) => {
                                                const order = o as any;
                                                const hasPOD = order.order_files?.some(
                                                  (file: any) => file.file_category === "POD",
                                                );
                                                return order.is_recovery && !hasPOD;
                                              }) && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="absolute top-1 right-1 h-auto px-2 py-1 bg-background hover:bg-green-500/20 rounded z-[50] border border-green-500/50"
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const recoveryOrder = truck.activeOrders.find((o: any) => {
                                                      const order = o as any;
                                                      const hasPOD = order.order_files?.some(
                                                        (file: any) => file.file_category === "POD",
                                                      );
                                                      return order.is_recovery && !hasPOD;
                                                    });
                                                    if (!recoveryOrder) return;

                                                    try {
                                                      const order = recoveryOrder as any;

                                                      const { data: recoveryHistory, error: historyError } =
                                                        await supabase
                                                          .from("recovery_history")
                                                          .select("*")
                                                          .eq("order_id", order.id)
                                                          .is("reverted_at", null)
                                                          .order("created_at", { ascending: false })
                                                          .limit(1)
                                                          .single();

                                                      if (historyError || !recoveryHistory) {
                                                        toast({
                                                          title: "No recovery history found",
                                                          description: "Cannot revert this load",
                                                          variant: "destructive",
                                                        });
                                                        return;
                                                      }

                                                      const { error: orderError } = await supabase
                                                        .from("orders")
                                                        .update({
                                                          is_recovery: false,
                                                          driver1_id: recoveryHistory.original_driver1_id,
                                                          driver2_id: recoveryHistory.original_driver2_id,
                                                          truck_id: recoveryHistory.original_truck_id,
                                                          trailer_id: recoveryHistory.original_trailer_id,
                                                          original_driver1_id: null,
                                                          original_driver2_id: null,
                                                          original_truck_id: null,
                                                          original_trailer_id: null,
                                                          original_miles: null,
                                                          original_freight_amount: null,
                                                          original_driver_price: null,
                                                          recovery_miles: null,
                                                          recovery_freight_amount: null,
                                                          recovery_driver_price: null,
                                                          recovery_date: null,
                                                        })
                                                        .eq("id", order.id);

                                                      if (orderError) throw orderError;

                                                      const { error: truckError } = await supabase
                                                        .from("trucks")
                                                        .update({
                                                          driver1_id: recoveryHistory.original_driver1_id,
                                                          driver2_id: recoveryHistory.original_driver2_id,
                                                          needs_recovery: false,
                                                          left_by_driver_id: null,
                                                        })
                                                        .eq("id", recoveryHistory.original_truck_id);

                                                      if (truckError) throw truckError;

                                                      if (
                                                        recoveryHistory.original_driver1_id &&
                                                        recoveryHistory.original_dispatcher_id
                                                      ) {
                                                        const { error: dispatcherError } = await supabase
                                                          .from("drivers")
                                                          .update({
                                                            dispatcher_id: recoveryHistory.original_dispatcher_id,
                                                          })
                                                          .eq("id", recoveryHistory.original_driver1_id);

                                                        if (dispatcherError) throw dispatcherError;
                                                      }

                                                      await supabase
                                                        .from("order_transfers")
                                                        .delete()
                                                        .eq("order_id", order.id);

                                                      const {
                                                        data: { user },
                                                      } = await supabase.auth.getUser();
                                                      await supabase
                                                        .from("recovery_history")
                                                        .update({
                                                          reverted_at: new Date().toISOString(),
                                                          reverted_by: user?.id || null,
                                                        })
                                                        .eq("id", recoveryHistory.id);

                                                      toast({
                                                        title: "Recovery reverted",
                                                        description: `Load ${recoveryOrder.load_number} returned to original driver`,
                                                      });
                                                    } catch (error) {
                                                      toast({
                                                        title: "Failed to revert",
                                                        description:
                                                          error instanceof Error ? error.message : "Unknown error",
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <span className="text-[10px] text-green-600">Revert</span>
                                                </Button>
                                              )}
                                            <div>{truck.lastEdit}</div>
                                            {truck.editDate && (
                                              <div className="text-muted-foreground">{truck.editDate}</div>
                                            )}
                                          </td>
                                        </tr>
                                        {isMapExpanded && (
                                          <tr key={`${truck.id}-map`}>
                                            <td colSpan={13} className="p-4 border-b-[3px] border-border">
                                              <TruckMapView
                                                truckNumber={truck.truckNumber}
                                                truckId={truck.id}
                                                pickupAddresses={currentOrder?.pickupStops
                                                  ?.map((stop: any) =>
                                                    `${stop.address || ""}, ${stop.city || ""}, ${stop.state || ""} ${stop.zip_code || ""}`.trim(),
                                                  )
                                                  .filter((addr: string) => addr && addr !== ", ,")}
                                                deliveryAddresses={currentOrder?.deliveryStops
                                                  ?.map((stop: any) =>
                                                    `${stop.address || ""}, ${stop.city || ""}, ${stop.state || ""} ${stop.zip_code || ""}`.trim(),
                                                  )
                                                  .filter((addr: string) => addr && addr !== ", ,")}
                                                completedDeliveryCount={
                                                  currentOrder?.order_files?.filter(
                                                    (file: any) => file.file_category === "POD",
                                                  ).length || 0
                                                }
                                                homeLatitude={
                                                  truck.homeLatitude ?? truck.driver1?.home_latitude ?? null
                                                }
                                                homeLongitude={
                                                  truck.homeLongitude ?? truck.driver1?.home_longitude ?? null
                                                }
                                                homeCity={truck.homeCity ?? truck.driver1?.home_city ?? null}
                                                homeState={truck.homeState ?? truck.driver1?.home_state ?? null}
                                                pickupDate={truck.pickup?.date}
                                                pickupTime={truck.pickup?.time}
                                                deliveryDate={truck.delivery?.date}
                                                deliveryTime={truck.delivery?.time}
                                                loadNumber={currentOrder?.load_number}
                                                brokerLoadNumber={currentOrder?.broker_load_number}
                                                hasBOL={hasBOL}
                                                hasPOD={hasPOD}
                                                pickupArrived={pickupArrived}
                                              />
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                              </tbody>
                            </table>

                            {/* Load More Trigger */}
                            {group.trucks.length > (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT) && (
                              <div className="flex justify-center py-4">
                                <Button
                                  variant="outline"
                                  onClick={() => handleLoadMore(group.dispatcherId)}
                                  className="w-full max-w-md"
                                >
                                  Load More Trucks (
                                  {group.trucks.length - (visibleTrucks[group.dispatcherId] || INITIAL_TRUCK_COUNT)}{" "}
                                  remaining)
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen !== null} onOpenChange={(open) => !open && setNoteDialogOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Full Note</DialogTitle>
            <DialogDescription className="sr-only">View and edit the full note content</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={noteDialogContent}
              onChange={(e) => setNoteDialogContent(e.target.value)}
              className="min-h-[200px] w-full"
              placeholder="Add note..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setNoteDialogOpen(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (noteDialogOpen) {
                    await handleNoteChange(noteDialogOpen.truckId, noteDialogOpen.driverId, noteDialogContent);
                    setNoteDialogOpen(null);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drug Test Dialog */}
      <Dialog open={!!dialogs.drugTestDialog} onOpenChange={(open) => !open && dialogs.setDrugTestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drug Test Result - {dialogs.drugTestDialog?.driverName}</DialogTitle>
            <DialogDescription className="sr-only">Record drug test result for this driver</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Test Result</label>
              <Select
                value={getDrugTestForDriver(dialogs.drugTestDialog?.driverId || "")?.result || "pending"}
                onValueChange={(value) => {
                  if (dialogs.drugTestDialog?.driverId && dialogs.drugTestDialog?.truckId) {
                    console.log("Updating drug test:", {
                      driverId: dialogs.drugTestDialog.driverId,
                      driverName: dialogs.drugTestDialog.driverName,
                      truckId: dialogs.drugTestDialog.truckId,
                      result: value,
                    });
                    upsertDrugTest.mutate({
                      driverId: dialogs.drugTestDialog.driverId,
                      result: value as "positive" | "negative" | "pending",
                      truckId: dialogs.drugTestDialog.truckId,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Yard Action Dialog */}
      <Dialog
        open={!!yardActionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setYardActionDialog(null);
            setYardActionType("");
            setYardActionComment("");
            setYardActionDatetime(new Date());
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Yard Action -{" "}
              {yardActionDialog?.driver2Name
                ? `${yardActionDialog?.driverName} & ${yardActionDialog?.driver2Name}`
                : yardActionDialog?.driverName}
            </DialogTitle>
            <DialogDescription className="sr-only">Set yard action for this driver</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Action Type <span className="text-destructive">*</span>
              </label>
              <Select
                value={yardActionType}
                onValueChange={(value: "maintenance" | "return_truck" | "recovery" | "safety") =>
                  setYardActionType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="return_truck">Return Truck</SelectItem>
                  <SelectItem value="recovery">Recoveries</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={yardActionComment}
                onChange={(e) => setYardActionComment(e.target.value)}
                placeholder="Enter reason..."
                rows={4}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Arrival Date & Time <span className="text-destructive">*</span>
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !yardActionDatetime && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {yardActionDatetime ? format(yardActionDatetime, "PPP p") : <span>Pick a date and time</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={yardActionDatetime}
                    onSelect={(date) => {
                      if (date) {
                        // Preserve existing time when selecting new date
                        const newDate = new Date(date);
                        if (yardActionDatetime) {
                          newDate.setHours(yardActionDatetime.getHours());
                          newDate.setMinutes(yardActionDatetime.getMinutes());
                        }
                        setYardActionDatetime(newDate);
                      }
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  <div className="border-t p-3 space-y-2">
                    <label className="text-sm font-medium">Time</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={yardActionDatetime?.getHours() || 0}
                        onChange={(e) => {
                          const hours = parseInt(e.target.value) || 0;
                          const newDate = yardActionDatetime ? new Date(yardActionDatetime) : new Date();
                          newDate.setHours(Math.min(23, Math.max(0, hours)));
                          setYardActionDatetime(newDate);
                        }}
                        className="w-20"
                        placeholder="HH"
                      />
                      <span className="flex items-center">:</span>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={yardActionDatetime?.getMinutes() || 0}
                        onChange={(e) => {
                          const minutes = parseInt(e.target.value) || 0;
                          const newDate = yardActionDatetime ? new Date(yardActionDatetime) : new Date();
                          newDate.setMinutes(Math.min(59, Math.max(0, minutes)));
                          setYardActionDatetime(newDate);
                        }}
                        className="w-20"
                        placeholder="MM"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setYardActionDialog(null);
                  setYardActionType("");
                  setYardActionComment("");
                  setYardActionDatetime(new Date());
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!yardActionType || !yardActionComment.trim() || !yardActionDatetime}
                onClick={async () => {
                  if (!yardActionDialog || !yardActionType || !yardActionComment.trim() || !yardActionDatetime) return;

                  const driverIds = [yardActionDialog.driverId];
                  if (yardActionDialog.driver2Id) {
                    driverIds.push(yardActionDialog.driver2Id);
                  }

                  const isTeam = !!yardActionDialog.driver2Id;

                  // Insert single yard action (for teams, only create one with is_team flag)
                  const { data: insertedAction, error: insertError } = await supabase
                    .from("driver_yard_actions")
                    .insert({
                      driver_id: yardActionDialog.driverId,
                      action_type: yardActionType,
                      comment: yardActionComment.trim(),
                      arrival_datetime: yardActionDatetime.toISOString(),
                      created_by: profile?.user_id,
                      is_team: isTeam,
                      truck_number: yardActionDialog.truckNumber || null,
                    })
                    .select("id")
                    .single();

                  if (insertError) {
                    toast({
                      title: "Error",
                      description: "Failed to save yard action",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Fire-and-forget translation of the comment (Serbian -> English)
                  if (insertedAction?.id) {
                    supabase.functions
                      .invoke("translate-yard-note", {
                        body: { id: insertedAction.id, text: yardActionComment.trim() },
                      })
                      .catch((e) => console.error("translate-yard-note failed:", e));
                  }

                  const { error: updateError } = await supabase
                    .from("drivers")
                    .update({ going_yard: true })
                    .in("id", driverIds);

                  if (updateError) {
                    toast({
                      title: "Warning",
                      description: "Yard action saved but failed to update going_yard status",
                      variant: "destructive",
                    });
                  } else {
                    const driverNames = yardActionDialog.driver2Name
                      ? `${yardActionDialog.driverName} & ${yardActionDialog.driver2Name}`
                      : yardActionDialog.driverName;
                    toast({
                      title: "Success",
                      description: `Yard action saved for ${driverNames}`,
                    });
                    // Real-time subscription handles cache updates

                    // Send SMS notification for new yard arrival
                    try {
                      const actionTypeLabels: Record<string, string> = {
                        maintenance: "Maintenance",
                        return_truck: "Returning Truck",
                        recovery: "Recovery",
                        safety: "Safety",
                      };

                      const formattedDate = format(yardActionDatetime, "MMM dd 'at' h:mm a");

                      const smsMessage =
                        `New Yard Arrival:\n` +
                        `Truck: ${yardActionDialog.truckNumber || "N/A"}\n` +
                        `Driver: ${driverNames}\n` +
                        `Type: ${actionTypeLabels[yardActionType] || yardActionType}\n` +
                        `Date: ${formattedDate}\n` +
                        `Note: ${yardActionComment.trim()}`;

                      supabase.functions
                        .invoke("send-sms", {
                          body: {
                            message: smsMessage,
                            phoneNumbers: ["+12192465764", "+18474835375", "+15743787396"],
                          },
                        })
                        .catch((smsError) => {
                          console.error("Failed to send SMS notification:", smsError);
                        });
                    } catch (smsError) {
                      console.error("Failed to send SMS notification:", smsError);
                    }
                  }

                  setYardActionDialog(null);
                  setYardActionType("");
                  setYardActionComment("");
                  setYardActionDatetime(new Date());
                }}
              >
                {yardActionDialog?.driver2Id ? "Save for Both Drivers" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Two Week Notice Dialog */}
      <Dialog open={!!twoWeekNoticeDialog} onOpenChange={(open) => !open && setTwoWeekNoticeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set 2 Week Notice -{" "}
              {twoWeekNoticeDialog?.driver2Name
                ? `${twoWeekNoticeDialog?.driverName} & ${twoWeekNoticeDialog?.driver2Name}`
                : twoWeekNoticeDialog?.driverName}
            </DialogTitle>
            <DialogDescription className="sr-only">Set the 2 week notice end date for this driver</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Last Date of 2 Week Notice</Label>
              <DatePicker date={twoWeekNoticeDate} onDateChange={setTwoWeekNoticeDate} placeholder="Select last date" />
              {twoWeekNoticeDate && (
                <p className="text-xs text-muted-foreground">
                  Start date was:{" "}
                  {format(new Date(twoWeekNoticeDate.getTime() - 14 * 24 * 60 * 60 * 1000), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTwoWeekNoticeDialog(null);
                  setTwoWeekNoticeDate(new Date());
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!twoWeekNoticeDate}
                onClick={async () => {
                  if (!twoWeekNoticeDialog || !twoWeekNoticeDate) return;

                  const driverIds = [twoWeekNoticeDialog.driverId];
                  if (twoWeekNoticeDialog.driver2Id) {
                    driverIds.push(twoWeekNoticeDialog.driver2Id);
                  }

                  const { error } = await supabase
                    .from("drivers")
                    .update({ two_week_block_date: format(twoWeekNoticeDate, "yyyy-MM-dd") })
                    .in("id", driverIds);

                  if (error) {
                    toast({
                      title: "Error",
                      description: "Failed to set 2 week notice",
                      variant: "destructive",
                    });
                    return;
                  }

                  const driverNames = twoWeekNoticeDialog.driver2Name
                    ? `${twoWeekNoticeDialog.driverName} & ${twoWeekNoticeDialog.driver2Name}`
                    : twoWeekNoticeDialog.driverName;
                  toast({
                    title: "Success",
                    description: `2 week notice set for ${driverNames}`,
                  });
                  // Real-time subscription handles reports cache updates
                  queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });

                  setTwoWeekNoticeDialog(null);
                  setTwoWeekNoticeDate(new Date());
                }}
              >
                {twoWeekNoticeDialog?.driver2Id ? "Save for Both Drivers" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TruckNoteHistoryDialog
        driverId={historyDialogDriverId}
        open={!!historyDialogDriverId}
        onOpenChange={(open) => !open && setHistoryDialogDriverId(null)}
      />

      {/* Load Zoom Dialog */}
      <Dialog
        open={!!zoomedLoad}
        onOpenChange={(open) => {
          if (!open) {
            lastZoomedLoadCloseTime.current = Date.now();
            setZoomedLoad(null);
          }
        }}
      >
        <DialogContent
          className="max-w-6xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-lg font-semibold">
                    Load #{zoomedLoad?.internalLoadNumber} • Broker #{zoomedLoad?.brokerLoadNumber}
                  </div>
                  <div className="text-sm text-muted-foreground font-normal flex flex-wrap items-start gap-x-6 gap-y-1">
                    <div className="flex flex-col leading-tight">
                      <span>${zoomedLoad?.freightAmount?.toLocaleString() || 0} freight</span>
                      {zoomedLoad?.loadedMiles && zoomedLoad.loadedMiles > 0 ? (
                        <span className="text-xs text-muted-foreground/80">
                          {(zoomedLoad.freightAmount / zoomedLoad.loadedMiles).toFixed(2)}/mi RPM
                        </span>
                      ) : null}
                    </div>

                    {(() => {
                      const isDispatchOnly =
                        hasRole("dispatch") &&
                        !hasRole("admin") &&
                        !hasRole("manager") &&
                        !hasRole("supervisor") &&
                        !hasRole("afterhours") &&
                        !hasRole("safety") &&
                        !hasRole("accounting");
                      if (isDispatchOnly) return null;
                      return (
                        <div className="flex flex-col leading-tight">
                          <span>${zoomedLoad?.driverPay?.toLocaleString() || 0} Stop Amt</span>
                          {zoomedLoad?.loadedMiles && zoomedLoad.loadedMiles > 0 ? (
                            <span className="text-xs text-muted-foreground/80">
                              {(zoomedLoad.driverPay / zoomedLoad.loadedMiles).toFixed(2)}/mi RPM
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}

                    <div className="flex flex-col leading-tight">
                      <span>{zoomedLoad?.loadedMiles?.toLocaleString() || 0} mi</span>
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span>{zoomedLoad?.dhMiles?.toLocaleString() || 0} dh mi</span>
                    </div>
                    {zoomedLoad?.weightBol ? (
                      <div className="flex flex-col leading-tight">
                        <span>{zoomedLoad.weightBol.toLocaleString()} lbs</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground font-normal">
                  Truck {zoomedLoad?.truckNumber} • {zoomedLoad?.driverNames}
                </div>
                {zoomedLoad?.bookedByCompanyName && (
                  <div className="text-sm text-muted-foreground font-normal">
                    Booked by: {zoomedLoad.bookedByCompanyName}
                  </div>
                )}
                {zoomedLoad?.brokerName && (
                  <div className="text-sm text-muted-foreground font-normal">Broker: {zoomedLoad.brokerName}</div>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if (zoomedLoad?.orderId) {
                    // Mark that we're coming from reports
                    localStorage.setItem("returnToReports", "true");
                    localStorage.removeItem("returnToOrders");
                    navigate(`/edit-order/${zoomedLoad.orderId}`);
                    setZoomedLoad(null);
                  }
                }}
                className="shrink-0"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Order
              </Button>
            </DialogTitle>
            <DialogDescription className="sr-only">View load details, pickup and delivery stops</DialogDescription>
          </DialogHeader>

          {zoomedLoad &&
            !zoomedLoad.documents.includes("POD") &&
            needsScaleTicket(zoomedLoad.weightBol, zoomedLoad.orderFiles) && (
              <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-md border-2 border-yellow-500 bg-yellow-500/10">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium">
                    Scale ticket missing — BOL weight is {zoomedLoad.weightBol?.toLocaleString()} lbs (≥ 30,000).
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!zoomedLoad?.orderId) return;
                    const { data } = await supabase
                      .from("orders")
                      .select("scale_steer_axle, scale_drive_axle, scale_trailer_axle, scale_gross")
                      .eq("id", zoomedLoad.orderId)
                      .maybeSingle();
                    setScaleTicketDefaults({
                      steerAxle: (data as any)?.scale_steer_axle ?? null,
                      driveAxle: (data as any)?.scale_drive_axle ?? null,
                      trailerAxle: (data as any)?.scale_trailer_axle ?? null,
                      gross: (data as any)?.scale_gross ?? null,
                    });
                    setScaleTicketDialogOpen(true);
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Scale Ticket
                </Button>
              </div>
            )}

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {/* Pickup Stops Column */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                PICKUP STOPS
              </h3>
              {zoomedLoad?.allPickupStops && zoomedLoad.allPickupStops.length > 0 ? (
                <div className="space-y-3">
                  {zoomedLoad.allPickupStops.map((stop: any, idx: number) => {
                    const order = {
                      order_files: zoomedLoad.documents.map((cat: string) => ({
                        file_category: cat,
                      })),
                      id: zoomedLoad.orderId,
                    };
                    // For first pickup stop, skip "Going to Pickup" and show "Arrived" directly
                    // (matches cyan cell behavior where previous load delivery is complete)
                    const hasBOL = zoomedLoad.documents.includes("BOL");
                    const isFirstStop = idx === 0;
                    const previousComplete = isFirstStop ? !hasBOL : zoomedLoad.allPickupStops[idx - 1].arrived_at;

                    // Determine card color based on status
                    let cardBgClass = "bg-muted";
                    if (stop.arrived_at) {
                      cardBgClass = "bg-blue-500/20 border-blue-500/50";
                    } else if (zoomedLoad.documents.includes("POD")) {
                      cardBgClass = "bg-green-500/20 border-green-500/50";
                    } else if (zoomedLoad.documents.includes("BOL")) {
                      cardBgClass = "bg-lime-500/20 border-lime-500/50";
                    }
                    return (
                      <div key={stop.id || idx} className={`p-4 rounded-lg border-2 shadow-sm ${cardBgClass}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm text-muted-foreground font-medium">Stop #{idx + 1}</div>
                          {stop.arrived_at && (
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-semibold">
                              <Check className="h-4 w-4" />
                              Arrived
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-base font-semibold">{stop.address}</div>
                          <div className="text-base">
                            {stop.city}, {stop.state} {stop.zip_code}
                          </div>
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Clock className="h-4 w-4" />
                            {formatDateTime(stop.datetime, "MM/dd/yyyy")}{" "}
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                          {stop.arrived_at && (
                            <div className="flex items-center gap-2 justify-between">
                              <div className="text-sm text-green-600 dark:text-green-400">
                                <div>Check in: {formatDateTime(stop.arrived_at, "MM/dd/yyyy, HH:mm")}</div>
                                {stop.checked_out_at && (
                                  <div>Check out: {formatDateTime(stop.checked_out_at, "MM/dd/yyyy, HH:mm")}</div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCheckInOutDialog({
                                    pickupDropId: stop.id,
                                    type: "pickup",
                                    checkInTime: stop.arrived_at,
                                    checkOutTime: stop.checked_out_at || null,
                                  });
                                }}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {stop.id && !stop.arrived_at && (
                          <div className="flex flex-col gap-2 mt-3">
                            {shouldShowGoingToPickup(order, stop, null, previousComplete) && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  markGoingToPickup.mutate({
                                    pickupDropId: stop.id,
                                  });
                                  toast({
                                    title: "Going to Pickup",
                                  });
                                }}
                                className="w-full"
                              >
                                Going to Pickup
                              </Button>
                            )}

                            {shouldShowAtPickup(order, stop, null, previousComplete) && (
                              <Button
                                onClick={() => {
                                  setArrivalTimeDialog({
                                    pickupDropId: stop.id,
                                    type: "pickup",
                                  });
                                }}
                                className="w-full"
                              >
                                Arrived at Pickup
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm p-4 bg-muted rounded-lg">No pickup stops</div>
              )}
            </div>

            {/* Delivery Stops Column */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                DELIVERY STOPS
              </h3>
              {zoomedLoad?.allDeliveryStops && zoomedLoad.allDeliveryStops.length > 0 ? (
                <div className="space-y-3">
                  {zoomedLoad.allDeliveryStops.map((stop: any, idx: number) => {
                    const order = {
                      order_files: zoomedLoad.documents.map((cat: string) => ({
                        file_category: cat,
                      })),
                      id: zoomedLoad.orderId,
                    };

                    // Determine card color based on status
                    let cardBgClass = "bg-muted";
                    if (stop.arrived_at) {
                      cardBgClass = "bg-blue-500/20 border-blue-500/50";
                    } else if (zoomedLoad.documents.includes("POD")) {
                      cardBgClass = "bg-green-500/20 border-green-500/50";
                    } else if (zoomedLoad.documents.includes("BOL")) {
                      cardBgClass = "bg-lime-500/20 border-lime-500/50";
                    }

                    // Check if delivery is late using the lateDeliveries Set
                    const isLate = !stop.arrived_at && lateDeliveries.has(zoomedLoad.orderId);
                    if (isLate) {
                      cardBgClass = "bg-red-500/20 border-red-500/50";
                    }
                    return (
                      <div key={stop.id || idx} className={`p-4 rounded-lg border-2 shadow-sm ${cardBgClass}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm text-muted-foreground font-medium">Stop #{idx + 1}</div>
                          <div className="flex items-center gap-2">
                            {isLate && (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm font-semibold">
                                <AlertCircle className="h-4 w-4" />
                                Late
                              </div>
                            )}
                            {stop.arrived_at && (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-semibold">
                                <Check className="h-4 w-4" />
                                Arrived
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-base font-semibold">{stop.address}</div>
                          <div className="text-base">
                            {stop.city}, {stop.state} {stop.zip_code}
                          </div>
                          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                            <Clock className="h-4 w-4" />
                            {formatDateTime(stop.datetime, "MM/dd/yyyy")}{" "}
                            {formatTimeRange(stop.datetime, stop.end_datetime)}
                          </div>
                          {stop.arrived_at && (
                            <div className="flex items-center gap-2 justify-between">
                              <div className="text-sm text-green-600 dark:text-green-400">
                                <div>Check in: {formatDateTime(stop.arrived_at, "MM/dd/yyyy, HH:mm")}</div>
                                {stop.checked_out_at && (
                                  <div>Check out: {formatDateTime(stop.checked_out_at, "MM/dd/yyyy, HH:mm")}</div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCheckInOutDialog({
                                    pickupDropId: stop.id,
                                    type: "delivery",
                                    checkInTime: stop.arrived_at,
                                    checkOutTime: stop.checked_out_at || null,
                                  });
                                }}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {stop.id && !stop.arrived_at && (
                          <div className="flex flex-col gap-2 mt-3">
                            {shouldShowGoingToDelivery(order, stop) && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  markGoingToDelivery.mutate({
                                    pickupDropId: stop.id,
                                  });
                                  toast({
                                    title: "Going to Delivery",
                                  });
                                }}
                                className="w-full"
                              >
                                Going to Delivery
                              </Button>
                            )}

                            {shouldShowAtDelivery(order, stop) && (
                              <Button
                                onClick={() => {
                                  setArrivalTimeDialog({
                                    pickupDropId: stop.id,
                                    type: "delivery",
                                  });
                                }}
                                className="w-full"
                              >
                                Arrived at Delivery
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm p-4 bg-muted rounded-lg">No delivery stops</div>
              )}
            </div>
          </div>

          {/* Bottom Section - Documents and Notes */}
          <div className="mt-6 space-y-4 pt-4 border-t">
            <div>
              <h4 className="text-sm font-semibold mb-3">Document Status</h4>
              <div className="flex gap-3 flex-wrap items-center">
                {["RC", "BOL", "POD", "ADDITIONAL"].map((doc) => {
                  const isChecked = zoomedLoad?.documents.includes(doc);
                  const docFiles = zoomedLoad?.orderFiles?.filter((f) => f.file_category === doc) || [];

                  return (
                    <Popover
                      key={doc}
                      open={
                        additionalFilesPopover.open &&
                        additionalFilesPopover.files[0]?.file_category === doc &&
                        docFiles.length >= 1
                      }
                      onOpenChange={async (open) => {
                        if (!open) {
                          setAdditionalFilesPopover({ open: false, files: [], anchorEl: null });
                          setDocSignedUrls({});
                        } else if (open && docFiles.length >= 1) {
                          // Pre-fetch signed URLs for all files (self-healing on stale paths)
                          const urls: Record<string, string> = {};
                          await Promise.all(
                            docFiles.map(async (file) => {
                              const { signedUrl } = await getOrderFileSignedUrl({
                                id: file.id,
                                order_id: zoomedLoad?.orderId,
                                file_category: file.file_category,
                                file_name: file.file_name,
                                file_path: file.file_path,
                              });
                              if (signedUrl) urls[file.id] = signedUrl;
                            }),
                          );
                          setDocSignedUrls(urls);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div
                          onClick={async (e) => {
                            if (!isChecked) {
                              handleDocumentClick(doc, false);
                            } else if (docFiles.length >= 1) {
                              // Always show popover list for files
                              setAdditionalFilesPopover({
                                open: true,
                                files: docFiles,
                                anchorEl: e.currentTarget as HTMLElement,
                              });
                            }
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                            isChecked
                              ? "bg-[hsl(var(--cell-delivered))] text-[hsl(var(--cell-delivered-foreground))] border-[hsl(var(--cell-delivered))] cursor-pointer"
                              : "bg-card text-muted-foreground border-border cursor-pointer hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isChecked ? <Check className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                            <span>{doc === "ADDITIONAL" ? "Additionals" : doc}</span>
                            {docFiles.length > 1 && <span className="text-xs opacity-75">({docFiles.length})</span>}
                          </div>
                        </div>
                      </PopoverTrigger>
                      {docFiles.length >= 1 && (
                        <PopoverContent className="w-64 p-2" align="start">
                          <div className="text-sm font-semibold mb-2">
                            {docFiles.length === 1 ? "File" : "Select File"}
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {docFiles.map((file, idx) => {
                              const signedUrl = docSignedUrls[file.id];

                              return (
                                <div
                                  key={file.id}
                                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted group"
                                >
                                  <a
                                    href={signedUrl || "#"}
                                    download={file.file_name}
                                    draggable={false}
                                    className="flex-1 text-sm truncate no-underline text-foreground cursor-pointer"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      let url = signedUrl;
                                      if (!url) {
                                        const { signedUrl: fresh } = await getOrderFileSignedUrl({
                                          id: file.id,
                                          order_id: zoomedLoad?.orderId,
                                          file_category: file.file_category,
                                          file_name: file.file_name,
                                          file_path: file.file_path,
                                        });
                                        if (!fresh) {
                                          toast({
                                            title: "Error",
                                            description: "Failed to get file URL",
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                        url = fresh;
                                      }
                                      window.open(url, "_blank");
                                      setAdditionalFilesPopover({ open: false, files: [], anchorEl: null });
                                    }}
                                    title={`${file.file_name} — click to open`}
                                  >
                                    {idx + 1}. {file.file_name}
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      let url = signedUrl;
                                      if (!url) {
                                        const { signedUrl: fresh } = await getOrderFileSignedUrl({
                                          id: file.id,
                                          order_id: zoomedLoad?.orderId,
                                          file_category: file.file_category,
                                          file_name: file.file_name,
                                          file_path: file.file_path,
                                        });
                                        if (!fresh) {
                                          toast({
                                            title: "Error",
                                            description: "Failed to get file URL",
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                        url = fresh;
                                      }
                                      // Fetch as blob to force real download
                                      try {
                                        const response = await fetch(url);
                                        const blob = await response.blob();
                                        const blobUrl = URL.createObjectURL(blob);
                                        const link = document.createElement("a");
                                        link.href = blobUrl;
                                        link.download = file.file_name;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        URL.revokeObjectURL(blobUrl);
                                      } catch {
                                        toast({
                                          title: "Error",
                                          description: "Failed to download file",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    title="Download file"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>
                  );
                })}

                {/* BOL/POD Force Complete Buttons */}
                {(() => {
                  const pickupStops = zoomedLoad?.allPickupStops || [];
                  const deliveryStops = zoomedLoad?.allDeliveryStops || [];
                  const bolFileCount = zoomedLoad?.orderFiles?.filter((f) => f.file_category === "BOL").length || 0;
                  const podFileCount = zoomedLoad?.orderFiles?.filter((f) => f.file_category === "POD").length || 0;
                  const now = new Date();
                  const pickupStart = pickupStops[0]?.datetime ? new Date(pickupStops[0].datetime) : null;
                  const deliveryStart = deliveryStops[0]?.datetime ? new Date(deliveryStops[0].datetime) : null;
                  const showBolComplete =
                    pickupStops.length > 1 &&
                    pickupStops.length > bolFileCount &&
                    !(zoomedLoad as any)?.bolForceComplete &&
                    pickupStart != null &&
                    now >= pickupStart;
                  const showPodComplete =
                    deliveryStops.length > 1 &&
                    deliveryStops.length > podFileCount &&
                    !(zoomedLoad as any)?.podForceComplete &&
                    deliveryStart != null &&
                    now >= deliveryStart;

                  return (
                    <>
                      {showBolComplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete))] hover:bg-[hsl(var(--cell-complete))]/10"
                          onClick={() => setForceCompleteConfirm({ type: "BOL", orderId: zoomedLoad!.orderId })}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          BOL Complete
                        </Button>
                      )}
                      {showPodComplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[hsl(var(--cell-complete))] text-[hsl(var(--cell-complete))] hover:bg-[hsl(var(--cell-complete))]/10"
                          onClick={() => setForceCompleteConfirm({ type: "POD", orderId: zoomedLoad!.orderId })}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          POD Complete
                        </Button>
                      )}
                    </>
                  );
                })()}

                {/* Lumper Request and Cancel Button */}
                <div className="ml-auto flex gap-2">
                  {(roles.includes("admin") || roles.includes("manager")) && zoomedLoad?.orderId && (
                    <Button variant="outline" size="sm" onClick={() => setSalaryChargeOpen(true)}>
                      Add charge
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLumperAmount("");
                      setLumperConfirmation(null);
                      setLumperDialogOpen(true);
                    }}
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Lumper Request
                  </Button>
                  {(() => {
                    // Check if user is dispatch-only (not admin, manager, etc.)
                    const isDispatchOnly =
                      hasRole("dispatch") &&
                      !hasRole("admin") &&
                      !hasRole("manager") &&
                      !hasRole("supervisor") &&
                      !hasRole("afterhours") &&
                      !hasRole("safety") &&
                      !hasRole("accounting");

                    // Dispatch-only users can only cancel their own loads
                    const canCancelThisLoad = !isDispatchOnly || zoomedLoad?.bookedBy === profile?.full_name;

                    if (!canCancelThisLoad) return null;

                    return zoomedLoad?.canceled ? (
                      <Button variant="outline" size="sm" onClick={handleRevertCancellation}>
                        <Undo2 className="h-4 w-4 mr-1" />
                        Revert
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setCancelDialogOpen(true);
                        }}
                      >
                        <Ban className="h-4 w-4" />
                        Cancel Load
                      </Button>
                    );
                  })()}
                </div>
              </div>
            </div>

            {zoomedLoad?.notes && zoomedLoad.notes !== "—" && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Load Notes</h4>
                <TranslatableOrderNote note={zoomedLoad.notes} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Legend Dialog */}
      <Dialog open={legendDialogOpen} onOpenChange={setLegendDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Board Legend</DialogTitle>
            <DialogDescription className="sr-only">
              Color coding and status legend for the reports board
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Fuel & Scale Info */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-lg font-semibold mb-3 text-primary">EFS Fuel card instructions and daily limits</h3>
              <ul className="space-y-1.5 text-sm">
                <li className="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                  <span className="font-medium">Love's</span>
                  <span className="text-muted-foreground">250 gallons</span>
                </li>
                <li className="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                  <span className="font-medium">TA / Petro</span>
                  <span className="text-muted-foreground">250 gallons</span>
                </li>
                <li className="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                  <span className="font-medium">Road Ranger</span>
                  <span className="text-muted-foreground">250 gallons</span>
                </li>
                <li className="flex flex-col gap-1 pt-1">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">Pilot, Flying J & other smaller truck stops</span>
                    <span className="text-muted-foreground whitespace-nowrap">50 gallons</span>
                  </div>
                  <span className="text-xs text-muted-foreground italic">
                    Diesel only — DEF is not available, and fuel discounts do not apply at these locations.
                  </span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-border">
                <h4 className="text-sm font-semibold mb-1">Scale Services</h4>
                <p className="text-sm text-muted-foreground">
                  Available at any <span className="font-medium text-foreground">CAT scale</span> location. Scale tickets are charged
                  at standard location rates — there is currently no discount program for scale services.
                </p>
              </div>
            </div>

            {/* Company Colors Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Company Colors (Truck #)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-beverly-freight))",
                      color: "hsl(var(--company-beverly-freight-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">Beverly Freight Inc</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-bf-prime))",
                      color: "hsl(var(--company-bf-prime-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">BF Prime LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-beverly-group))",
                      color: "hsl(var(--company-beverly-group-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">Beverly Group LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-bf-prime-united))",
                      color: "hsl(var(--company-bf-prime-united-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">BF Prime United LLC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-bg-prime))",
                      color: "hsl(var(--company-bg-prime-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">BG Prime Inc</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-united-enterprise))",
                      color: "hsl(var(--company-united-enterprise-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">United Enterprise Solutions INC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-8 rounded border"
                    style={{
                      backgroundColor: "hsl(var(--company-ap-silver))",
                      color: "hsl(var(--company-ap-silver-foreground))",
                    }}
                  />
                  <span className="text-sm font-bold">AP Silver Trans LLC</span>
                </div>
              </div>
            </div>

            {/* Calendar Cell Colors Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Calendar Cell Status Colors</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-green-600 text-white rounded flex items-center justify-center text-xs font-medium">
                    Complete
                  </div>
                  <span className="text-sm">Load delivered with POD uploaded</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-lime-100 text-lime-800 border border-lime-300 rounded flex items-center justify-center text-xs font-medium">
                    Active
                  </div>
                  <span className="text-sm">Load picked up with BOL (in transit)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-cyan-100 text-cyan-800 border border-cyan-300 rounded flex items-center justify-center text-xs font-medium">
                    Booked
                  </div>
                  <span className="text-sm">Load confirmed with Rate Confirmation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-gray-100 text-gray-800 border border-gray-200 rounded flex items-center justify-center text-xs font-medium">
                    Pending
                  </div>
                  <span className="text-sm">Load scheduled, previous not completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-blue-500/20 border border-blue-500/50 rounded flex items-center justify-center text-xs font-medium">
                    Arrived
                  </div>
                  <span className="text-sm">Driver marked as arrived at location</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-orange-500/20 border border-orange-500/50 rounded flex items-center justify-center text-xs font-medium">
                    Late
                  </div>
                  <span className="text-sm">Delivery is past due date</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-orange-500 rounded flex items-center justify-center text-xs font-medium text-black">
                    RESCHEDULED
                  </div>
                  <span className="text-sm">Load rescheduled or in transit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-destructive/80 text-destructive-foreground rounded flex items-center justify-center text-xs font-medium">
                    Canceled
                  </div>
                  <span className="text-sm">Load was canceled (visible until newer load assigned)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-8 bg-muted rounded flex items-center justify-center text-xs font-medium">
                    Empty
                  </div>
                  <span className="text-sm">No loads scheduled for this day</span>
                </div>
              </div>
            </div>

            {/* Special Indicators Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Special Indicators</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold">XXX</div>
                  <span className="text-sm">Missing pickup (truck should have a load but doesn't)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-black text-white px-3 py-1 rounded text-xs font-bold">Game Over</div>
                  <span className="text-sm">Truck is in yard or at road (marked as unavailable)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-destructive" />
                  <span className="text-sm">HOS (Hours of Service) expired or critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="border-4 border-red-600 w-20 h-8 rounded"></div>
                  <span className="text-sm">Today's column (red border highlight)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  <span className="text-sm">Home time (click on empty "—" cells to mark/unmark)</span>
                </div>
              </div>
            </div>

            {/* Features Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Interactive Features</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Driver Info Button:</strong> Click the info icon next to driver name to view contact
                    details, truck/trailer info
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Maximize2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Load Zoom:</strong> Click the zoom icon on load cells to view detailed load information with
                    all stops
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Truck Location:</strong> Click map icon to view truck's current location on map
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Edit3 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Editable Notes:</strong> Click pencil icon to edit truck notes
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <History className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Note History:</strong> View complete history of truck note changes
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">🎯</span>
                  <span>
                    <strong>Drug Test (New Drivers):</strong> Click on driver cell for new drivers to record drug test
                    results
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">📅</span>
                  <span>
                    <strong>Calendar Navigation:</strong> Use arrows to navigate through different date ranges
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold">🔍</span>
                  <span>
                    <strong>Filters:</strong> Search by truck/driver name, dispatcher, or load number
                  </span>
                </div>
              </div>
            </div>

            {/* HOS Timers Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">HOS (Hours of Service) Timers</h3>
              <div className="text-sm space-y-1">
                <p>
                  <strong>Away (D):</strong> Miles away from next pickup/delivery
                </p>
                <p>
                  <strong>Drive:</strong> Remaining drive time (11 hours max)
                </p>
                <p>
                  <strong>Shift:</strong> Remaining shift time (14 hours max)
                </p>
                <p>
                  <strong>Break:</strong> Time until required 30-minute break
                </p>
                <p>
                  <strong>Cycle:</strong> Remaining hours in 70-hour/8-day cycle
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arrival Time Dialog */}
      <ArrivalTimeDialog
        open={!!arrivalTimeDialog}
        onOpenChange={(open) => {
          if (!open) setArrivalTimeDialog(null);
        }}
        onConfirm={(arrivalTime) => {
          if (arrivalTimeDialog) {
            updatePickupDropArrival.mutate({
              pickupDropId: arrivalTimeDialog.pickupDropId,
              arrivalTime: arrivalTime,
            });
            toast({
              title: `Marked as arrived at ${arrivalTimeDialog.type}`,
            });
          }
        }}
        title={arrivalTimeDialog?.type === "pickup" ? "Arrival at Pickup" : "Arrival at Delivery"}
      />

      {/* Check In/Out Time Dialog */}
      <CheckInOutTimeDialog
        open={!!checkInOutDialog}
        onOpenChange={(open) => {
          if (!open) setCheckInOutDialog(null);
        }}
        onConfirm={(checkInTime, checkOutTime) => {
          if (checkInOutDialog) {
            updateCheckInOutTimes.mutate({
              pickupDropId: checkInOutDialog.pickupDropId,
              checkInTime,
              checkOutTime,
            });
            toast({
              title: `Updated check in/out times for ${checkInOutDialog.type}`,
            });
          }
        }}
        title={checkInOutDialog?.type === "pickup" ? "Pickup Check In/Out Times" : "Delivery Check In/Out Times"}
        checkInTime={checkInOutDialog?.checkInTime}
        checkOutTime={checkInOutDialog?.checkOutTime}
      />

      {/* Home Time Dialog */}
      <Dialog
        open={!!homeTimeDialog}
        onOpenChange={(open) => {
          if (!open) setHomeTimeDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{homeTimeDialog?.isCurrentlyHomeTime ? "Remove Home Time" : "Mark as Home Time"}</DialogTitle>
            <DialogDescription className="sr-only">Toggle home time status for this truck</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Truck: <span className="font-semibold text-foreground">{homeTimeDialog?.truckNumber}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Date:{" "}
                <span className="font-semibold text-foreground">
                  {homeTimeDialog?.date ? formatDateTime(homeTimeDialog.date, "EEEE, MMMM d, yyyy") : ""}
                </span>
              </p>
            </div>
            <p className="text-sm">
              {homeTimeDialog?.isCurrentlyHomeTime
                ? "Do you want to remove the home time marker for this date?"
                : "Do you want to mark this date as home time?"}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHomeTimeDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (homeTimeDialog) {
                    updateLostDayNote.mutate({
                      driverId: homeTimeDialog.driverId,
                      date: homeTimeDialog.date,
                      note: homeTimeDialog.isCurrentlyHomeTime ? "" : "Home Time",
                      noteType: homeTimeDialog.isCurrentlyHomeTime ? null : "home_time",
                    });
                    toast({
                      title: homeTimeDialog.isCurrentlyHomeTime ? "Home time removed" : "Home time marked",
                      description: `${homeTimeDialog.truckNumber} - ${formatDateTime(homeTimeDialog.date, "MM/dd/yyyy")}`,
                    });
                    setHomeTimeDialog(null);
                  }
                }}
              >
                {homeTimeDialog?.isCurrentlyHomeTime ? "Remove" : "Mark as Home Time"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Red Cell Edit Dialog */}
      <EditLostDayNoteDialog
        open={!!redCellDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRedCellDialog(null);
            setRedCellNote("");
            setRedCellIsHomeTime(false);
          }
        }}
        truckNumber={redCellDialog?.truckNumber || ""}
        date={redCellDialog?.date || ""}
        currentNote={redCellNote}
        onSave={(note, isHomeTime) => {
          if (redCellDialog) {
            const mutationData = {
              driverId: redCellDialog.driverId,
              date: redCellDialog.date,
              note: isHomeTime ? "Home Time" : note,
              noteType: isHomeTime ? "home_time" : null,
            };

            updateLostDayNote.mutate(mutationData, {
              onSuccess: () => {
                toast({
                  title: "Note updated",
                  description: `${redCellDialog.truckNumber} - ${formatDateTime(redCellDialog.date, "MM/dd/yyyy")}`,
                });
              },
              onError: (error) => {
                toast({
                  title: "Error updating note",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                });
              },
            });

            setRedCellDialog(null);
            setRedCellNote("");
            setRedCellIsHomeTime(false);
          }
        }}
      />

      {/* Cancel Load Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Load #{zoomedLoad?.loadNumber}</DialogTitle>
            <DialogDescription className="sr-only">Enter cancellation details for this load</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-tonu">Company TONU ($)</Label>
              <Input
                id="cancel-tonu"
                type="number"
                step="0.01"
                value={cancelFormData.tonu}
                onChange={(e) => setCancelFormData((prev) => ({ ...prev, tonu: e.target.value }))}
                placeholder="Enter company TONU amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-driver-rate">Driver Rate ($)</Label>
              <Input
                id="cancel-driver-rate"
                type="number"
                step="0.01"
                value={cancelFormData.driverRate}
                onChange={(e) => setCancelFormData((prev) => ({ ...prev, driverRate: e.target.value }))}
                placeholder="Enter driver rate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-dh-miles">DH Miles</Label>
              <Input
                id="cancel-dh-miles"
                type="number"
                value={cancelFormData.dhMiles}
                onChange={(e) => setCancelFormData((prev) => ({ ...prev, dhMiles: e.target.value }))}
                placeholder="Enter DH miles"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-notes">Notes (required)</Label>
              <Textarea
                id="cancel-notes"
                value={cancelFormData.notes}
                onChange={(e) => setCancelFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter reason for cancellation"
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCancelOrder}>
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload {uploadDocType}</DialogTitle>
            <DialogDescription className="sr-only">Upload document files for this load</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/50"
              }`}
            >
              {uploadFiles.length > 0 ? (
                <div className="space-y-2">
                  <Check className="h-12 w-12 mx-auto text-green-500" />
                  <p className="font-medium">
                    {uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {uploadFiles.map((file, idx) => (
                      <p key={idx} className="text-sm text-muted-foreground">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setUploadFiles([])}>
                    Choose Different Files
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium mb-1">Drag and drop your files here</p>
                    <p className="text-sm text-muted-foreground mb-4">or click to browse (multiple files allowed)</p>
                    <Input
                      type="file"
                      onChange={handleFileSelect}
                      className="cursor-pointer"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      multiple
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setUploadFiles([]);
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button onClick={() => handleUploadDocument()} disabled={uploadFiles.length === 0 || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "OK"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lumper Request Dialog */}
      <Dialog
        open={lumperDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLumperDialogOpen(false);
            setLumperAmount("");
            setLumperConfirmation(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lumperConfirmation ? "Lumper Request Sent" : "Lumper Request"}</DialogTitle>
            <DialogDescription className="sr-only">Submit a lumper fee request</DialogDescription>
          </DialogHeader>

          {lumperConfirmation ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap font-mono text-sm">{lumperConfirmation}</div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setLumperDialogOpen(false);
                    setLumperAmount("");
                    setLumperConfirmation(null);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lumper-amount">Lumper Amount ($)</Label>
                <Input
                  id="lumper-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={lumperAmount}
                  onChange={(e) => setLumperAmount(e.target.value)}
                  placeholder="Enter lumper amount"
                  autoFocus
                />
              </div>

              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Truck:</strong> #{zoomedLoad?.truckNumber}
                </p>
                <p>
                  <strong>Driver:</strong> {zoomedLoad?.driverNames || "N/A"}
                </p>
                <p>
                  <strong>Load:</strong> #{zoomedLoad?.brokerLoadNumber || zoomedLoad?.loadNumber}
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLumperDialogOpen(false)} disabled={isSubmittingLumper}>
                  Cancel
                </Button>
                <Button onClick={handleLumperRequest} disabled={!lumperAmount || isSubmittingLumper}>
                  {isSubmittingLumper ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* EFS Request Dialog (Cash Advance & Other) */}
      <EfsRequestDialog
        open={!!efsRequestDialog}
        onOpenChange={(open) => !open && setEfsRequestDialog(null)}
        driverId={efsRequestDialog?.driverId || ""}
        driverName={efsRequestDialog?.driverName || ""}
        truckNumber={efsRequestDialog?.truckNumber || ""}
        companyName={efsRequestDialog?.companyName || ""}
        requesterEmail={profile?.email}
        requesterName={profile?.full_name}
      />

      {/* HOS Request Dialog */}
      <HosRequestDialog
        open={!!hosRequestDialog}
        onClose={() => setHosRequestDialog(null)}
        driverName={hosRequestDialog?.driverName || ""}
        truckNumber={hosRequestDialog?.truckNumber || ""}
        companyName={hosRequestDialog?.companyName || ""}
        teamDriverName={hosRequestDialog?.teamDriverName}
      />

      {/* EFS Missing Data Dialog */}
      <EfsMissingDataDialog
        open={!!efsMissingDataDialog}
        onOpenChange={(open) => !open && setEfsMissingDataDialog(null)}
        driverId={efsMissingDataDialog?.driverId || ""}
        driverName={efsMissingDataDialog?.driverName || ""}
      />

      {/* Lumper Missing Revised RC Dialog */}
      <LumperMissingDataDialog
        open={!!lumperMissingDataDialog}
        onOpenChange={(open) => !open && setLumperMissingDataDialog(null)}
        driverId={lumperMissingDataDialog?.driverId || ""}
        driverName={lumperMissingDataDialog?.driverName || ""}
      />

      {/* Temporary Plate Upload Dialog */}
      <TemporaryPlateUploadDialog
        open={!!tempPlateDialog}
        onOpenChange={(open) => !open && setTempPlateDialog(null)}
        truckId={tempPlateDialog?.truckId || ""}
        truckNumber={tempPlateDialog?.truckNumber || ""}
        temporaryPlateId={tempPlateDialog?.temporaryPlateId || ""}
      />

      <DriverProblemDialog
        open={!!problemDialog}
        onOpenChange={(open) => !open && setProblemDialog(null)}
        driverId={problemDialog?.driverId || ""}
        driverName={problemDialog?.driverName || ""}
        truckNumber={problemDialog?.truckNumber || ""}
        dispatcherName={problemDialog?.dispatcherName || ""}
      />

      {/* All Problems Dialog */}
      <AllProblemsDialog open={allProblemsDialogOpen} onOpenChange={setAllProblemsDialogOpen} />

      {/* Add Daily Report Row Dialog */}
      <AddDailyReportRowDialog
        open={!!addDailyReportDialog}
        onOpenChange={(open) => !open && setAddDailyReportDialog(null)}
        defaultTruckNumber={addDailyReportDialog?.truckNumber || ""}
        defaultDriverName={addDailyReportDialog?.driverName || null}
        defaultDispatcherName={addDailyReportDialog?.dispatcherName || null}
        defaultOffice={addDailyReportDialog?.office || null}
      />

      {/* Edit Driver Dialog */}
      <EditDriverDialog
        open={!!editingDriverId}
        onOpenChange={(open) => {
          if (!open) setEditingDriverId(null);
        }}
        driver={allDrivers?.find((d: any) => d.id === editingDriverId) || null}
      />

      {/* Force Complete Confirmation Dialog */}
      <AlertDialog open={!!forceCompleteConfirm} onOpenChange={(open) => !open && setForceCompleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Complete {forceCompleteConfirm?.type}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark all {forceCompleteConfirm?.type === "BOL" ? "BOL" : "POD"} as complete?
              {forceCompleteConfirm?.type === "POD" && " This will also mark the order as delivered."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (forceCompleteConfirm) {
                  handleForceComplete(forceCompleteConfirm.type, forceCompleteConfirm.orderId);
                  setForceCompleteConfirm(null);
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WeightBolDialog
        open={bolWeightDialogOpen}
        defaultValue={pendingBolWeight ?? zoomedLoad?.weightBol ?? null}
        files={uploadDocType === "BOL" ? uploadFiles : null}
        onCancel={() => {
          setBolWeightDialogOpen(false);
        }}
        onConfirm={(w) => {
          setPendingBolWeight(w);
          setBolWeightDialogOpen(false);
          // Resume the upload now that we have the weight (pass directly to avoid stale state)
          setTimeout(() => {
            handleUploadDocument(w);
          }, 0);
        }}
      />
      <ScaleTicketDialog
        open={scaleTicketDialogOpen}
        onOpenChange={setScaleTicketDialogOpen}
        orderId={zoomedLoad?.orderId ?? null}
        defaultValues={scaleTicketDefaults}
        onUploaded={(uploadedFiles) => {
          if (zoomedLoad?.orderId) {
            invalidateOrderFilesCacheForOrder(zoomedLoad.orderId);
            queryClient.invalidateQueries({ queryKey: ["adapter-order-files"], refetchType: "active" });
          }
          setZoomedLoad((prev) => {
            if (!prev) return prev;
            const newFiles = uploadedFiles.map((f, i) => ({
              id: `temp-scale-${Date.now()}-${i}`,
              file_name: f.file_name,
              file_path: f.file_path,
              file_category: f.file_category,
            }));
            return {
              ...prev,
              orderFiles: [...prev.orderFiles, ...newFiles],
              documents: [...new Set([...prev.documents, "ADDITIONAL"])],
            };
          });
          // Push synthetic files into the reports + orders caches so the grid
          // scale-ticket indicator disappears immediately after upload.
          if (zoomedLoad?.orderId) {
            const targetOrderId = zoomedLoad.orderId;
            const syntheticFiles = uploadedFiles.map((f, i) => ({
              id: `temp-scale-cache-${Date.now()}-${i}`,
              file_name: f.file_name,
              file_path: f.file_path,
              file_category: f.file_category,
            }));
            const reportsCacheKeys = [["reports", "priority"], ["reports", "full"], ["reports"]];
            for (const key of reportsCacheKeys) {
              queryClient.setQueriesData({ queryKey: key }, (oldData: any) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                return oldData.map((truck: any) => {
                  if (!truck?.allOrders) return truck;
                  return {
                    ...truck,
                    allOrders: truck.allOrders.map((o: any) => {
                      if (o.id !== targetOrderId) return o;
                      return { ...o, order_files: [...(o.order_files || []), ...syntheticFiles] };
                    }),
                  };
                });
              });
            }
            queryClient.setQueriesData({ queryKey: ["orders"] }, (oldData: any) => {
              if (!oldData || !Array.isArray(oldData)) return oldData;
              return oldData.map((o: any) => {
                if (o.id !== targetOrderId) return o;
                return { ...o, order_files: [...(o.order_files || []), ...syntheticFiles] };
              });
            });
            queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
            queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
          }
        }}
      />
      <AddOrderSalaryChargeDialog
        open={salaryChargeOpen}
        onOpenChange={setSalaryChargeOpen}
        orderId={zoomedLoad?.orderId || null}
      />
    </>
  );
};
export default Reports;
