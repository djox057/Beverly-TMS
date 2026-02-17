import React from "react";
import { DateRange } from "react-day-picker";
import { formatDateNoTimezone } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, XCircle, CheckCircle, FileDown, Award, Medal, Trophy, Star, Send, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrdersWithProgress } from "@/hooks/useOrdersWithProgress";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import { useCompanies } from "@/hooks/useCompanies";
import { useDrivers } from "@/hooks/useDrivers";
import { useAllDriverDebts } from "@/hooks/useAllDriverDebts";
import { useDriverPerformance } from "@/hooks/useDriverPerformance";
import { useDailyDriverStatsByDispatcher } from "@/hooks/useDailyDriverStats";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { downloadPayrollDoc, generatePayrollDocument } from "@/utils/payrollDocGenerator";
import { generatePayrollPdf } from "@/utils/payrollPdfGenerator";
import { PayrollPreviewDialog } from "@/components/PayrollPreviewDialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfWeek } from "date-fns";
import { useDispatcherNotes } from "@/hooks/useDispatcherNotes";
import { DispatcherNoteDialog } from "@/components/DispatcherNoteDialog";
import { DriverNoticeDialog } from "@/components/DriverNoticeDialog";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { DispatcherBonusesDialog } from "@/components/DispatcherBonusesDialog";
import crownImage from "@/assets/crown.png";
const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

// Counts Mon-Fri days in a calendar month, minus observed fixed-date holidays.
// This matches the payroll “days in month” expectation used for extra-day pay.
const getWorkDaysInMonth = (year: number, monthIndex: number) => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let weekdayCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    if (isWeekday(d)) weekdayCount++;
  }
  const fixedHolidays = [{
    monthIndex: 0,
    day: 1
  },
  // New Year's Day
  {
    monthIndex: 5,
    day: 19
  },
  // Juneteenth
  {
    monthIndex: 6,
    day: 4
  },
  // Independence Day
  {
    monthIndex: 10,
    day: 11
  },
  // Veterans Day
  {
    monthIndex: 11,
    day: 25
  } // Christmas Day
  ];
  const observedHolidayCount = fixedHolidays.reduce((acc, h) => {
    if (h.monthIndex !== monthIndex) return acc;
    const actual = new Date(year, monthIndex, h.day);
    let observed = actual;

    // Observed dates: Sat -> Fri, Sun -> Mon
    if (actual.getDay() === 6) observed = new Date(year, monthIndex, h.day - 1);
    if (actual.getDay() === 0) observed = new Date(year, monthIndex, h.day + 1);

    // If observed day shifts out of the month, ignore for this month’s count
    if (observed.getMonth() !== monthIndex) return acc;
    return isWeekday(observed) ? acc + 1 : acc;
  }, 0);
  const workDays = weekdayCount - observedHolidayCount;
  return workDays > 0 ? workDays : weekdayCount;
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
const Analytics = () => {
  const navigate = useNavigate();
  const {
    hasRole,
    profile,
    getPrimaryRole,
    roles
  } = useAuthContext();
  const isAdmin = roles.includes("admin");
  const canViewSalaries = roles.includes("admin") || roles.includes("chicago_management");

  // Debug navigation function
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
    const targetUrl = `/edit-order/${orderId}`;
    console.log("Target URL:", targetUrl);

    // Set return flag for back navigation
    localStorage.setItem("returnToAnalytics", "true");
    localStorage.removeItem("returnToReports");
    localStorage.removeItem("returnToTrips");
    localStorage.removeItem("returnToOrders");
    localStorage.removeItem("returnToYardLoads");

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sortBy, setSortBy] = useState<"totalFreight" | "ratePerMile" | "cut" | "cutPercent" | "avgDhMiles" | "avgWeeklyGrossPerDriver" | "turnover" | "emptyDays">("totalFreight");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [filterType, setFilterType] = useState<"week" | "month" | "custom">("week");
  const [dispatcherProfiles, setDispatcherProfiles] = useState<Record<string, {
    email: string;
    office: string | null;
    roles: string[];
    user_id: string;
  }>>({});
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>("");

  // Fetch dispatcher notes for the current date range
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : startDate;
  const {
    notes: dispatcherNotes
  } = useDispatcherNotes(startDate, endDate);

  // Create a map of dispatcher notes by dispatcher_id and date for quick lookup
  const notesByDispatcher = useMemo(() => {
    const map: Record<string, {
      note: string;
      color: "red" | "yellow" | "green";
      id: string;
    }> = {};
    dispatcherNotes.forEach(note => {
      // For each dispatcher, use the most recent note in the date range
      const key = `${note.dispatcher_id}-${note.date}`;
      map[key] = {
        note: note.note,
        color: note.color,
        id: note.id
      };
    });
    return map;
  }, [dispatcherNotes]);
  const [grossTierFilter, setGrossTierFilter] = useState<string>("all");

  // Driver Gross Rankings state
  const [grossRankingsSearch, setGrossRankingsSearch] = useState("");
  const [grossRankingsSortBy, setGrossRankingsSortBy] = useState<"avgFreight" | "avgDriverPay" | "avgMiles" | "avgCut" | "rpmCompany" | "rpmDriver" | "totalComm" | "weeksCount" | "currentDebt" | "totalDebt">("avgFreight");
  const [grossRankingsSortDir, setGrossRankingsSortDir] = useState<"asc" | "desc">("desc");
  const [dispatcherTruckCounts, setDispatcherTruckCounts] = useState<Record<string, {
    totalTrucks: number;
    totalDrivers: number;
    daysCount: number;
    totalDaysInRange: number;
  }>>({});
  const [safetyTierFilter, setSafetyTierFilter] = useState<string>("all");
  const [managementTierFilter, setManagementTierFilter] = useState<string>("all");
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [showExtraStats, setShowExtraStats] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>("all");
  const [supervisorAssignments, setSupervisorAssignments] = useState<Record<string, string>>({});
  const [supervisorNames, setSupervisorNames] = useState<Record<string, string>>({});
  // Driver Analytics filters
  const [driverAnalyticsOffices, setDriverAnalyticsOffices] = useState<string[]>([]);
  const [driverAnalyticsSupervisor, setDriverAnalyticsSupervisor] = useState<string>("all");
  const [extraDaysByUser, setExtraDaysByUser] = useState<Record<string, number>>({});
  const [extraDayDatesByUser, setExtraDayDatesByUser] = useState<Record<string, string[]>>({});
  const [extraDayRawDatesByUser, setExtraDayRawDatesByUser] = useState<Record<string, string[]>>({});
  const [lostDaysByUser, setLostDaysByUser] = useState<Record<string, number>>({});
  const [lostDayDatesByUser, setLostDayDatesByUser] = useState<Record<string, string[]>>({});
  const [lostDayRawDatesByUser, setLostDayRawDatesByUser] = useState<Record<string, string[]>>({});
  const [showOver100kGross, setShowOver100kGross] = useState<boolean>(false);

  // Salary selection and payment states
  const [salarySelectionMode, setSalarySelectionMode] = useState(false);
  const [selectedDispatcherIds, setSelectedDispatcherIds] = useState<Set<string>>(new Set());
  const [salaryPayments, setSalaryPayments] = useState<Record<string, {
    paid_amount: number;
    paid_at: string | null;
    additionals?: any[] | null;
    lost_days?: number | null;
  }>>({});
  // Salary sorting state
  const [salarySortBy, setSalarySortBy] = useState<"name" | "salary">("name");
  const [salarySortDir, setSalarySortDir] = useState<"asc" | "desc">("asc");
  const [prevMonthPayments, setPrevMonthPayments] = useState<Record<string, {
    paid_amount: number;
    calculated_salary: number;
  }>>({});
  const queryClient = useQueryClient();
  const [isBonusesDialogOpen, setIsBonusesDialogOpen] = useState(false);
  const [dispatcherBonuses, setDispatcherBonuses] = useState<Record<string, {
    rank: number;
    amount: number;
  }>>({});

  // Payroll preview dialog state
  const [payrollPreviewOpen, setPayrollPreviewOpen] = useState(false);
  const [payrollPreviewData, setPayrollPreviewData] = useState<{
    dispatcherName: string;
    dispatcherUserId: string;
    recipientEmail: string;
    payPeriod: string;
    salary1Percent: number;
    bonus5Percent: number;
    foodAllowance: number;
    extraDays: number;
    lostDays: number;
    extraDayDates: string[];
    lostDayDates: string[];
    extraDaysAmount: number;
    dispatcherBonus: number;
    perDayRate: number;
    isDeletedUser?: boolean;
    futureMonthLabel?: string;
    futureSalary1Percent?: number;
    futureBonus5Percent?: number;
    office?: string;
  } | null>(null);

  // Check if user has only dispatch role (same logic as Orders page)
  const isDispatchOnly = hasRole("dispatch") && !hasRole("afterhours") && !hasRole("admin") && !hasRole("manager") && !hasRole("accounting") && !hasRole("supervisor") && !hasRole("safety");

  // Use Individual Mode context - applies filtering when toggle is ON
  const {
    individualMode
  } = useIndividualMode();

  // Apply filtering when Individual Mode is ON or user is dispatch-only
  const shouldFilterByUser = individualMode || isDispatchOnly;
  const orderFilterOptions = shouldFilterByUser ? {
    bookedBy: profile?.full_name || null,
    dispatcherUserId: profile?.user_id || null
  } : {
    bookedBy: null,
    dispatcherUserId: null
  };
  const {
    data: orders,
    isLoading,
    error,
    progress
  } = useOrdersWithProgress(orderFilterOptions);
  const {
    data: companies
  } = useCompanies();
  const {
    data: drivers
  } = useDrivers();
  const {
    data: driverDebts = {}
  } = useAllDriverDebts();
  const {
    performanceData,
    updatePerformance
  } = useDriverPerformance();

  // Fetch terminated drivers for turnover column
  const turnoverFromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const turnoverToDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : turnoverFromDate;
  const { data: turnoverData } = useQuery({
    queryKey: ["dispatcher-turnover", turnoverFromDate, turnoverToDate],
    queryFn: async () => {
      if (!turnoverFromDate) return [];
      const { data, error } = await supabase
        .from("drivers")
        .select("last_dispatcher_id")
        .eq("is_active", false)
        .not("last_dispatcher_id", "is", null)
        .gte("termination_date", turnoverFromDate)
        .lte("termination_date", turnoverToDate!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!turnoverFromDate,
  });

  // Build turnover lookup map: dispatcher user_id -> count
  const turnoverMap = useMemo(() => {
    const map: Record<string, number> = {};
    (turnoverData || []).forEach((d: any) => {
      const id = d.last_dispatcher_id;
      if (id) map[id] = (map[id] || 0) + 1;
    });
    return map;
  }, [turnoverData]);

  // Fetch empty days (lost days) per dispatcher
  const { data: dispatcherDailyStats } = useDailyDriverStatsByDispatcher(
    turnoverFromDate || "", turnoverToDate || "",
    selectedOffices.length === 1 ? selectedOffices[0] : undefined
  );

  const emptyDaysMap = useMemo(() => {
    const map: Record<string, number> = {};
    (dispatcherDailyStats || []).forEach(s => {
      map[s.dispatcher_id] = (map[s.dispatcher_id] || 0) + s.lost_day_count;
    });
    return map;
  }, [dispatcherDailyStats]);

  const driverTiers = useMemo(() => performanceData, [performanceData]);

  // Create a Set of company driver IDs for analytics calculations
  const companyDriverIds = useMemo(() => {
    return new Set((drivers || []).filter(d => d.is_company_driver).map(d => d.id));
  }, [drivers]);

  // Helper function: For company drivers, driver pay equals freight amount (0% cut)
  const getEffectiveDriverPay = (order: any): number => {
    if (order.driver1Id && companyDriverIds.has(order.driver1Id)) {
      return Number(order.totalFreightAmountNoLumper) || 0;
    }
    return Number(order.totalDriverPay) || 0;
  };

  // Fetch all profiles to get office locations and roles indexed by full_name AND user_id
  useEffect(() => {
    const fetchProfiles = async () => {
      const {
        data: profiles
      } = await supabase.from("profiles").select("email, full_name, office, user_id");

      // Also fetch all unique booked_by values from orders to include deleted users
      const {
        data: ordersData
      } = await supabase.from("orders").select("booked_by").not("booked_by", "is", null);
      if (profiles) {
        // Fetch user roles for all users
        const {
          data: userRoles
        } = await supabase.from("user_roles").select("user_id, role");
        const rolesMap = userRoles?.reduce((acc, ur) => {
          if (!acc[ur.user_id]) {
            acc[ur.user_id] = [];
          }
          acc[ur.user_id].push(ur.role);
          return acc;
        }, {} as Record<string, string[]>) || {};
        const profileMap = profiles.reduce((acc, p) => {
          // Index by both full_name and user_id to handle both old and new booked_by formats
          if (p.full_name) {
            acc[p.full_name] = {
              email: p.email,
              office: p.office,
              roles: rolesMap[p.user_id] || [],
              user_id: p.user_id
            };
          }
          if (p.user_id) {
            acc[p.user_id] = {
              email: p.email,
              office: p.office,
              roles: rolesMap[p.user_id] || [],
              user_id: p.user_id
            };
          }
          return acc;
        }, {} as Record<string, {
          email: string;
          office: string | null;
          roles: string[];
          user_id: string;
        }>);

        // Add deleted users (those who appear in orders but not in profiles)
        if (ordersData) {
          const uniqueBookedBy = [...new Set(ordersData.map(o => o.booked_by).filter(Boolean))];
          uniqueBookedBy.forEach(bookedBy => {
            if (!profileMap[bookedBy as string]) {
              // This is a deleted user - add them with minimal info
              profileMap[bookedBy as string] = {
                email: `${bookedBy}@deleted.user`,
                office: null,
                roles: [],
                user_id: bookedBy as string
              };
            }
          });
        }
        setDispatcherProfiles(profileMap);

        // Fetch supervisor assignments
        const { data: supAssignments } = await supabase
          .from("dispatcher_supervisors")
          .select("dispatcher_id, supervisor_id");
        if (supAssignments) {
          const assignMap: Record<string, string> = {};
          supAssignments.forEach((a: any) => {
            assignMap[a.dispatcher_id] = a.supervisor_id;
          });
          setSupervisorAssignments(assignMap);

          // Build supervisor names from profiles
          const supNames: Record<string, string> = {};
          const supervisorIds = [...new Set(supAssignments.map((a: any) => a.supervisor_id))];
          supervisorIds.forEach(sid => {
            const supProfile = profiles.find(p => p.user_id === sid);
            if (supProfile) {
              supNames[sid as string] = supProfile.full_name || supProfile.email;
            }
          });
          setSupervisorNames(supNames);
        }
      }
    };
    fetchProfiles();
  }, [profile, hasRole]);

  // Fetch dispatcher driver counts for the selected date range
  // Uses pagination to bypass Supabase's 1000 row limit
  useEffect(() => {
    const fetchDriverCounts = async () => {
      try {
        let fromDate: string;
        let toDate: string;
        if (!dateRange?.from) {
          // If no date range, fetch today's count
          fromDate = format(new Date(), "yyyy-MM-dd");
          toDate = fromDate;
        } else {
          fromDate = format(dateRange.from, "yyyy-MM-dd");
          toDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromDate;
        }

        // Paginated fetch to bypass 1000 row limit
        const allRecords: any[] = [];
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const {
            data,
            error
          } = await supabase.from("dispatcher_daily_driver_counts" as any).select("*").gte("date", fromDate).lte("date", toDate).range(offset, offset + batchSize - 1);
          if (error) {
            console.error("Error fetching driver counts:", error);
            return;
          }
          if (data && Array.isArray(data)) {
            allRecords.push(...data);
            hasMore = data.length === batchSize;
            offset += batchSize;
          } else {
            hasMore = false;
          }
        }

        // Calculate total days in the date range (for proper averaging)
        // Cap at today to avoid dividing by future days that have no data yet
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        const effectiveEndDate = endDate > today ? today : endDate;
        // If the range is entirely in the future, use 1 to avoid division issues
        const totalDaysInRange = effectiveEndDate >= startDate 
          ? Math.ceil((effectiveEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 
          : 1;

        // Aggregate counts by dispatcher with totalDaysInRange for correct averaging
        const countsMap: Record<string, {
          totalTrucks: number;
          totalDrivers: number;
          daysCount: number;
          totalDaysInRange: number;
        }> = {};
        allRecords.forEach((record: any) => {
          if (!countsMap[record.dispatcher_id]) {
            countsMap[record.dispatcher_id] = {
              totalTrucks: 0,
              totalDrivers: 0,
              daysCount: 0,
              totalDaysInRange
            };
          }
          // Use truck_count if available, fallback to driver_count for backward compatibility
          countsMap[record.dispatcher_id].totalTrucks += record.truck_count ?? record.driver_count ?? 0;
          countsMap[record.dispatcher_id].totalDrivers += record.driver_count ?? 0;
          countsMap[record.dispatcher_id].daysCount += 1;
        });
        setDispatcherTruckCounts(countsMap);
      } catch (error) {
        console.error("Error in fetchDriverCounts:", error);
      }
    };
    fetchDriverCounts();
  }, [dateRange]);

  // Helper function to get holidays for a year (same as weekend schedule)
  const getHolidaysForYear = (year: number) => {
    const holidays: Date[] = [];

    // Fixed holidays
    holidays.push(new Date(year, 0, 1)); // New Year's Day - Jan 1
    holidays.push(new Date(year, 6, 4)); // Independence Day - Jul 4
    holidays.push(new Date(year, 11, 25)); // Christmas - Dec 25

    // Memorial Day - last Monday of May
    const lastDayMay = new Date(year, 5, 0);
    const memorialDay = new Date(year, 4, lastDayMay.getDate() - (lastDayMay.getDay() + 6) % 7);
    holidays.push(memorialDay);

    // Labor Day - first Monday of September
    const firstSept = new Date(year, 8, 1);
    const laborDay = new Date(year, 8, 1 + (8 - firstSept.getDay()) % 7);
    holidays.push(laborDay);

    // Thanksgiving - 4th Thursday of November
    const firstNov = new Date(year, 10, 1);
    const firstThursday = new Date(year, 10, 1 + (11 - firstNov.getDay()) % 7);
    const thanksgiving = new Date(year, 10, firstThursday.getDate() + 21);
    holidays.push(thanksgiving);
    return holidays;
  };

  // Check if a date string is a holiday
  const isHolidayDate = (dateStr: string, year: number) => {
    const holidays = getHolidaysForYear(year);
    const date = new Date(dateStr + "T12:00:00"); // Use noon to avoid timezone issues
    return holidays.some(h => h.getFullYear() === date.getFullYear() && h.getMonth() === date.getMonth() && h.getDate() === date.getDate());
  };

  // Fetch extra days from afterhours_schedule for selected month (excluding holidays)
  useEffect(() => {
    const fetchExtraDays = async () => {
      try {
        // Determine the month to fetch based on selectedMonth or dateRange
        let targetYear: number | null = null;
        let targetMonthNum: number | null = null;
        if (selectedMonth && selectedMonth !== "all" && selectedMonth.includes("-")) {
          // selectedMonth format is "YYYY-MM"
          const parts = selectedMonth.split("-");
          if (parts.length === 2) {
            targetYear = parseInt(parts[0], 10);
            targetMonthNum = parseInt(parts[1], 10) - 1; // Convert to 0-indexed
          }
        } else if (dateRange?.from) {
          targetYear = dateRange.from.getFullYear();
          targetMonthNum = dateRange.from.getMonth();
        }
        if (targetYear === null || targetMonthNum === null || isNaN(targetYear) || isNaN(targetMonthNum)) {
          setExtraDaysByUser({});
          return;
        }
        const firstDay = new Date(targetYear, targetMonthNum, 1);
        const lastDay = new Date(targetYear, targetMonthNum + 1, 0);

        // Validate dates
        if (isNaN(firstDay.getTime()) || isNaN(lastDay.getTime())) {
          setExtraDaysByUser({});
          return;
        }
        const fromDate = format(firstDay, "yyyy-MM-dd");
        const toDate = format(lastDay, "yyyy-MM-dd");
        const {
          data,
          error
        } = await supabase.from("afterhours_schedule").select("user_id, scheduled_date, dispatcher_name").gte("scheduled_date", fromDate).lte("scheduled_date", toDate);
        if (error) {
          console.error("Error fetching extra days:", error);
          return;
        }

        // Count extra days per user
        // Weekend days (Sat/Sun) that are non-holidays: subtract 1 (first weekend is regular shift)
        // Weekday entries: count all (these are manual overrides for extra worked days)
        const rawWeekendCountsMap: Record<string, number> = {};
        const weekdayCountsMap: Record<string, number> = {};
        const weekendDatesMap: Record<string, string[]> = {};
        const weekdayDatesMap: Record<string, string[]> = {};
        const weekendRawDatesMap: Record<string, string[]> = {};
        const weekdayRawDatesMap: Record<string, string[]> = {};
        if (data && Array.isArray(data)) {
          data.forEach((record: any) => {
            // Use dispatcher_name as key for deleted users (no user_id), otherwise user_id
            const keys: string[] = [];
            if (record.user_id) keys.push(record.user_id);
            if (record.dispatcher_name) keys.push(record.dispatcher_name);
            if (keys.length === 0) return;
            
            const scheduleDate = new Date(record.scheduled_date + "T12:00:00"); // Use noon to avoid timezone issues
            const dayOfWeek = scheduleDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            // Exclude holidays from count
            if (isHolidayDate(record.scheduled_date, targetYear!)) {
              return;
            }
            
            // Initialize maps for all keys
            keys.forEach(key => {
              if (!rawWeekendCountsMap[key]) {
                rawWeekendCountsMap[key] = 0;
                weekdayCountsMap[key] = 0;
                weekendDatesMap[key] = [];
                weekdayDatesMap[key] = [];
                weekendRawDatesMap[key] = [];
                weekdayRawDatesMap[key] = [];
              }
            });
            
            // Format date as M/DD (e.g., 12/16)
            const month = scheduleDate.getMonth() + 1;
            const day = scheduleDate.getDate();
            const dateStr = `${month}/${day}`;
            
            // Special case: 2026-01-10 (office moving day) - treat as weekday (always counts as extra)
            // Only applies to Kragujevac office dispatchers/supervisors
            const primaryKey = record.user_id || record.dispatcher_name;
            const userOffice = dispatcherProfiles[primaryKey]?.office;
            const isMovingDay = record.scheduled_date === "2026-01-10" && userOffice === "KRAGUJEVAC";
            
            keys.forEach(key => {
              if (isWeekend && !isMovingDay) {
                rawWeekendCountsMap[key] += 1;
                weekendDatesMap[key].push(dateStr);
                weekendRawDatesMap[key].push(record.scheduled_date);
              } else {
                // Weekday entries (and moving day) are always counted as extra days
                weekdayCountsMap[key] += 1;
                weekdayDatesMap[key].push(dateStr);
                weekdayRawDatesMap[key].push(record.scheduled_date);
              }
            });
          });
        }

        // Sort dates for each user
        const sortDatesFn = (a: string, b: string) => {
          const [aMonth, aDay] = a.split("/").map(Number);
          const [bMonth, bDay] = b.split("/").map(Number);
          if (aMonth !== bMonth) return aMonth - bMonth;
          return aDay - bDay;
        };

        // Subtract 1 from weekend count (first weekend day is regular, 2+ days = extra)
        // Then add weekday counts (all weekday entries are extra days)
        const countsMap: Record<string, number> = {};
        const datesMap: Record<string, string[]> = {};
        const rawDatesMap: Record<string, string[]> = {};
        const allUserIds = new Set([...Object.keys(rawWeekendCountsMap), ...Object.keys(weekdayCountsMap)]);
        allUserIds.forEach(userId => {
          const weekendExtra = Math.max(0, (rawWeekendCountsMap[userId] || 0) - 1);
          const weekdayExtra = weekdayCountsMap[userId] || 0;
          countsMap[userId] = weekendExtra + weekdayExtra;
          
          const allWeekendDates = (weekendDatesMap[userId] || []).sort(sortDatesFn);
          const allWeekdayDates = (weekdayDatesMap[userId] || []).sort(sortDatesFn);
          const allWeekendRaw = (weekendRawDatesMap[userId] || []).sort();
          const allWeekdayRaw = (weekdayRawDatesMap[userId] || []).sort();
          
          if (allWeekendDates.length > 0) {
            datesMap[userId] = [allWeekendDates[0], ...[...allWeekdayDates, ...allWeekendDates.slice(1)].sort(sortDatesFn)];
            rawDatesMap[userId] = [allWeekendRaw[0], ...[...allWeekdayRaw, ...allWeekendRaw.slice(1)].sort()];
          } else {
            datesMap[userId] = allWeekdayDates;
            rawDatesMap[userId] = allWeekdayRaw;
          }
        });
        setExtraDaysByUser(countsMap);
        setExtraDayDatesByUser(datesMap);
        setExtraDayRawDatesByUser(rawDatesMap);
      } catch (error) {
        console.error("Error in fetchExtraDays:", error);
      }
    };
    fetchExtraDays();
  }, [selectedMonth, dateRange]);

  // Fetch lost days from dispatcher_off_duty_days for selected month
  useEffect(() => {
    const fetchLostDays = async () => {
      try {
        // Determine the month to fetch based on selectedMonth or dateRange
        let targetYear: number | null = null;
        let targetMonthNum: number | null = null;
        if (selectedMonth && selectedMonth !== "all" && selectedMonth.includes("-")) {
          const parts = selectedMonth.split("-");
          if (parts.length === 2) {
            targetYear = parseInt(parts[0], 10);
            targetMonthNum = parseInt(parts[1], 10) - 1; // Convert to 0-indexed
          }
        } else if (dateRange?.from) {
          targetYear = dateRange.from.getFullYear();
          targetMonthNum = dateRange.from.getMonth();
        }
        if (targetYear === null || targetMonthNum === null || isNaN(targetYear) || isNaN(targetMonthNum)) {
          setLostDaysByUser({});
          return;
        }
        const firstDay = new Date(targetYear, targetMonthNum, 1);
        const lastDay = new Date(targetYear, targetMonthNum + 1, 0);

        // Validate dates
        if (isNaN(firstDay.getTime()) || isNaN(lastDay.getTime())) {
          setLostDaysByUser({});
          return;
        }
        const fromDate = format(firstDay, "yyyy-MM-dd");
        const toDate = format(lastDay, "yyyy-MM-dd");
        const {
          data,
          error
        } = await supabase.from("dispatcher_off_duty_days").select("dispatcher_id, off_duty_date, dispatcher_name").gte("off_duty_date", fromDate).lte("off_duty_date", toDate);
        if (error) {
          console.error("Error fetching lost days:", error);
          return;
        }

        // Count lost days per dispatcher and collect dates
        // Key by BOTH dispatcher_id (UUID) AND dispatcher_name (for deleted users)
        const countsMap: Record<string, number> = {};
        const datesMap: Record<string, string[]> = {};
        const rawDatesMap: Record<string, string[]> = {};
        if (data && Array.isArray(data)) {
          data.forEach((record: any) => {
            const keys = [record.dispatcher_id];
            if (record.dispatcher_name) {
              keys.push(record.dispatcher_name);
            }
            
            const dateObj = new Date(record.off_duty_date + "T12:00:00");
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dateStr = `${month}/${day}`;
            
            keys.forEach(key => {
              if (!countsMap[key]) {
                countsMap[key] = 0;
                datesMap[key] = [];
                rawDatesMap[key] = [];
              }
              countsMap[key] += 1;
              datesMap[key].push(dateStr);
              rawDatesMap[key].push(record.off_duty_date);
            });
          });
        }

        // Sort dates for each user
        Object.keys(datesMap).forEach(userId => {
          datesMap[userId].sort((a, b) => {
            const [aMonth, aDay] = a.split("/").map(Number);
            const [bMonth, bDay] = b.split("/").map(Number);
            if (aMonth !== bMonth) return aMonth - bMonth;
            return aDay - bDay;
          });
          rawDatesMap[userId]?.sort();
        });
        setLostDaysByUser(countsMap);
        setLostDayDatesByUser(datesMap);
        setLostDayRawDatesByUser(rawDatesMap);
      } catch (error) {
        console.error("Error in fetchLostDays:", error);
      }
    };
    fetchLostDays();
  }, [selectedMonth, dateRange]);
  const getPreviousMonth = (month: string): string | null => {
    if (!month || month === "all" || !month.includes("-")) return null;
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(monthNum)) return null;
    const prevDate = new Date(year, monthNum - 2, 1); // month is 1-indexed, Date uses 0-indexed
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  };

  // Fetch salary payments for the selected month AND previous month using useQuery for caching
  const { data: salaryPaymentsData } = useQuery({
    queryKey: ["salary-payments", selectedMonth],
    queryFn: async () => {
      if (!selectedMonth || selectedMonth === "all") {
        return { current: {}, previous: {} };
      }
      
      // Fetch current and previous month in parallel
      const prevMonth = getPreviousMonth(selectedMonth);
      const [currentResult, prevResult] = await Promise.all([
        supabase.from("dispatcher_salary_payments" as any).select("*").eq("month", selectedMonth),
        prevMonth 
          ? supabase.from("dispatcher_salary_payments" as any).select("*").eq("month", prevMonth)
          : Promise.resolve({ data: null, error: null })
      ]);
      
      const paymentsMap: Record<string, { paid_amount: number; paid_at: string | null; additionals: any[] | null; lost_days?: number | null }> = {};
      if (currentResult.data && Array.isArray(currentResult.data)) {
        currentResult.data.forEach((record: any) => {
          paymentsMap[record.user_id] = {
            paid_amount: Number(record.paid_amount) || 0,
            paid_at: record.paid_at,
            additionals: record.additionals || null,
            lost_days: record.lost_days != null ? Number(record.lost_days) : null,
          };
        });
      }
      
      const prevMap: Record<string, { paid_amount: number; calculated_salary: number }> = {};
      if (prevResult.data && Array.isArray(prevResult.data)) {
        prevResult.data.forEach((record: any) => {
          prevMap[record.user_id] = {
            paid_amount: Number(record.paid_amount) || 0,
            calculated_salary: Number(record.calculated_salary) || Number(record.paid_amount) || 0
          };
        });
      }
      
      return { current: paymentsMap, previous: prevMap };
    },
    staleTime: 30000, // Cache for 30 seconds
    enabled: !!selectedMonth && selectedMonth !== "all",
  });

  // Update state from query data
  useEffect(() => {
    if (salaryPaymentsData) {
      setSalaryPayments(salaryPaymentsData.current);
      setPrevMonthPayments(salaryPaymentsData.previous);
    } else if (!selectedMonth || selectedMonth === "all") {
      setSalaryPayments({});
      setPrevMonthPayments({});
    }
  }, [salaryPaymentsData, selectedMonth]);

  // Realtime subscription for salary payments
  useEffect(() => {
    if (!selectedMonth || selectedMonth === "all") return;

    const channel = supabase
      .channel("salary-payments-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatcher_salary_payments",
        },
        (payload) => {
          const record = payload.new as any;
          const oldRecord = payload.old as any;
          // Only invalidate if the change is for the current or previous month
          const prevMonth = getPreviousMonth(selectedMonth);
          const relevantMonth = record?.month || oldRecord?.month;
          if (relevantMonth === selectedMonth || relevantMonth === prevMonth) {
            queryClient.invalidateQueries({ queryKey: ["salary-payments", selectedMonth] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMonth, queryClient]);

  // Track deleted dispatchers' last paid month to hide them from future months
  const [deletedDispatcherLastPaidMonth, setDeletedDispatcherLastPaidMonth] = useState<Record<string, string>>({});
  useEffect(() => {
    const fetchDeletedDispatcherPayments = async () => {
      try {
        // Find salary payments for user_ids that no longer exist in profiles
        const { data: allPayments } = await supabase
          .from("dispatcher_salary_payments" as any)
          .select("user_id, month")
          .order("month", { ascending: false });

        if (!allPayments || allPayments.length === 0) return;

        // Get unique user_ids from payments
        const paymentUserIds = [...new Set((allPayments as any[]).map((p: any) => p.user_id))];

        // Check which of these user_ids still exist in profiles
        const { data: existingProfiles } = await supabase
          .from("profiles")
          .select("user_id")
          .in("user_id", paymentUserIds);

        const existingUserIds = new Set((existingProfiles || []).map(p => p.user_id));

        // Find deleted user_ids (paid but no longer in profiles)
        const deletedUserIds = paymentUserIds.filter(uid => !existingUserIds.has(uid));
        if (deletedUserIds.length === 0) {
          setDeletedDispatcherLastPaidMonth({});
          return;
        }

        // For each deleted user_id, find the last month they were paid
        const lastPaidByUserId: Record<string, string> = {};
        (allPayments as any[]).forEach((p: any) => {
          if (deletedUserIds.includes(p.user_id) && p.month) {
            if (!lastPaidByUserId[p.user_id] || p.month > lastPaidByUserId[p.user_id]) {
              lastPaidByUserId[p.user_id] = p.month;
            }
          }
        });

        // Map these user_ids to dispatcher names via orders.booked_by
        const { data: ordersByDeletedUsers } = await supabase
          .from("orders")
          .select("booked_by")
          .in("booked_by", Object.keys(dispatcherProfiles).filter(name => {
            const profile = dispatcherProfiles[name];
            return profile && profile.email?.endsWith("@deleted.user");
          }));

        // Build name -> last paid month map
        const nameToLastPaid: Record<string, string> = {};
        if (ordersByDeletedUsers) {
          const deletedNames = [...new Set(ordersByDeletedUsers.map(o => o.booked_by).filter(Boolean))];
          // For each deleted dispatcher name, find their user_id from dispatcherProfiles
          // and check if that matches any deleted user_id payment
          // Since deleted users in dispatcherProfiles have user_id = booked_by name (not UUID),
          // we need to match through orders
          for (const name of deletedNames) {
            // Find orders by this name and see if any user_id in payments matches
            // We can't directly link, so use a different approach:
            // Check all deleted user payments and match by cross-referencing
            for (const [userId, lastMonth] of Object.entries(lastPaidByUserId)) {
              // Check if this deleted user booked orders under this name
              const { data: matchOrders, error } = await supabase
                .from("orders")
                .select("id")
                .eq("booked_by", name as string)
                .limit(1);
              // We can't directly match user_id to booked_by name from orders alone
              // So we'll use a simpler heuristic: check truck assignments
            }
          }
        }

        // Simpler approach: query orders table to find booked_by for each deleted user_id
        // by checking if there's a pattern of orders from the same period
        for (const userId of deletedUserIds) {
          const { data: userOrders } = await supabase
            .from("orders")
            .select("booked_by")
            .limit(1);
          // This approach won't work well. Let's use a direct SQL approach instead.
        }

        setDeletedDispatcherLastPaidMonth(nameToLastPaid);
      } catch (error) {
        console.error("Error fetching deleted dispatcher payments:", error);
      }
    };
    fetchDeletedDispatcherPayments();
  }, [dispatcherProfiles]);

  // Fetch dispatcher bonuses for the selected month
  useEffect(() => {
    const fetchBonuses = async () => {
      if (!selectedMonth || selectedMonth === "all") {
        setDispatcherBonuses({});
        return;
      }
      try {
        const {
          data,
          error
        } = await supabase.from("dispatcher_monthly_bonuses").select("*").eq("month", selectedMonth);
        if (error) {
          console.error("Error fetching dispatcher bonuses:", error);
          return;
        }
        const bonusesMap: Record<string, {
          rank: number;
          amount: number;
        }> = {};
        if (data && Array.isArray(data)) {
          data.forEach((record: any) => {
            bonusesMap[record.dispatcher_id] = {
              rank: record.bonus_rank,
              amount: record.bonus_amount
            };
          });
        }
        setDispatcherBonuses(bonusesMap);
      } catch (error) {
        console.error("Error in fetchBonuses:", error);
      }
    };
    fetchBonuses();
  }, [selectedMonth, isBonusesDialogOpen]); // Refetch when dialog closes

  // Clear salary selection when month changes
  useEffect(() => {
    setSelectedDispatcherIds(new Set());
  }, [selectedMonth]);

  // Selection helpers for salaries
  const toggleDispatcherSelection = (userId: string) => {
    setSelectedDispatcherIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };
  const toggleSelectAllDispatchers = (allUserIds: string[]) => {
    if (selectedDispatcherIds.size === allUserIds.length) {
      setSelectedDispatcherIds(new Set());
    } else {
      setSelectedDispatcherIds(new Set(allUserIds));
    }
  };

  // Mark selected dispatchers as paid - stores calculated_salary for future adjustment calculations
  const markSelectedAsPaid = async (calculatedSalaries: Record<string, number>, adjustedSalaries: Record<string, number>) => {
    if (selectedDispatcherIds.size === 0 || !selectedMonth || selectedMonth === "all") {
      toast.error("Please select a month and at least one dispatcher");
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }
      const now = new Date().toISOString();

      // Delete previous records for the selected month first
      const selectedUserIds = Array.from(selectedDispatcherIds);
      const {
        error: deleteError
      } = await supabase.from("dispatcher_salary_payments" as any).delete().eq("month", selectedMonth).in("user_id", selectedUserIds);
      if (deleteError) {
        console.error("Error deleting previous records:", deleteError);
      }

      // Store both the adjusted salary (what's paid) and the base calculated salary (for next month's adjustment)
      const insertData = selectedUserIds.map(userId => ({
        user_id: userId,
        month: selectedMonth,
        paid_amount: adjustedSalaries[userId] || calculatedSalaries[userId] || 0,
        calculated_salary: calculatedSalaries[userId] || 0,
        // Store base salary for next month adjustment
        paid_at: now,
        paid_by: user.id
      }));
      const {
        error
      } = await supabase.from("dispatcher_salary_payments" as any).insert(insertData);
      if (error) throw error;
      toast.success(`Marked ${selectedDispatcherIds.size} dispatcher(s) as paid`);

      // Update local state
      const newPayments = {
        ...salaryPayments
      };
      insertData.forEach(item => {
        newPayments[item.user_id] = {
          paid_amount: item.paid_amount,
          paid_at: item.paid_at
        };
      });
      setSalaryPayments(newPayments);
      setSelectedDispatcherIds(new Set());
      setSalarySelectionMode(false);
    } catch (error) {
      console.error("Error marking as paid:", error);
      toast.error("Failed to mark as paid");
    }
  };
  const filteredOrders = useMemo(() => {
    const primaryRole = getPrimaryRole();

    // Wait for profiles to load for supervisors
    if (primaryRole === "supervisor" && Object.keys(dispatcherProfiles).length === 0) {
      return [];
    }
    const filtered = orders?.filter(order => {
      // Exclude canceled orders from analytics UNLESS they have TONU values
      // TONU from canceled orders should still count in gross/commission
      if (order.canceled && !(order.tonu > 0 || order.tonuDriver > 0)) {
        return false;
      }

      // Date filtering - use delivery date for month filters, pickup date for week/custom filters
      // CRITICAL: Only filter by date when dateRange is actually set
      // Orders with invalid dates should only be excluded when date filtering is active
      let matchesDate = true;
      if (dateRange?.from) {
        const dateToFilter = filterType === "month" ? order.deliveryDate : order.pickupDate;
        // Only exclude orders with invalid dates when actively filtering by date
        if (!dateToFilter || dateToFilter === "N/A" || dateToFilter === "Invalid Date" || dateToFilter === "") {
          matchesDate = false;
        } else {
          try {
            // Robust date parsing that handles multiple formats (ISO with T, space-separated, etc.)
            // This ensures both unlocked orders (from Supabase) and locked orders (from CSV) are parsed correctly
            let dateStr = dateToFilter;

            // Normalize space-separated dates to ISO format if needed
            if (dateStr.includes(" ") && !dateStr.includes("T")) {
              dateStr = dateStr.replace(" ", "T");
            }

            // Extract just the date part from datetime string (YYYY-MM-DD)
            // Handle both "YYYY-MM-DDTHH:mm:ss" and "YYYY-MM-DD" formats
            const datePart = dateStr.split("T")[0];

            // Validate date format
            if (!datePart || !datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
              matchesDate = false;
            } else {
              const [year, month, day] = datePart.split("-").map(Number);
              const orderDateOnly = new Date(year, month - 1, day); // month is 0-indexed

              // Validate the parsed date
              if (isNaN(orderDateOnly.getTime())) {
                matchesDate = false;
              } else {
                if (dateRange.to) {
                  // Date range filtering
                  const fromDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
                  const toDateOnly = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
                  matchesDate = orderDateOnly >= fromDateOnly && orderDateOnly <= toDateOnly;
                } else {
                  // Single date filtering
                  const selectedDateOnly = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
                  matchesDate = orderDateOnly.getTime() === selectedDateOnly.getTime();
                }
              }
            }
          } catch (error) {
            console.error("Date parsing error for order:", order.id, dateToFilter, error);
            matchesDate = false;
          }
        }
      }
      // When dateRange is not set, all orders pass the date filter (matchesDate = true)

      // Filter by selected offices (only for admin/manager/chicago_management)
      if (selectedOffices.length > 0 && (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "chicago_management")) {
        if (!order.bookedBy || order.bookedBy === "N/A" || order.bookedBy === "Unknown") {
          return false;
        }
        const dispatcherProfile = dispatcherProfiles[order.bookedBy];
        if (!dispatcherProfile || !selectedOffices.includes(dispatcherProfile.office as string)) {
          return false;
        }
      }

      // Filter based on PRIMARY role only
      if (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "accounting" || primaryRole === "chicago_management") {
        return matchesDate;
      }

      // Supervisors only see orders from their office dispatchers
      if (primaryRole === "supervisor") {
        if (!profile?.office) {
          return false;
        }
        if (!order.bookedBy || order.bookedBy === "N/A" || order.bookedBy === "Unknown") {
          return false;
        }
        const dispatcherProfile = dispatcherProfiles[order.bookedBy];
        if (!dispatcherProfile) {
          return false;
        }
        return matchesDate && dispatcherProfile.office === profile.office;
      }

      // Dispatchers and Afterhours only see their own orders
      if (primaryRole === "dispatch" || primaryRole === "afterhours") {
        if (!profile?.full_name && !profile?.user_id) {
          console.log("❌ Dispatch/Afterhours filter: Missing profile name or ID");
          return false;
        }
        // Check both full_name and user_id to handle both old and new data formats
        const matches = matchesDate && (order.bookedBy === profile.full_name || order.bookedBy === profile.user_id);
        return matches;
      }

      // Default: no access for other roles
      return false;
    }) || [];
    return filtered;
  }, [orders, dateRange, filterType, dispatcherProfiles, getPrimaryRole, profile, selectedOffices]);

  // Helper function to get week start date
  const getWeekStartDate = (weeksAgo: number) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff - weeksAgo * 7);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  };
  const setWeekFilter = (weeks: number) => {
    const startDate = getWeekStartDate(weeks);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    setDateRange({
      from: startDate,
      to: endDate
    });
  };

  // Generate all weeks starting from current week
  const generateWeekOptions = () => {
    const weeks = [];
    const today = new Date();
    const currentYear = today.getFullYear();

    // Calculate weeks from start of year to current week
    const startOfYear = new Date(currentYear, 0, 1);
    const dayOfWeek = startOfYear.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() - diff);

    // Calculate current week number
    const currentWeekStart = getWeekStartDate(0);
    const weeksFromStart = Math.floor((currentWeekStart.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));

    // Generate 52 weeks starting from current week
    for (let i = 0; i < 52; i++) {
      const weekStart = getWeekStartDate(i);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const formatDate = (date: Date) => {
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      };
      weeks.push({
        value: i.toString(),
        label: i === 0 ? "This Week" : i === 1 ? "Last Week" : `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        weekNumber: weeksFromStart - i
      });
    }
    return weeks;
  };
  const weekOptions = generateWeekOptions();
  const handleWeekChange = (value: string) => {
    setSelectedWeek(value);
    setSelectedMonth("all");
    setFilterType("week");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      setWeekFilter(parseInt(value));
    }
  };

  // Generate month options for the past 12 months
  const generateMonthOptions = () => {
    const months = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      const yearMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        value: yearMonth,
        // Use YYYY-MM format for consistency with salary payments
        index: i,
        label: monthStart.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric"
        }),
        start: monthStart,
        end: monthEnd
      });
    }
    return months;
  };
  const monthOptions = generateMonthOptions();
  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    setSelectedWeek("all");
    setFilterType("month");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const monthOption = monthOptions.find(m => m.value === value);
      if (monthOption) {
        setDateRange({
          from: monthOption.start,
          to: monthOption.end
        });
      }
    }
  };
  // Calculate dispatcher analytics
  // Shared daysInPeriod for both dispatcherStats and fleetAverages
  const periodCapDate = new Date();
  const effectiveTo = dateRange?.to ? (dateRange.to > periodCapDate ? periodCapDate : dateRange.to) : (dateRange?.from || periodCapDate);
  const daysInPeriod = dateRange?.from
    ? Math.ceil((effectiveTo.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;

  const dispatcherAnalytics = filteredOrders.reduce((acc, order) => {
    const dispatcher = order.bookedBy || "Unknown";
    if (!acc[dispatcher]) {
      acc[dispatcher] = {
        totalFreight: 0,
        totalDriverRate: 0,
        totalMiles: 0,
        totalDhMiles: 0,
        orderCount: 0
      };
    }
    acc[dispatcher].totalFreight += Number(order.totalFreightAmountNoLumper) || 0;
    acc[dispatcher].totalDriverRate += getEffectiveDriverPay(order);
    acc[dispatcher].totalMiles += Number(order.mileage) || 0;
    acc[dispatcher].totalDhMiles += Number(order.dhMiles) || 0;
    acc[dispatcher].orderCount += 1;
    return acc;
  }, {} as Record<string, {
    totalFreight: number;
    totalDriverRate: number;
    totalMiles: number;
    totalDhMiles: number;
    orderCount: number;
  }>);
  const dispatcherStats = Object.entries(dispatcherAnalytics).map(([name, stats]: [string, {
    totalFreight: number;
    totalDriverRate: number;
    totalMiles: number;
    totalDhMiles: number;
    orderCount: number;
  }]) => {
    const cut = stats.totalFreight - stats.totalDriverRate;
    const cutPercent = stats.totalFreight > 0 ? cut / stats.totalFreight * 100 : 0;
    const ratePerMile = stats.totalMiles > 0 ? stats.totalFreight / stats.totalMiles : 0;
    const avgDhMiles = stats.orderCount > 0 ? stats.totalDhMiles / stats.orderCount : 0;
    const dispatcherProfile = dispatcherProfiles[name];

    // Get dispatcher user_id from the profile - name can be either full_name or user_id
    const dispatcherUserId = dispatcherProfile?.user_id;
    const truckCountData = dispatcherUserId ? dispatcherTruckCounts[dispatcherUserId] : null;
    // Use daysCount (actual recorded days) for averaging to avoid dilution by missing/future days
    const avgTrucks = truckCountData && truckCountData.daysCount > 0 ? truckCountData.totalTrucks / truckCountData.daysCount : 0;
    const avgDrivers = truckCountData && truckCountData.daysCount > 0 ? truckCountData.totalDrivers / truckCountData.daysCount : 0;

    // Avg Wk Gross/Dr: for weekly filter, just divide by trucks.
    // For monthly/custom, normalize to weekly rate.
    const avgWeeklyGrossPerDriver = avgTrucks > 0
      ? filterType === "week"
        ? stats.totalFreight / avgTrucks
        : stats.totalFreight / avgTrucks / daysInPeriod * 7
      : 0;

    // Validate userId is a valid UUID before storing
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUserId = dispatcherUserId && uuidRegex.test(dispatcherUserId) ? dispatcherUserId : "";
    return {
      name,
      userId: validUserId,
      totalFreight: stats.totalFreight,
      totalDriverRate: stats.totalDriverRate,
      totalMiles: stats.totalMiles,
      orderCount: stats.orderCount,
      cut,
      cutPercent,
      ratePerMile,
      avgDhMiles,
      avgWeeklyGrossPerDriver,
      office: dispatcherProfile?.office || "Unknown",
      avgTrucks,
      turnover: turnoverMap[validUserId] || 0,
      emptyDays: emptyDaysMap[validUserId] || 0
    };
  }).filter(stat => {
    const dispatcherProfile = dispatcherProfiles[stat.name];
    const primaryRole = getPrimaryRole();

    // Show users with gross > 0 (including deleted users who still have orders)
    // OR users with 'dispatch' role OR managers/supervisors/afterhours who have booked orders
    const hasBookedOrders = stat.totalFreight > 0;

    // If no profile exists but they have orders with gross, show them (deleted users)
    if (!dispatcherProfile) {
      return hasBookedOrders;
    }
    const hasDispatchRole = dispatcherProfile.roles.includes("dispatch");
    const isManagerOrSupervisorOrAfterhours = dispatcherProfile.roles.includes("manager") || dispatcherProfile.roles.includes("supervisor") || dispatcherProfile.roles.includes("afterhours");

    // Show if: has dispatch role, OR is manager/supervisor/afterhours with orders, OR has gross > 0 (deleted users)
    if (!hasDispatchRole && !(isManagerOrSupervisorOrAfterhours && hasBookedOrders) && !hasBookedOrders) {
      return false;
    }

    // Filter by selected offices (only for admin/manager/chicago_management)
    if (selectedOffices.length > 0 && (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "chicago_management")) {
      if (!selectedOffices.includes(stat.office)) {
        return false;
      }
    }

    // Admins, managers, accounting, and chicago_management see all dispatchers
    if (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "accounting" || primaryRole === "chicago_management") {
      return true;
    }
    // Supervisors only see dispatchers from their office
    if (primaryRole === "supervisor" && profile?.office) {
      return dispatcherProfile.office === profile.office;
    }
    // Dispatchers only see themselves
    if (primaryRole === "dispatch" && profile?.full_name) {
      return stat.name === profile.full_name;
    }
    return false;
  }).filter(stat => {
    // Filter by 100k+ gross if enabled
    if (showOver100kGross && stat.totalFreight < 100000) {
      return false;
    }
    // Filter by supervisor
    if (selectedSupervisor !== "all") {
      const dispatcherProfile = dispatcherProfiles[stat.name];
      const dispatcherUserId = dispatcherProfile?.user_id;
      if (!dispatcherUserId) return false;
      // Show if this dispatcher is the supervisor themselves, or assigned to them
      if (dispatcherUserId !== selectedSupervisor && supervisorAssignments[dispatcherUserId] !== selectedSupervisor) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
  });

  // Calculate totals directly from filteredOrders to include ALL orders that pass date/office filters
  // When a supervisor is selected, only include orders from that supervisor's dispatchers
  const ordersForTotals = useMemo(() => {
    if (selectedSupervisor === "all") return filteredOrders;
    return filteredOrders.filter(order => {
      if (!order.bookedBy) return false;
      const dp = dispatcherProfiles[order.bookedBy];
      if (!dp) return false;
      const uid = dp.user_id;
      return uid === selectedSupervisor || supervisorAssignments[uid] === selectedSupervisor;
    });
  }, [filteredOrders, selectedSupervisor, dispatcherProfiles, supervisorAssignments]);

  const totals = ordersForTotals.reduce((acc, order) => {
    acc.totalFreight += Number(order.totalFreightAmountNoLumper) || 0;
    acc.totalDriverRate += getEffectiveDriverPay(order);
    acc.totalMiles += Number(order.mileage) || 0;
    acc.orderCount += 1;
    return acc;
  }, {
    totalFreight: 0,
    totalDriverRate: 0,
    totalMiles: 0,
    orderCount: 0
  });
  const totalCut = totals.totalFreight - totals.totalDriverRate;
  const totalCutPercent = totals.totalFreight > 0 ? totalCut / totals.totalFreight * 100 : 0;
  const totalRatePerMile = totals.totalMiles > 0 ? totals.totalFreight / totals.totalMiles : 0;

  // Calculate fleet averages from daily dispatcher counts (historical data)
  // For current day: if no data in dispatcher_daily_driver_counts, fall back to live truck assignments
  const fleetAverages = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const isCurrentDayOnly = dateRange?.from && format(dateRange.from, "yyyy-MM-dd") === today && (!dateRange.to || format(dateRange.to, "yyyy-MM-dd") === today);

    // Get dispatchers in scope (filtered by office if applicable, always exclude Recovery)
    const dispatchersInScope = Object.entries(dispatcherTruckCounts).filter(([dispatcherId]) => {
      // Always exclude Recovery office dispatchers
      const profile = Object.values(dispatcherProfiles).find(p => p.user_id === dispatcherId);
      if (profile?.office === "Recovery") return false;
      // Filter by office
      if (selectedOffices.length > 0) {
        if (!profile || !selectedOffices.includes(profile.office || '')) return false;
      }
      // Filter by supervisor
      if (selectedSupervisor !== "all") {
        if (dispatcherId !== selectedSupervisor && supervisorAssignments[dispatcherId] !== selectedSupervisor) return false;
      }
      return true;
    });

    // Check if we have data for current day
    const hasDataForToday = dispatchersInScope.some(([_, counts]) => counts.daysCount > 0);

    // If current day only and no historical data, use live truck/driver counts
    if (isCurrentDayOnly && !hasDataForToday) {
      // Use live counts from trucks table (passed via drivers hook or calculate here)
      // For now, return 0 and let a separate effect handle live counts
      return {
        truckCount: 0,
        driverCount: 0,
        avgTrucksPerDispatcher: 0,
        totalTruckDays: 0,
        avgGrossPerTruck: 0,
        avgMilesPerTruck: 0,
        weeklyAvgGrossPerTruck: 0,
        weeklyAvgMilesPerTruck: 0,
        uniqueDriverIds: [],
        needsLiveCounts: true,
        daysInPeriod: 1
      };
    }

    // Calculate days in period
    const fleetWeeksInPeriod = Math.max(1, daysInPeriod / 7);

    // Sum up totals across all dispatchers for the period
    // totalTrucks represents the SUM of all daily truck counts (for Coverage% calculation)
    let totalTruckDays = 0;
    let totalDriverDays = 0;
    let totalAvgTrucks = 0;
    let totalAvgDrivers = 0;
    let dispatchersWithData = 0;
    dispatchersInScope.forEach(([_, counts]) => {
      // Sum of all truck-days (for Coverage calculation)
      totalTruckDays += counts.totalTrucks;
      totalDriverDays += counts.totalDrivers;

      // Average per dispatcher = totalTrucks / daysCount (actual recorded days)
      if (counts.daysCount > 0) {
        totalAvgTrucks += counts.totalTrucks / counts.daysCount;
        totalAvgDrivers += counts.totalDrivers / counts.daysCount;
        dispatchersWithData += 1;
      }
    });

    const avgTrucksPerDispatcher = totalAvgTrucks;

    // Get unique drivers from orders for lost_day_notes query
    const uniqueDriverIds = Array.from(new Set(filteredOrders.flatMap(order => [order.driver1Id, order.driver2Id]).filter((id): id is string => !!id && id !== "null")));

    // Calculate averages
    const avgGrossPerTruck = totalAvgTrucks > 0 ? totals.totalFreight / totalAvgTrucks : 0;
    const avgMilesPerTruck = totalAvgTrucks > 0 ? totals.totalMiles / totalAvgTrucks : 0;

    // Weekly averages (for periods > 7 days, divide by weeks; otherwise use total)
    const weeklyAvgGrossPerTruck = daysInPeriod > 7 ? totalAvgTrucks > 0 ? totals.totalFreight / totalAvgTrucks / fleetWeeksInPeriod : 0 : avgGrossPerTruck;
    const weeklyAvgMilesPerTruck = daysInPeriod > 7 ? totalAvgTrucks > 0 ? totals.totalMiles / totalAvgTrucks / fleetWeeksInPeriod : 0 : avgMilesPerTruck;
    return {
      truckCount: totalAvgTrucks,
      driverCount: totalAvgDrivers,
      avgTrucksPerDispatcher,
      totalTruckDays,
      avgGrossPerTruck,
      avgMilesPerTruck,
      weeklyAvgGrossPerTruck,
      weeklyAvgMilesPerTruck,
      uniqueDriverIds,
      needsLiveCounts: false,
      daysInPeriod
    };
  }, [dispatcherTruckCounts, selectedOffices, selectedSupervisor, supervisorAssignments, dispatcherProfiles, totals, filteredOrders, dateRange]);

  // State for live truck/driver counts (fallback for current day)
  const [liveTruckCounts, setLiveTruckCounts] = useState<{
    trucks: number;
    drivers: number;
  } | null>(null);

  // Effect to fetch live truck/driver counts when needed for current day
  useEffect(() => {
    const fetchLiveCounts = async () => {
      if (!fleetAverages.needsLiveCounts) {
        setLiveTruckCounts(null);
        return;
      }
      try {
        // Get all trucks with assigned drivers, filtered by dispatcher office
        const {
          data: trucks,
          error
        } = await supabase.from("trucks").select("id, driver1_id, driver2_id, drivers!trucks_driver1_id_fkey(dispatcher_id)");
        if (error) {
          console.error("Error fetching live truck counts:", error);
          return;
        }

        // Filter by office if applicable
        let filteredTrucks = trucks || [];
        if (selectedOffices.length > 0) {
          const dispatchersInSelectedOffices = new Set(Object.values(dispatcherProfiles).filter(p => p.office && selectedOffices.includes(p.office)).map(p => p.user_id));
          filteredTrucks = filteredTrucks.filter((truck: any) => {
            const dispatcherId = truck.drivers?.dispatcher_id;
            return dispatcherId && dispatchersInSelectedOffices.has(dispatcherId);
          });
        }

        // Count trucks with at least one driver assigned
        const trucksWithDrivers = filteredTrucks.filter((t: any) => t.driver1_id);
        const truckCount = trucksWithDrivers.length;

        // Count all assigned drivers (driver1 + driver2 if exists)
        const driverCount = filteredTrucks.reduce((acc: number, t: any) => {
          let count = 0;
          if (t.driver1_id) count++;
          if (t.driver2_id) count++;
          return acc + count;
        }, 0);
        setLiveTruckCounts({
          trucks: truckCount,
          drivers: driverCount
        });
      } catch (error) {
        console.error("Error in fetchLiveCounts:", error);
      }
    };
    fetchLiveCounts();
  }, [fleetAverages.needsLiveCounts, selectedOffices, dispatcherProfiles]);

  // Final fleet averages (use live counts if needed)
  const finalFleetAverages = useMemo(() => {
    if (fleetAverages.needsLiveCounts && liveTruckCounts) {
      return {
        truckCount: liveTruckCounts.trucks,
        driverCount: liveTruckCounts.drivers,
        avgTrucksPerDispatcher: liveTruckCounts.trucks,
        totalTruckDays: liveTruckCounts.trucks,
        avgGrossPerTruck: liveTruckCounts.trucks > 0 ? totals.totalFreight / liveTruckCounts.trucks : 0,
        avgMilesPerTruck: liveTruckCounts.trucks > 0 ? totals.totalMiles / liveTruckCounts.trucks : 0,
        weeklyAvgGrossPerTruck: liveTruckCounts.trucks > 0 ? totals.totalFreight / liveTruckCounts.trucks : 0,
        weeklyAvgMilesPerTruck: liveTruckCounts.trucks > 0 ? totals.totalMiles / liveTruckCounts.trucks : 0,
        daysInPeriod: 1
      };
    }
    return {
      truckCount: fleetAverages.truckCount,
      driverCount: fleetAverages.driverCount,
      avgTrucksPerDispatcher: fleetAverages.avgTrucksPerDispatcher,
      totalTruckDays: fleetAverages.totalTruckDays,
      avgGrossPerTruck: fleetAverages.avgGrossPerTruck,
      avgMilesPerTruck: fleetAverages.avgMilesPerTruck,
      weeklyAvgGrossPerTruck: fleetAverages.weeklyAvgGrossPerTruck,
      weeklyAvgMilesPerTruck: fleetAverages.weeklyAvgMilesPerTruck,
      daysInPeriod: fleetAverages.daysInPeriod
    };
  }, [fleetAverages, liveTruckCounts, totals]);

  // State for lost days count (for Coverage% calculation)
  const [fleetLostDays, setFleetLostDays] = useState<number>(0);

  // Effect to fetch lost days from daily_driver_stats table
  // Lost Day = No pickup on that day AND not in-transit (picked up before, delivering after)
  useEffect(() => {
    const fetchFleetLostDays = async () => {
      if (!dateRange?.from) {
        setFleetLostDays(0);
        return;
      }
      const fromDate = format(dateRange.from, "yyyy-MM-dd");
      const toDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromDate;

      // Query the daily_driver_stats table which has pre-calculated lost days
      // The edge function calculates: lost_day = no pickup AND not in-transit
      let query = supabase.from("daily_driver_stats").select("driver_id, date, has_lost_day, office").gte("date", fromDate).lte("date", toDate).eq("has_lost_day", true);

      // Apply office filter if applicable
      if (selectedOffices.length > 0) {
        query = query.in("office", selectedOffices);
      }
      const {
        data,
        error
      } = await query;
      if (error) {
        console.error("Error fetching fleet lost days:", error);
        return;
      }

      // Count unique driver-date combinations with lost days
      const lostDaysSet = new Set<string>();
      (data || []).forEach((d: any) => {
        lostDaysSet.add(`${d.driver_id}-${d.date}`);
      });
      setFleetLostDays(lostDaysSet.size);
    };
    fetchFleetLostDays();
  }, [dateRange, selectedOffices]);

  // Calculate Coverage% = (totalTruckDays - lostDays) / totalTruckDays * 100
  // For single day: (232 trucks - 13 lost days) / 232 = 94.4%
  // For multi-day: (6322 total truck-days - 249 lost days) / 6322 = 96.1%
  const coveragePercent = useMemo(() => {
    if (!dateRange?.from || finalFleetAverages.totalTruckDays === 0) return 100;

    // Coverage% = (totalTruckDays - lostDays) / totalTruckDays * 100
    // This correctly scales for multi-day periods
    const coverage = (finalFleetAverages.totalTruckDays - fleetLostDays) / finalFleetAverages.totalTruckDays * 100;
    return Math.max(0, coverage);
  }, [dateRange, finalFleetAverages.totalTruckDays, fleetLostDays]);

  // Create a Set of active driver names for filtering
  const activeDriverNames = useMemo(() => {
    return new Set((drivers || []).filter(d => d.is_active).map(d => d.name).filter(Boolean));
  }, [drivers]);

  // Calculate driver analytics with first pickup date for gross tier calculation
  // Use ALL orders (not filtered by date) for gross tier calculation
  const driverAnalyticsAllTime = useMemo(() => {
    return (orders || []).reduce((acc, order) => {
      // Exclude canceled orders without TONU
      if (order.canceled && !(order.tonu > 0 || order.tonuDriver > 0)) {
        return acc;
      }
      const driverName = order.driverName;
      if (driverName && driverName !== "N/A") {
        if (!acc[driverName]) {
          acc[driverName] = {
            totalGross: 0,
            firstPickupDate: null as string | null
          };
        }
        acc[driverName].totalGross += Number(order.totalFreightAmountNoLumper) || 0;
        // Track earliest pickup date
        const pickupDate = order.pickupDate;
        if (pickupDate && pickupDate !== "N/A" && pickupDate !== "Invalid Date") {
          if (!acc[driverName].firstPickupDate || pickupDate < acc[driverName].firstPickupDate) {
            acc[driverName].firstPickupDate = pickupDate;
          }
        }
      }
      return acc;
    }, {} as Record<string, {
      totalGross: number;
      firstPickupDate: string | null;
    }>);
  }, [orders]);

  // Calculate driver analytics (filtered by date range for display)
  const driverAnalytics = filteredOrders.reduce((acc, order) => {
    // Get driver name from the order (already transformed)
    const driverName = order.driverName;
    if (driverName && driverName !== "N/A") {
      if (!acc[driverName]) {
        acc[driverName] = {
          totalDriverRate: 0,
          totalMiles: 0,
          orderCount: 0
        };
      }
      acc[driverName].totalDriverRate += Number(order.totalDriverPay) || 0;
      acc[driverName].totalMiles += Number(order.mileage) || 0;
      acc[driverName].orderCount += 1;
    }
    return acc;
  }, {} as Record<string, {
    totalDriverRate: number;
    totalMiles: number;
    orderCount: number;
  }>);

  // Helper function to calculate gross tier based on weekly average
  const calculateGrossTier = (driverName: string): string => {
    const allTimeData = driverAnalyticsAllTime[driverName];
    if (!allTimeData || !allTimeData.firstPickupDate) {
      return "Tier 3"; // No data, default to Tier 3
    }

    // Get current date in Chicago time
    const chicagoNow = new Date(new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago"
    }));

    // Parse first pickup date
    const firstPickupStr = allTimeData.firstPickupDate.split("T")[0];
    const [year, month, day] = firstPickupStr.split("-").map(Number);
    const firstPickupDate = new Date(year, month - 1, day);

    // Calculate days in company
    const diffTime = chicagoNow.getTime() - firstPickupDate.getTime();
    const daysInCompany = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Calculate weekly gross
    const weeksInCompany = daysInCompany / 7;
    const grossPerWeek = allTimeData.totalGross / weeksInCompany;

    // Determine tier
    if (grossPerWeek >= 6000) {
      return "Tier 1";
    } else if (grossPerWeek >= 3500) {
      return "Tier 2";
    } else {
      return "Tier 3";
    }
  };
  const driverStats = Object.entries(driverAnalytics).filter(([name]) => activeDriverNames.has(name)) // Only active drivers
  .map(([name, stats]: [string, {
    totalDriverRate: number;
    totalMiles: number;
    orderCount: number;
  }]) => {
    const ratePerMile = stats.totalMiles > 0 ? stats.totalDriverRate / stats.totalMiles : 0;
    return {
      name,
      totalDriverRate: stats.totalDriverRate,
      totalMiles: stats.totalMiles,
      orderCount: stats.orderCount,
      ratePerMile,
      grossTier: calculateGrossTier(name),
      // Auto-calculated
      safetyTier: driverTiers[name]?.safetyTier || "Tier 1",
      managementTier: driverTiers[name]?.managementTier || "Tier 1",
      notice: driverTiers[name]?.notice || ""
    };
  }).filter(stat => {
    // Filter by driver name search
    const matchesSearch = stat.name.toLowerCase().includes(driverSearchQuery.toLowerCase());

    // Filter by tiers
    const matchesGrossTier = grossTierFilter === "all" || stat.grossTier === grossTierFilter;
    const matchesSafetyTier = safetyTierFilter === "all" || stat.safetyTier === safetyTierFilter;
    const matchesManagementTier = managementTierFilter === "all" || stat.managementTier === managementTierFilter;
    return matchesSearch && matchesGrossTier && matchesSafetyTier && matchesManagementTier;
  }).sort((a, b) => {
    const aValue = a.totalDriverRate;
    const bValue = b.totalDriverRate;
    return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
  });
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Tier 1":
        return "bg-green-500 text-white hover:bg-green-600";
      case "Tier 2":
        return "bg-yellow-500 text-white hover:bg-yellow-600";
      case "Tier 3":
        return "bg-red-500 text-white hover:bg-red-600";
      default:
        return "bg-gray-500 text-white hover:bg-gray-600";
    }
  };
  const handleTierChange = (driverName: string, tierType: "grossTier" | "safetyTier" | "managementTier", value: string) => {
    const currentData = driverTiers[driverName] || {
      grossTier: "Tier 1",
      safetyTier: "Tier 1",
      managementTier: "Tier 1",
      notice: ""
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: tierType === "grossTier" ? value : currentData.grossTier,
      safety_tier: tierType === "safetyTier" ? value : currentData.safetyTier,
      management_tier: tierType === "managementTier" ? value : currentData.managementTier,
      notice: currentData.notice
    });
  };
  const handleNoticeSave = React.useCallback((driverName: string, notice: string) => {
    const currentData = driverTiers[driverName] || {
      grossTier: "Tier 1",
      safetyTier: "Tier 1",
      managementTier: "Tier 1",
      notice: ""
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: currentData.grossTier,
      safety_tier: currentData.safetyTier,
      management_tier: currentData.managementTier,
      notice
    });
  }, [driverTiers, updatePerformance]);
  const handleSort = (column: "totalFreight" | "ratePerMile" | "cut" | "cutPercent" | "avgDhMiles" | "avgWeeklyGrossPerDriver" | "turnover" | "emptyDays") => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // Handle sorting for Salaries tab
  const handleSalarySort = (column: "name" | "salary") => {
    if (salarySortBy === column) {
      setSalarySortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSalarySortBy(column);
      setSalarySortDir(column === "name" ? "asc" : "desc"); // Default to asc for name, desc for salary
    }
  };

  // Create sorted dispatcher stats for salaries tab
  const sortedDispatcherStatsForSalaries = useMemo(() => {
    const stats = [...dispatcherStats].filter(stat => {
      // Deleted users (no valid userId) only appear in months where they have freight
      // Once they have no more orders in a period, they disappear from salaries
      if (!stat.userId) return stat.totalFreight > 0;
      return true;
    });
    return stats.sort((a, b) => {
      if (salarySortBy === "name") {
        const comparison = a.name.localeCompare(b.name);
        return salarySortDir === "asc" ? comparison : -comparison;
      } else {
        // Sort by calculated salary (totalFreight * 0.01 + cut * 0.05)
        const salaryA = a.totalFreight * 0.01 + a.cut * 0.05;
        const salaryB = b.totalFreight * 0.01 + b.cut * 0.05;
        return salarySortDir === "desc" ? salaryB - salaryA : salaryA - salaryB;
      }
    });
  }, [dispatcherStats, salarySortBy, salarySortDir]);

  // Handle sorting for Driver Gross Rankings
  const handleGrossRankingsSort = (column: typeof grossRankingsSortBy) => {
    if (grossRankingsSortBy === column) {
      setGrossRankingsSortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setGrossRankingsSortBy(column);
      setGrossRankingsSortDir("desc");
    }
  };

  // Helper function to calculate median
  const calculateMedian = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  // Calculate Driver Gross Rankings - weekly averages from 2nd week to 2nd-to-last week
  const driverGrossRankings = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    // Build a map from driver name to current truck number from drivers data
    const driverNameToCurrentTruck: Record<string, string> = {};
    (drivers || []).forEach(driver => {
      if (driver.name && driver.truck_info?.truck_number) {
        driverNameToCurrentTruck[driver.name.trim()] = driver.truck_info.truck_number;
      }
    });

    // Group orders by driver and by week (Tuesday-Monday), also track truck numbers and team status
    const driverWeeklyData: Record<string, Record<string, {
      freight: number;
      driverPay: number;
      miles: number;
    }>> = {};
    const driverTrucks: Record<string, Set<string>> = {};
    const driverIsTeam: Record<string, boolean> = {}; // Track if driver has any team orders
    const driverTeammates: Record<string, Set<string>> = {}; // Track teammate names

    (orders || []).forEach(order => {
      // Exclude canceled orders without TONU
      if (order.canceled && !(order.tonu > 0 || order.tonuDriver > 0)) {
        return;
      }
      const rawDriverName = order.driverName;
      if (!rawDriverName || rawDriverName === "N/A") return;
      // Normalize driver name to avoid duplicates from whitespace differences
      const driverName = rawDriverName.trim();

      // Check if this is a team order (has driver2)
      const hasDriver2 = order.driver2Id || order.driver2Name;
      if (hasDriver2) {
        driverIsTeam[driverName] = true;
        // Track the teammate names for the popover
        if (!driverTeammates[driverName]) {
          driverTeammates[driverName] = new Set();
        }
        // Add both driver names
        if (order.driver1Name) driverTeammates[driverName].add(order.driver1Name);
        if (order.driver2Name) driverTeammates[driverName].add(order.driver2Name);
      }

      // Track truck numbers for this driver
      const truckNumber = order.truckNumber;
      if (truckNumber && truckNumber !== "N/A") {
        if (!driverTrucks[driverName]) {
          driverTrucks[driverName] = new Set();
        }
        driverTrucks[driverName].add(truckNumber);
      }

      // Get delivery date for week calculation
      const deliveryDateStr = order.deliveryDate || order.deliveryDatetime;
      if (!deliveryDateStr || deliveryDateStr === "N/A" || deliveryDateStr === "Invalid Date") return;

      // Parse the date
      const dateStr = deliveryDateStr.split("T")[0].split(" ")[0];
      const [year, month, day] = dateStr.split("-").map(Number);
      if (!year || !month || !day) return;
      const deliveryDate = new Date(year, month - 1, day);

      // Get week start (Tuesday) using date-fns
      const weekStart = startOfWeek(deliveryDate, {
        weekStartsOn: 2
      }); // 2 = Tuesday
      const weekKey = format(weekStart, "yyyy-MM-dd");
      if (!driverWeeklyData[driverName]) {
        driverWeeklyData[driverName] = {};
      }
      if (!driverWeeklyData[driverName][weekKey]) {
        driverWeeklyData[driverName][weekKey] = {
          freight: 0,
          driverPay: 0,
          miles: 0
        };
      }
      driverWeeklyData[driverName][weekKey].freight += Number(order.totalFreightAmountNoLumper) || 0;
      driverWeeklyData[driverName][weekKey].driverPay += Number(order.totalDriverPay) || 0;
      driverWeeklyData[driverName][weekKey].miles += Number(order.mileage) || 0;
    });

    // Calculate stats for each driver
    const rankings = Object.entries(driverWeeklyData).map(([driverName, weeklyData]) => {
      const weekKeys = Object.keys(weeklyData).sort();

      // Exclude first and last week (need at least 3 weeks of data)
      const includedWeeks = weekKeys.length >= 3 ? weekKeys.slice(1, -1) : weekKeys;
      const isTeam = driverIsTeam[driverName] || driverName.includes(" & ");
      const teamNames = isTeam ? Array.from(driverTeammates[driverName] || []).length > 0 ? Array.from(driverTeammates[driverName]) : driverName.split(" & ").map(n => n.trim()) : [];
      if (includedWeeks.length === 0) {
        return {
          name: driverName,
          trucks: Array.from(driverTrucks[driverName] || []),
          isTeam,
          teamNames,
          avgFreight: 0,
          avgDriverPay: 0,
          avgMiles: 0,
          avgCut: 0,
          medianFreight: 0,
          medianDriverPay: 0,
          medianMiles: 0,
        rpmCompany: 0,
          rpmDriver: 0,
          totalComm: 0,
          weeksCount: 0
        };
      }
      const weeklyFreights = includedWeeks.map(wk => weeklyData[wk].freight);
      const weeklyDriverPays = includedWeeks.map(wk => weeklyData[wk].driverPay);
      const weeklyMiles = includedWeeks.map(wk => weeklyData[wk].miles);
      const totalFreight = weeklyFreights.reduce((sum, v) => sum + v, 0);
      const totalDriverPay = weeklyDriverPays.reduce((sum, v) => sum + v, 0);
      const totalMiles = weeklyMiles.reduce((sum, v) => sum + v, 0);
      const avgFreight = totalFreight / includedWeeks.length;
      const avgDriverPay = totalDriverPay / includedWeeks.length;
      const avgMiles = totalMiles / includedWeeks.length;

      // All-time totals (including first and last week) for Total Comm and RPM
      const allWeekFreights = weekKeys.map(wk => weeklyData[wk].freight);
      const allWeekDriverPays = weekKeys.map(wk => weeklyData[wk].driverPay);
      const allWeekMiles = weekKeys.map(wk => weeklyData[wk].miles);
      const allTimeFreight = allWeekFreights.reduce((sum, v) => sum + v, 0);
      const allTimeDriverPay = allWeekDriverPays.reduce((sum, v) => sum + v, 0);
      const allTimeMiles = allWeekMiles.reduce((sum, v) => sum + v, 0);

      return {
        name: driverName,
        trucks: Array.from(driverTrucks[driverName] || []),
        currentTruck: driverNameToCurrentTruck[driverName] || null,
        isTeam,
        teamNames,
        avgFreight,
        avgDriverPay,
        avgMiles,
        avgCut: avgFreight - avgDriverPay,
        medianFreight: calculateMedian(weeklyFreights),
        medianDriverPay: calculateMedian(weeklyDriverPays),
        medianMiles: calculateMedian(weeklyMiles),
        rpmCompany: allTimeMiles > 0 ? allTimeFreight / allTimeMiles : 0,
        rpmDriver: allTimeMiles > 0 ? allTimeDriverPay / allTimeMiles : 0,
        totalComm: allTimeFreight - allTimeDriverPay,
        weeksCount: includedWeeks.length
      };
    });
    return rankings;
  }, [orders, drivers]);

  // State for expanded team driver rows
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Build set of recovery driver names for filtering
  const recoveryDriverNames = useMemo(() => {
    return new Set((drivers || []).filter(d => d.is_recovery).map(d => d.name));
  }, [drivers]);

  // Filter and sort Driver Gross Rankings
  const filteredAndSortedRankings = useMemo(() => {
    // Build driver name -> dispatcher user_id map for office/supervisor filtering
    const driverNameToDispatcherId: Record<string, string> = {};
    (drivers || []).forEach(d => {
      if (d.name && d.dispatcher_id) {
        driverNameToDispatcherId[d.name] = d.dispatcher_id;
      }
    });

    return driverGrossRankings.filter(driver => {
      // Exclude recovery drivers
      if (recoveryDriverNames.has(driver.name)) return false;
      // Only show active drivers
      if (!activeDriverNames.has(driver.name)) return false;
      // Only show drivers with at least 3 qualifying weeks
      if (driver.weeksCount < 3) return false;
      // Apply search filter (by name or truck number)
      if (grossRankingsSearch) {
        const searchLower = grossRankingsSearch.toLowerCase();
        const matchesName = driver.name.toLowerCase().includes(searchLower);
        const matchesTruck = driver.trucks.some(t => t.toLowerCase().includes(searchLower));
        if (!matchesName && !matchesTruck) return false;
      }
      // Filter by office in Driver Analytics
      if (driverAnalyticsOffices.length > 0) {
        const dispatcherId = driverNameToDispatcherId[driver.name];
        if (!dispatcherId) return false;
        const dProfile = Object.values(dispatcherProfiles).find(p => p.user_id === dispatcherId);
        if (!dProfile || !driverAnalyticsOffices.includes(dProfile.office || '')) return false;
      }
      // Filter by supervisor in Driver Analytics
      if (driverAnalyticsSupervisor !== "all") {
        const dispatcherId = driverNameToDispatcherId[driver.name];
        if (!dispatcherId) return false;
        // Show if dispatcher is the supervisor or assigned to supervisor
        if (dispatcherId !== driverAnalyticsSupervisor && supervisorAssignments[dispatcherId] !== driverAnalyticsSupervisor) {
          return false;
        }
      }
      return true;
    }).map(driver => {
      const debtData = driverDebts[driver.name];
      return {
        ...driver,
        currentDebt: debtData?.currentDebt || 0,
        totalDebt: debtData?.totalDebt || 0
      };
    }).sort((a, b) => {
      const aValue = a[grossRankingsSortBy];
      const bValue = b[grossRankingsSortBy];
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return grossRankingsSortDir === "desc" ? bValue - aValue : aValue - bValue;
      }
      return 0;
    });
  }, [driverGrossRankings, activeDriverNames, recoveryDriverNames, grossRankingsSearch, grossRankingsSortBy, grossRankingsSortDir, driverDebts, driverAnalyticsOffices, driverAnalyticsSupervisor, drivers, dispatcherProfiles, supervisorAssignments]);

  // Filter loads booked today with rate <= 2.00
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Calculate current week start (Monday) and end (Sunday) in Chicago time
  const getChicagoWeekBounds = () => {
    // Get current time in Chicago
    const chicagoNow = new Date(new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago"
    }));
    const dayOfWeek = chicagoNow.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate days since Monday (if Sunday, go back 6 days)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Week start (Monday 00:00:00 Chicago time)
    const weekStart = new Date(chicagoNow);
    weekStart.setDate(chicagoNow.getDate() - daysSinceMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Week end (Sunday 23:59:59 Chicago time)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return {
      weekStart,
      weekEnd
    };
  };
  const {
    weekStart,
    weekEnd
  } = getChicagoWeekBounds();

  // Filter loads booked today with rate <= 1.70, respecting role permissions
  const qualifyingLoads = filteredOrders.filter(order => {
    const createdAt = new Date(order.createdAt);
    const isToday = createdAt >= today && createdAt <= todayEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmountNoLumper / order.mileage : 0;
    const meetsRateThreshold = ratePerMile <= 1.7;
    return isToday && meetsRateThreshold;
  });

  // Filter loads booked this week with rate >= 4.00 (Chicago time, Monday reset)
  const highRateLoads = filteredOrders.filter(order => {
    const createdAt = new Date(order.createdAt);
    const isThisWeek = createdAt >= weekStart && createdAt <= weekEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmountNoLumper / order.mileage : 0;
    const meetsRateThreshold = ratePerMile >= 4.0;
    return isThisWeek && meetsRateThreshold;
  });

  // Filter loads with 50%+ cut booked this week (Chicago time, Monday reset)
  // Company driver orders are excluded since their effective driver pay = freight (0% cut)
  const highCutLoads = filteredOrders.filter(order => {
    const createdAt = new Date(order.createdAt);
    const isThisWeek = createdAt >= weekStart && createdAt <= weekEnd;
    if (!isThisWeek) return false;
    const freightAmount = Number(order.totalFreightAmountNoLumper) || 0;
    const driverPay = getEffectiveDriverPay(order);
    if (freightAmount <= 0) return false;
    const cutPercent = (freightAmount - driverPay) / freightAmount * 100;
    return cutPercent >= 50;
  });
  // Show loading animation while orders are being fetched
  if (isLoading || (progress && !progress.isComplete)) {
    const unlockedPercent = progress?.unlockedTotal 
      ? Math.round((progress.unlockedLoaded / progress.unlockedTotal) * 100) 
      : 0;
    const lockedPercent = progress?.lockedTotal 
      ? Math.round((progress.lockedLoaded / progress.lockedTotal) * 100) 
      : (progress?.lockedLoaded ? 50 : 0);
    
    return <div className="space-y-6 p-6">
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="relative">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">Loading Analytics Data</h2>
            <p className="text-muted-foreground">
              Please wait while all orders are being loaded...
            </p>
          </div>
          
          {/* Progress indicators */}
          <div className="w-full max-w-md space-y-4">
            {/* Unlocked orders progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  {progress?.unlockedTotal && progress.unlockedLoaded >= progress.unlockedTotal ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  Active Orders
                </span>
                <span className="text-muted-foreground">
                  {progress?.unlockedLoaded?.toLocaleString() || 0}
                  {progress?.unlockedTotal !== null && ` / ${progress.unlockedTotal.toLocaleString()}`}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${unlockedPercent || (progress?.unlockedLoaded ? 100 : 0)}%` }}
                />
              </div>
            </div>
            
            {/* Locked orders progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  {progress?.lockedTotal && progress.lockedLoaded >= progress.lockedTotal ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : progress?.isLoadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin text-warning" />
                  ) : (
                    <span className="h-4 w-4 rounded-full bg-muted" />
                  )}
                  Archived Orders
                </span>
                <span className="text-muted-foreground">
                  {progress?.lockedLoaded?.toLocaleString() || 0}
                  {progress?.lockedTotal !== null && ` / ${progress.lockedTotal.toLocaleString()}`}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-warning transition-all duration-300 ease-out"
                  style={{ width: `${lockedPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6 p-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>;
  }
  return <div className="h-full w-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
          </div>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
              <TabsTrigger value="performance">Dispatcher Performance</TabsTrigger>
              {/* Hide Driver Gross Rankings and Loads tabs for dispatch-only users */}
              {!isDispatchOnly && <TabsTrigger value="driver-gross-rankings">Driver Analytics</TabsTrigger>}
              {/* Hidden: Driver Performance tab - keeping code for future use */}
              {/* <TabsTrigger value="driver-performance">Driver Performance</TabsTrigger> */}
              {!isDispatchOnly && <TabsTrigger value="loads">Loads ({qualifyingLoads.length})</TabsTrigger>}
              {/* Show Salaries tab for admins/chicago_management OR for dispatch-only users (their own salary) */}
              {(canViewSalaries || isDispatchOnly) && <TabsTrigger value="salaries">{isDispatchOnly ? "My Salary" : "Salaries"}</TabsTrigger>}
            </TabsList>
            <Button variant="outline" onClick={() => navigate("/billboard")}>
              Billboard
            </Button>
          </div>

          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle>Dispatcher Performance</CardTitle>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center w-full sm:w-auto">
                    <Select value={selectedWeek} onValueChange={handleWeekChange}>
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Select week" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time weekly</SelectItem>
                        {weekOptions.map(week => <SelectItem key={week.value} value={week.value}>
                            {week.label}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Select value={selectedMonth} onValueChange={handleMonthChange}>
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time monthly</SelectItem>
                        {monthOptions.map(month => <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>

                    <DateRangePicker date={filterType === "custom" ? dateRange : undefined} onDateChange={range => {
                    setDateRange(range);
                    setSelectedWeek("all");
                    setSelectedMonth("all");
                    setFilterType("custom");
                  }} placeholder="Custom date range (by pickup)" className="w-full sm:w-72" />
                    {dateRange && <Button variant="outline" size="sm" onClick={() => {
                    setDateRange(undefined);
                    setSelectedWeek("all");
                    setSelectedMonth("all");
                  }}>
                        Clear Filter
                      </Button>}
                  </div>

                  {/* Filters - Only for Admin/Manager/Chicago Management */}
                  {(hasRole("admin") || hasRole("manager") || hasRole("chicago_management")) && <div className="flex flex-wrap gap-2 items-center w-full justify-between">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-muted-foreground">Office:</span>
                        {Array.from(new Set(Object.values(dispatcherProfiles).map(p => p.office).filter(Boolean))).filter(office => office !== "Recovery").map(office => <Button key={office} variant={selectedOffices.includes(office as string) ? "default" : "outline"} size="sm" onClick={() => {
                      setSelectedOffices(prev => prev.includes(office as string) ? prev.filter(o => o !== office) : [...prev, office as string]);
                    }}>
                            {office}
                          </Button>)}
                        {selectedOffices.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedOffices([])}>
                            Clear Offices
                          </Button>}
                        
                        {/* Supervisor filter - toggle buttons like office */}
                        {Object.keys(supervisorNames).length > 0 && <>
                          <span className="text-sm font-medium text-muted-foreground ml-2">Supervisor:</span>
                          {Object.entries(supervisorNames).map(([id, name]) => (
                            <Button key={id} variant={selectedSupervisor === id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedSupervisor(prev => prev === id ? "all" : id);
                            }}>
                              {name}
                            </Button>
                          ))}
                          {selectedSupervisor !== "all" && <Button variant="ghost" size="sm" onClick={() => setSelectedSupervisor("all")}>
                            Clear
                          </Button>}
                        </>}
                      </div>
                      <Button variant={showOver100kGross ? "default" : "outline"} size="sm" onClick={() => setShowOver100kGross(!showOver100kGross)}>
                        100k+ Gross
                      </Button>
                    </div>}
                </div>
              </CardHeader>
              <CardContent>
                {/* Totals Section */}
                <div className="mb-6 p-4 sm:p-6 bg-muted/50 rounded-lg border">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-8">
                    <div className="text-center">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total Freight</p>
                      <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
                        $
                        {totals.totalFreight.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total Miles</p>
                      <p className="text-lg sm:text-2xl font-bold">{totals.totalMiles.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Rate/Mile</p>
                      <p className="text-lg sm:text-2xl font-bold">${totalRatePerMile.toFixed(2)}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total Comm.</p>
                      <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
                        $
                        {totalCut.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      </p>
                    </div>
                    <div className="text-center col-span-2 sm:col-span-1">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Comm. %</p>
                      <p className="text-lg sm:text-2xl font-bold">{totalCutPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                  
                  {/* Expandable Extra Stats */}
                  {showExtraStats && !isDispatchOnly && (() => {
                    // Exclude recovery drivers from extra stats
                    const nonRecoveryOrders = ordersForTotals.filter(o => !recoveryDriverNames.has(o.driverName));
                    const nonRecoveryTotalDhMiles = nonRecoveryOrders.reduce((sum, o) => sum + (Number(o.dhMiles) || 0), 0);
                    const nonRecoveryOrderCount = nonRecoveryOrders.length;
                    const avgDhMilesTotal = nonRecoveryOrderCount > 0 ? nonRecoveryTotalDhMiles / nonRecoveryOrderCount : 0;
                    const displayTruckCount = finalFleetAverages.truckCount;
                    const nonRecoveryFreight = nonRecoveryOrders.reduce((sum, o) => sum + (Number(o.totalFreightAmountNoLumper) || 0), 0);
                    const nonRecoveryMiles = nonRecoveryOrders.reduce((sum, o) => sum + (Number(o.mileage) || 0), 0);
                    const localDaysInPeriod = dateRange?.from
                      ? Math.ceil((effectiveTo.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
                      : 1;
                    const wkGrossPerTruck = displayTruckCount > 0
                      ? filterType === "week"
                        ? nonRecoveryFreight / displayTruckCount
                        : nonRecoveryFreight / displayTruckCount / localDaysInPeriod * 7
                      : 0;
                    const wkMilesPerTruck = displayTruckCount > 0
                      ? filterType === "week"
                        ? nonRecoveryMiles / displayTruckCount
                        : nonRecoveryMiles / displayTruckCount / localDaysInPeriod * 7
                      : 0;
                    return (
                      <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Wk Gross/Tr</p>
                          <p className="text-lg sm:text-2xl font-bold">
                            ${wkGrossPerTruck.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Wk Miles/Tr</p>
                          <p className="text-lg sm:text-2xl font-bold">
                            {wkMilesPerTruck.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg DH</p>
                          <p className="text-lg sm:text-2xl font-bold">{avgDhMilesTotal.toFixed(0)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Trucks</p>
                          <p className="text-lg sm:text-2xl font-bold">{finalFleetAverages.avgTrucksPerDispatcher.toFixed(1)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* "+" button bottom right */}
                  {!isDispatchOnly && (
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 rounded-full"
                        onClick={() => setShowExtraStats(!showExtraStats)}
                      >
                        <Plus className={`h-4 w-4 transition-transform ${showExtraStats ? "rotate-45" : ""}`} />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Only show dispatcher table if there's more than 1 dispatcher */}
                {dispatcherStats.length > 1 && <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dispatcher</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("totalFreight")}>
                            Total Freight {sortBy === "totalFreight" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>
                          <TableHead className="text-right">Total Miles</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ratePerMile")}>
                            Rate/Mile {sortBy === "ratePerMile" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>
                          {!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("avgDhMiles")}>
                            Avg DH {sortBy === "avgDhMiles" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>}

                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cut")}>
                            Comm. {sortBy === "cut" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cutPercent")}>
                            Comm. % {sortBy === "cutPercent" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>
                          <TableHead className="text-right">Avg Trucks</TableHead>
                          {!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("avgWeeklyGrossPerDriver")}>
                            Avg Wk Gross/Dr {sortBy === "avgWeeklyGrossPerDriver" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>}
                          {!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("turnover")}>
                            Turnover {sortBy === "turnover" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>}
                          {!isDispatchOnly && <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("emptyDays")}>
                            Empty Days {sortBy === "emptyDays" && (sortDirection === "desc" ? "↓" : "↑")}
                          </TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dispatcherStats.map((stat, index) => {
                      // Get the most recent note for this dispatcher in the date range
                      const dispatcherNotesForUser = dispatcherNotes.filter(n => n.dispatcher_id === stat.userId);
                      const mostRecentNote = dispatcherNotesForUser.length > 0 ? dispatcherNotesForUser.reduce((latest, current) => new Date(current.date) > new Date(latest.date) ? current : latest) : null;
                      const canViewAndEditNotes = hasRole("manager") || hasRole("admin") || hasRole("chicago_management");
                      const todayDate = format(new Date(), "yyyy-MM-dd");
                      return <TableRow key={stat.name} className={index === dispatcherStats.length - 1 ? "border-b" : ""}>
                              <TableCell className="font-medium">
                                <div className="flex items-center">
                                  {stat.name}
                                  {canViewAndEditNotes && stat.userId && <DispatcherNoteDialog dispatcherId={stat.userId} initialDate={todayDate} existingNote={mostRecentNote ? {
                              id: mostRecentNote.id,
                              note: mostRecentNote.note,
                              color: mostRecentNote.color
                            } : undefined} canEdit={canViewAndEditNotes} />}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {stat.totalFreight.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                              <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>
                              {!isDispatchOnly && <TableCell className="text-right">{stat.avgDhMiles.toFixed(0)}</TableCell>}

                              <TableCell className="text-right">
                                $
                                {stat.cut.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">{stat.cutPercent.toFixed(1)}%</TableCell>
                              <TableCell className="text-right">
                                {stat.avgTrucks > 0 ? stat.avgTrucks.toFixed(1) : "-"}
                              </TableCell>
                              {!isDispatchOnly && <TableCell className="text-right">
                                ${stat.avgWeeklyGrossPerDriver.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </TableCell>}
                              {!isDispatchOnly && <TableCell className="text-right">
                                {stat.turnover > 0 ? stat.turnover : "-"}
                              </TableCell>}
                              {!isDispatchOnly && <TableCell className="text-right">
                                {stat.emptyDays > 0 ? stat.emptyDays : "-"}
                              </TableCell>}
                            </TableRow>;
                    })}
                      </TableBody>
                    </Table>
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="driver-gross-rankings" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <CardTitle>Driver Analytics</CardTitle>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input placeholder="Search driver or truck..." value={grossRankingsSearch} onChange={e => setGrossRankingsSearch(e.target.value)} className="w-64" />
                    {grossRankingsSearch && <Button variant="outline" size="sm" onClick={() => setGrossRankingsSearch("")}>
                        Clear
                      </Button>}
                    
                    {/* Office filter for Driver Analytics */}
                    {(hasRole("admin") || hasRole("manager") || hasRole("chicago_management")) && <>
                      <span className="text-sm font-medium text-muted-foreground ml-2">Office:</span>
                      {Array.from(new Set(Object.values(dispatcherProfiles).map(p => p.office).filter(Boolean))).filter(office => office !== "Recovery").map(office => (
                        <Button key={office} variant={driverAnalyticsOffices.includes(office as string) ? "default" : "outline"} size="sm" onClick={() => {
                          setDriverAnalyticsOffices(prev => prev.includes(office as string) ? prev.filter(o => o !== office) : [...prev, office as string]);
                        }}>
                          {office}
                        </Button>
                      ))}
                      {driverAnalyticsOffices.length > 0 && <Button variant="ghost" size="sm" onClick={() => setDriverAnalyticsOffices([])}>
                        Clear
                      </Button>}
                    </>}
                    
                    {/* Supervisor filter for Driver Analytics - toggle buttons */}
                    {Object.keys(supervisorNames).length > 0 && (hasRole("admin") || hasRole("manager") || hasRole("chicago_management")) && <>
                      <span className="text-sm font-medium text-muted-foreground ml-2">Supervisor:</span>
                      {Object.entries(supervisorNames).map(([id, name]) => (
                        <Button key={id} variant={driverAnalyticsSupervisor === id ? "default" : "outline"} size="sm" onClick={() => {
                          setDriverAnalyticsSupervisor(prev => prev === id ? "all" : id);
                        }}>
                          {name}
                        </Button>
                      ))}
                      {driverAnalyticsSupervisor !== "all" && <Button variant="ghost" size="sm" onClick={() => setDriverAnalyticsSupervisor("all")}>
                        Clear
                      </Button>}
                    </>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[6%]">Truck#</TableHead>
                        <TableHead className="w-[10%]">Driver Name</TableHead>
                        <TableHead className="text-right w-[10%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("avgFreight")}>
                          Avg Freight {grossRankingsSortBy === "avgFreight" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[10%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("avgDriverPay")}>
                          Avg Driver Pay {grossRankingsSortBy === "avgDriverPay" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[8%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("avgMiles")}>
                          Avg Miles {grossRankingsSortBy === "avgMiles" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[8%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("avgCut")}>
                          Avg Cut {grossRankingsSortBy === "avgCut" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[5%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("rpmCompany")}>
                          RPM Co {grossRankingsSortBy === "rpmCompany" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[5%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("rpmDriver")}>
                          RPM Dr {grossRankingsSortBy === "rpmDriver" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[8%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("totalComm")}>
                          Total Comm. {grossRankingsSortBy === "totalComm" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[5%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("weeksCount")}>
                          Weeks {grossRankingsSortBy === "weeksCount" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}
                        </TableHead>
                        <TableHead className="text-right w-[8%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("currentDebt")}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">Current Debt {grossRankingsSortBy === "currentDebt" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>All debt without yearly expenses</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="text-right w-[8%] cursor-pointer hover:bg-muted/50" onClick={() => handleGrossRankingsSort("totalDebt")}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">Total Debt {grossRankingsSortBy === "totalDebt" && (grossRankingsSortDir === "desc" ? "↓" : "↑")}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>All debt including yearly expenses</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="w-[9%]">Notice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedRankings.length === 0 ? <TableRow>
                          <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                            No data available
                          </TableCell>
                        </TableRow> : filteredAndSortedRankings.map((driver, index) => {
                      return <TableRow key={driver.name} className={index === filteredAndSortedRankings.length - 1 ? "border-b" : ""}>
                              <TableCell className="font-medium">
                                {driver.currentTruck || (driver.trucks.length > 0 ? driver.trucks[driver.trucks.length - 1] : "-")}
                              </TableCell>
                              <TableCell className="font-medium">
                                {driver.isTeam && driver.teamNames.length > 1 ? <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="text-left hover:underline cursor-pointer text-primary font-medium">
                                        Team
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-3">
                                      <div className="space-y-1">
                                        {driver.teamNames.map((name, i) => <div key={i} className="text-sm">{name}</div>)}
                                      </div>
                                    </PopoverContent>
                                  </Popover> : driver.teamNames.length === 1 ? driver.teamNames[0] : driver.name}
                              </TableCell>
                              <TableCell className="text-right">
                                ${driver.avgFreight.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">
                                ${driver.avgDriverPay.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">
                                {driver.avgMiles.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                          })}
                              </TableCell>
                              <TableCell className="text-right">
                                ${driver.avgCut.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">${driver.rpmCompany.toFixed(2)}</TableCell>
                              <TableCell className="text-right">${driver.rpmDriver.toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                ${driver.totalComm.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                              </TableCell>
                              <TableCell className="text-right">{driver.weeksCount}</TableCell>
                              <TableCell className={`text-right ${driver.currentDebt > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                {driver.currentDebt > 0 ? `$${driver.currentDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </TableCell>
                              <TableCell className={`text-right ${driver.totalDebt > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                                {driver.totalDebt > 0 ? `$${driver.totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </TableCell>
                              <TableCell>
                                <DriverNoticeDialog driverName={driver.name} initialNotice={driverTiers[driver.name]?.notice || ""} onSave={handleNoticeSave} />
                              </TableCell>
                            </TableRow>;
                    })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hidden: Driver Performance tab - keeping code for future use */}
          <TabsContent value="driver-performance" className="space-y-6 hidden">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <CardTitle>Driver Performance</CardTitle>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input placeholder="Search driver name..." value={driverSearchQuery} onChange={e => setDriverSearchQuery(e.target.value)} className="w-64" />

                    <Select value={grossTierFilter} onValueChange={setGrossTierFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="GROSS Tier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All GROSS Tiers</SelectItem>
                        <SelectItem value="Tier 1">Tier 1</SelectItem>
                        <SelectItem value="Tier 2">Tier 2</SelectItem>
                        <SelectItem value="Tier 3">Tier 3</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={safetyTierFilter} onValueChange={setSafetyTierFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Safety Tier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All Safety Tiers</SelectItem>
                        <SelectItem value="Tier 1">Tier 1</SelectItem>
                        <SelectItem value="Tier 2">Tier 2</SelectItem>
                        <SelectItem value="Tier 3">Tier 3</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={managementTierFilter} onValueChange={setManagementTierFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Management Tier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All Management Tiers</SelectItem>
                        <SelectItem value="Tier 1">Tier 1</SelectItem>
                        <SelectItem value="Tier 2">Tier 2</SelectItem>
                        <SelectItem value="Tier 3">Tier 3</SelectItem>
                      </SelectContent>
                    </Select>

                    {(driverSearchQuery || grossTierFilter !== "all" || safetyTierFilter !== "all" || managementTierFilter !== "all") && <Button variant="outline" size="sm" onClick={() => {
                    setDriverSearchQuery("");
                    setGrossTierFilter("all");
                    setSafetyTierFilter("all");
                    setManagementTierFilter("all");
                  }}>
                        Clear Filters
                      </Button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[12%]">Driver Name</TableHead>
                      <TableHead className="text-right w-[10%]">Total Driver Rate</TableHead>
                      <TableHead className="text-right w-[8%]">Total Miles</TableHead>
                      <TableHead className="text-right w-[8%]">Rate/Mile</TableHead>
                      <TableHead className="w-[8%]">GROSS Tier</TableHead>
                      <TableHead className="w-[10%]">Safety Tier</TableHead>
                      <TableHead className="w-[12%]">Management Tier</TableHead>
                      <TableHead className="w-[32%]">Notice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverStats.length === 0 ? <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow> : driverStats.map((stat, index) => <TableRow key={stat.name} className={index === driverStats.length - 1 ? "border-b" : ""}>
                          <TableCell className="font-medium">{stat.name}</TableCell>
                          <TableCell className="text-right">
                            $
                            {stat.totalDriverRate.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                          </TableCell>
                          <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={`${getTierColor(stat.grossTier)}`}>{stat.grossTier}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select value={stat.safetyTier} onValueChange={value => handleTierChange(stat.name, "safetyTier", value)}>
                              <SelectTrigger className={`w-[90px] h-6 px-2 py-0 text-xs font-medium border-0 rounded-full ${getTierColor(stat.safetyTier)}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="Tier 1">Tier 1</SelectItem>
                                <SelectItem value="Tier 2">Tier 2</SelectItem>
                                <SelectItem value="Tier 3">Tier 3</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={stat.managementTier} onValueChange={value => handleTierChange(stat.name, "managementTier", value)}>
                              <SelectTrigger className={`w-[90px] h-6 px-2 py-0 text-xs font-medium border-0 rounded-full ${getTierColor(stat.managementTier)}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="Tier 1">Tier 1</SelectItem>
                                <SelectItem value="Tier 2">Tier 2</SelectItem>
                                <SelectItem value="Tier 3">Tier 3</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <DriverNoticeDialog driverName={stat.name} initialNotice={stat.notice} onSave={handleNoticeSave} />
                          </TableCell>
                        </TableRow>)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="loads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Loads Booked Today (Rate ≤ $1.70/mile)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Load #</TableHead>
                      <TableHead>Broker load#</TableHead>
                      <TableHead>Pickup Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="text-right">Freight Amount</TableHead>
                      <TableHead className="text-right">Miles</TableHead>
                      <TableHead className="text-right">Rate/Mile</TableHead>
                      <TableHead>Booked By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qualifyingLoads.length === 0 ? <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No qualifying loads booked today
                        </TableCell>
                      </TableRow> : qualifyingLoads.map(order => {
                    const ratePerMile = order.mileage && order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                    const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                    const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                    return <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToEditOrder(order.id)}>
                            <TableCell className="font-medium">{formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}</TableCell>
                            <TableCell>{order.brokerLoadNumber}</TableCell>
                            <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                            <TableCell>
                              {pickupLocation} → {deliveryLocation}
                            </TableCell>
                            <TableCell className="text-right">
                              $
                              {order.totalFreightAmountNoLumper.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                            </TableCell>
                            <TableCell className="text-right">
                              {order.mileage != null ? order.mileage.toLocaleString() : "0"}
                            </TableCell>
                            <TableCell className="text-right">${ratePerMile.toFixed(2)}</TableCell>
                            <TableCell>{order.bookedBy}</TableCell>
                          </TableRow>;
                  })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {hasRole("admin") && <Card>
                <CardHeader>
                  <CardTitle>Loads Booked This Week (Rate ≥ $4.00/mile)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load #</TableHead>
                        <TableHead>Broker load#</TableHead>
                        <TableHead>Pickup Date</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead className="text-right">Freight Amount</TableHead>
                        <TableHead className="text-right">Miles</TableHead>
                        <TableHead className="text-right">Rate/Mile</TableHead>
                        <TableHead>Booked By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {highRateLoads.length === 0 ? <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No qualifying loads booked this week
                          </TableCell>
                        </TableRow> : highRateLoads.map(order => {
                    const ratePerMile = order.mileage && order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                    const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                    const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                    return <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToEditOrder(order.id)}>
                              <TableCell className="font-medium">{formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}</TableCell>
                              <TableCell>{order.brokerLoadNumber}</TableCell>
                              <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                              <TableCell>
                                {pickupLocation} → {deliveryLocation}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {order.totalFreightAmountNoLumper.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                              </TableCell>
                              <TableCell className="text-right">
                                {order.mileage != null ? order.mileage.toLocaleString() : "0"}
                              </TableCell>
                              <TableCell className="text-right">${ratePerMile.toFixed(2)}</TableCell>
                              <TableCell>{order.bookedBy}</TableCell>
                            </TableRow>;
                  })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {hasRole("admin") && <Card>
                <CardHeader>
                  <CardTitle>50%+ Cut Loads This Week ({highCutLoads.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load #</TableHead>
                        <TableHead>Broker load#</TableHead>
                        <TableHead>Pickup Date</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead className="text-right">Freight Amount</TableHead>
                        <TableHead className="text-right">Driver Pay</TableHead>
                        <TableHead className="text-right">Cut</TableHead>
                        <TableHead className="text-right">Cut %</TableHead>
                        <TableHead>Booked By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {highCutLoads.length === 0 ? <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No loads with 50%+ cut found this week
                          </TableCell>
                        </TableRow> : highCutLoads.map(order => {
                    const freightAmount = Number(order.totalFreightAmountNoLumper) || 0;
                    const driverPay = Number(order.totalDriverPay) || 0;
                    const cut = freightAmount - driverPay;
                    const cutPercent = freightAmount > 0 ? cut / freightAmount * 100 : 0;
                    const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                    const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                    return <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToEditOrder(order.id)}>
                              <TableCell className="font-medium">{formatInternalLoadNumber(order.internalLoadNumber, order.companyName)}</TableCell>
                              <TableCell>{order.brokerLoadNumber}</TableCell>
                              <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                              <TableCell>
                                {pickupLocation} → {deliveryLocation}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {freightAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {driverPay.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                $
                                {cut.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {cutPercent.toFixed(1)}%
                              </TableCell>
                              <TableCell>{order.bookedBy}</TableCell>
                            </TableRow>;
                  })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}
          </TabsContent>

          {(canViewSalaries || isDispatchOnly) && <TabsContent value="salaries" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <CardTitle>{isDispatchOnly ? "My Salary" : "Salaries"}</CardTitle>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center w-full sm:w-auto">
                      <Select value={selectedMonth} onValueChange={handleMonthChange}>
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue placeholder="All time monthly">
                            {selectedMonth === "all" ? "All time monthly" : monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All time monthly</SelectItem>
                          {monthOptions.map(month => <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>)}
                        </SelectContent>
                      </Select>
                      {/* Hide Bonuses button for dispatch-only users */}
                      {!isDispatchOnly && <Button variant="outline" size="sm" onClick={() => setIsBonusesDialogOpen(true)}>
                          Bonuses
                        </Button>}
                    </div>

                    {/* Office Filters - Only for Admin/Manager/Chicago Management, hidden for dispatch-only */}
                    {!isDispatchOnly && (hasRole("admin") || hasRole("manager") || hasRole("chicago_management")) && <div className="flex flex-wrap gap-2 items-center w-full">
                        <span className="text-sm font-medium text-muted-foreground">Office:</span>
                        {Array.from(new Set(Object.values(dispatcherProfiles).map(p => p.office).filter(Boolean))).map(office => <Button key={office} variant={selectedOffices.includes(office as string) ? "default" : "outline"} size="sm" onClick={() => {
                    setSelectedOffices(prev => prev.includes(office as string) ? prev.filter(o => o !== office) : [...prev, office as string]);
                  }}>
                            {office}
                          </Button>)}
                        {selectedOffices.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedOffices([])}>
                            Clear Offices
                          </Button>}
                      </div>}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {/* Hide selection column for dispatch-only users */}
                          {!isDispatchOnly && <TableHead className="w-[50px]">
                              {salarySelectionMode ? <Checkbox checked={dispatcherStats.length > 0 && selectedDispatcherIds.size === dispatcherStats.filter(s => s.userId).length} onCheckedChange={() => toggleSelectAllDispatchers(dispatcherStats.filter(s => s.userId).map(s => s.userId!))} /> : <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSalarySelectionMode(true)} title="Enable selection mode" disabled={!selectedMonth || selectedMonth === "all"}>
                                  <CheckCircle className="h-4 w-4" />
                                </Button>}
                            </TableHead>}
                          <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSalarySort("name")}>
                            Dispatcher {salarySortBy === "name" && (salarySortDir === "asc" ? "↑" : "↓")}
                          </TableHead>
                          <TableHead className="text-right">Total Freight</TableHead>
                          <TableHead className="text-right">Total Comm.</TableHead>
                          <TableHead className="text-right">Extra</TableHead>
                        {!isDispatchOnly && <TableHead className="text-right">Days Off</TableHead>}
                        {!isDispatchOnly && profile?.office !== "BEOGRAD" && <TableHead className="text-right">Food</TableHead>}
                        <TableHead className="text-right">Additionals</TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSalarySort("salary")}>
                            Salary {salarySortBy === "salary" && (salarySortDir === "desc" ? "↓" : "↑")}
                          </TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                      </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                      // Build calculated salaries map for the bulk action
                      const calculatedSalaries: Record<string, number> = {};
                      return sortedDispatcherStatsForSalaries.map((stat, index) => {
                        // Get Extra Days from afterhours_schedule and Lost Days from dispatcher_off_duty_days or salary payment override
                        const extraDays = stat.userId ? (extraDaysByUser[stat.userId] || 0) : (extraDaysByUser[stat.name] || 0);
                        const paymentRecord = stat.userId ? salaryPayments[stat.userId] : null;
                        // For lost days: UUID lookup first, then name lookup (for deleted users)
                        const lostDays = stat.userId ? (lostDaysByUser[stat.userId] || 0) : (lostDaysByUser[stat.name] || 0);

                        // Calculate days in the selected month
                        let daysInMonth = 30; // calendar days (used for monthly salary weighting)
                        let workDaysInMonth = 22; // Mon-Fri minus holidays (used for extra-day pay)

                        if (selectedMonth && selectedMonth !== "all" && selectedMonth.includes("-")) {
                          const parts = selectedMonth.split("-");
                          if (parts.length === 2) {
                            const year = parseInt(parts[0], 10);
                            const month = parseInt(parts[1], 10); // 1-12
                            if (!isNaN(year) && !isNaN(month)) {
                              daysInMonth = new Date(year, month, 0).getDate();
                              workDaysInMonth = getWorkDaysInMonth(year, month - 1);
                            }
                          }
                        }

                        // Ensure daysInMonth is valid
                        if (isNaN(daysInMonth) || daysInMonth <= 0) {
                          daysInMonth = 30;
                        }

                        // Salary display: Total Freight * 0.01 + Total Comm. * 0.05 (simple base rate)
                        const baseRate = stat.totalFreight * 0.01 + stat.cut * 0.05;
                        
                        // Carry-over adjustment: if prev month's salary column changed after being paid
                        // calculated_salary = base rate stored at time of payment
                        // If current recalculation of prev month would differ, carry the difference
                        const prevPayment = stat.userId ? prevMonthPayments[stat.userId] : null;
                        const prevMonthAdjustment = prevPayment ? (prevPayment.calculated_salary - prevPayment.paid_amount) : 0;
                        // Note: prevMonthAdjustment is negative if overpaid, positive if underpaid
                        // But we want salary-based: difference between what salary WAS and what it IS now
                        // Since we can't recalculate prev month, we use: stored calculated_salary as the frozen salary value
                        // The adjustment = 0 unless paid_amount differs from calculated_salary (meaning extras/deductions were applied)
                        // Per user request: adjustment based on salary column changes, not paid changes
                        // So we don't carry over here - the salary column is pure baseRate
                        
                        const displaySalary = baseRate;

                        // Get dispatcher bonus for this month
                        const bonusInfo = stat.userId ? dispatcherBonuses[stat.userId] : null;
                        const bonusAmount = bonusInfo?.amount ?? 0;
                        const bonusRank = bonusInfo?.rank ?? 0;

                        // Calculate per-day rate and components for full total
                        const perDayRate = workDaysInMonth > 0 ? baseRate / workDaysInMonth : 0;
                        const extraDaysAmount = extraDays * perDayRate;
                        const daysOffDeduction = lostDays * perDayRate;
                        const foodAllowance = stat.office === "BEOGRAD" ? 0 : 70;

                        // Store base rate for carry-over calculations
                        if (stat.userId) {
                          calculatedSalaries[stat.userId] = baseRate;
                        }

                        // Get payment info
                        const payment = stat.userId ? salaryPayments[stat.userId] : null;
                        const isPaid = payment && payment.paid_at;

                        // Helper to render rank icon
                        const renderRankIcon = () => {
                          if (!bonusRank) return null;
                          const iconClass = "h-5 w-5";
                          switch (bonusRank) {
                            case 1:
                              return <img src={crownImage} alt="1st place" className="h-5 w-5" />;
                            case 2:
                              return <Medal className={`${iconClass} text-gray-400`} />;
                            case 3:
                              return <Award className={`${iconClass} text-amber-600`} />;
                            case 4:
                              return <Trophy className={`${iconClass} text-blue-500`} />;
                            case 5:
                              return <Star className={`${iconClass} text-purple-500`} />;
                            default:
                              return null;
                          }
                        };
                        return <TableRow key={stat.name} className={index === dispatcherStats.length - 1 ? "border-b" : ""}>
                                {/* Hide selection checkbox for dispatch-only users */}
                                {!isDispatchOnly && <TableCell className="w-[50px]">
                                    {salarySelectionMode && stat.userId ? <Checkbox checked={selectedDispatcherIds.has(stat.userId)} onCheckedChange={() => toggleDispatcherSelection(stat.userId!)} /> : null}
                                  </TableCell>}
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {renderRankIcon()}
                                    {stat.name}
                                    {/* Hide download button for dispatch-only users, but show send/preview for all */}
                                    {!isDispatchOnly && selectedMonth && selectedMonth !== "all" && <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => {
                                      e.stopPropagation();

                                      // Get pay period label from selectedMonth
                                      const monthParts = selectedMonth.split("-");
                                      const year = parseInt(monthParts[0], 10);
                                      const monthNum = parseInt(monthParts[1], 10) - 1;
                                      const monthDate = new Date(year, monthNum, 1);
                                      const payPeriod = format(monthDate, "MMMM, yyyy");

                                      // Get dates for extra/lost days - only show 2nd+ dates (skip first which is regular)
                                      const allExtraDayDates = extraDayDatesByUser[stat.userId || stat.name] || [];
                                      const extraDayDates = allExtraDayDates.slice(1); // Skip 1st date (regular day)
                                      const lostDayDates = stat.userId ? (lostDayDatesByUser[stat.userId] || []) : (lostDayDatesByUser[stat.name] || []);

                                      // Calculate extra days amount: per-workday rate * actual extra days count
                                      // Example (Dec 2025): baseRate $2620.45 / 22 workdays = $119.11 for 1 extra day
                                      const actualExtraDaysCount = extraDayDates.length;
                                      const perDayRate = (stat.totalFreight * 0.01 + stat.cut * 0.05) / workDaysInMonth;
                                      const extraDaysAmount = actualExtraDaysCount > 0 ? perDayRate * actualExtraDaysCount : 0;

                                      // Determine food allowance based on office
                                      const isBeograd = stat.office === "BEOGRAD";
                                      const foodAllowanceAmount = isBeograd ? 0 : 70;
                                       downloadPayrollDoc({
                                        employeeName: stat.name,
                                        payPeriod,
                                        salary1Percent: stat.totalFreight * 0.01,
                                        bonus5Percent: stat.cut * 0.05,
                                        foodAllowance: foodAllowanceAmount,
                                        extraDays,
                                        lostDays,
                                        extraDayDates,
                                        lostDayDates,
                                        extraDaysAmount: Math.max(0, extraDaysAmount),
                                        dispatcherBonus: bonusAmount,
                                        perDayRate,
                                        office: stat.office,
                                      }, `Payroll_${stat.name.replace(/\s+/g, "_")}_${selectedMonth}.docx`);
                                      toast.success(`Payroll document generated for ${stat.name}`);
                                    }}>
                                              <FileDown className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Download payroll statement</p>
                                          </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => {
                                      e.stopPropagation();

                                      // Get pay period label from selectedMonth
                                      const monthParts = selectedMonth.split("-");
                                      const year = parseInt(monthParts[0], 10);
                                      const monthNum = parseInt(monthParts[1], 10) - 1;
                                      const monthDate = new Date(year, monthNum, 1);
                                      const payPeriod = format(monthDate, "MMMM, yyyy");

                                      // Get dates for extra/lost days
                                      const allExtraDayDates = extraDayDatesByUser[stat.userId || stat.name] || [];
                                      const extraDayDatesForDoc = allExtraDayDates.slice(1);
                                      const lostDayDatesForDoc = stat.userId ? (lostDayDatesByUser[stat.userId] || []) : (lostDayDatesByUser[stat.name] || []);

                                      // Calculate extra days amount
                                      const actualExtraDaysCount = extraDayDatesForDoc.length;
                                      const perDayRate = (stat.totalFreight * 0.01 + stat.cut * 0.05) / workDaysInMonth;
                                      const extraDaysAmountForDoc = actualExtraDaysCount > 0 ? perDayRate * actualExtraDaysCount : 0;

                                      // Get dispatcher email
                                      const dispatcherProfile = dispatcherProfiles[stat.name] || dispatcherProfiles[stat.userId || ""];
                                      const recipientEmail = dispatcherProfile?.email || "unknown@email.com";

                                      // Determine food allowance based on office
                                      const isBeograd = stat.office === "BEOGRAD";
                                      const foodAllowanceForPreview = isBeograd ? 0 : 70;

                                      // Check if this is a deleted user
                                      const isDeletedUserFlag = dispatcherProfile?.email?.includes("@deleted.user") || false;
                                      
                                      // Calculate future month data for deleted users
                                      const nextMonthDate = new Date(year, monthNum + 1, 1);
                                      const futureMonthLabel = format(nextMonthDate, "MMMM");
                                      
                                      // For deleted users, calculate next month's values from orders
                                      // Find the next month's date range
                                      const nextMonthStart = new Date(year, monthNum + 1, 1);
                                      const nextMonthEnd = new Date(year, monthNum + 2, 0);
                                      
                                      // Calculate next month freight/cut for this dispatcher
                                      let nextMonthFreight = 0;
                                      let nextMonthDriverRate = 0;
                                      if (isDeletedUserFlag && orders) {
                                        orders.forEach(order => {
                                          const orderDispatcher = order.bookedBy || "";
                                          if (orderDispatcher !== stat.name) return;
                                          
                                          const deliveryDateStr = order.deliveryDate || order.deliveryDatetime;
                                          if (!deliveryDateStr) return;
                                          
                                          const dateStr = String(deliveryDateStr).split("T")[0].split(" ")[0];
                                          const [oYear, oMonth, oDay] = dateStr.split("-").map(Number);
                                          if (!oYear || !oMonth || !oDay) return;
                                          
                                          const deliveryDate = new Date(oYear, oMonth - 1, oDay);
                                          if (deliveryDate >= nextMonthStart && deliveryDate <= nextMonthEnd) {
                                            nextMonthFreight += Number(order.totalFreightAmountNoLumper) || 0;
                                            nextMonthDriverRate += getEffectiveDriverPay(order);
                                          }
                                        });
                                      }
                                      const nextMonthCut = nextMonthFreight - nextMonthDriverRate;

                                      // Open preview dialog with all the data
                                      setPayrollPreviewData({
                                        dispatcherName: stat.name,
                                        dispatcherUserId: stat.userId || "",
                                        recipientEmail,
                                        payPeriod,
                                        salary1Percent: stat.totalFreight * 0.01,
                                        bonus5Percent: stat.cut * 0.05,
                                        foodAllowance: foodAllowanceForPreview,
                                        extraDays,
                                        lostDays,
                                        extraDayDates: extraDayDatesForDoc,
                                        lostDayDates: lostDayDatesForDoc,
                                        extraDaysAmount: Math.max(0, extraDaysAmountForDoc),
                                        dispatcherBonus: bonusAmount,
                                        perDayRate,
                                         isDeletedUser: isDeletedUserFlag,
                                        futureMonthLabel: isDeletedUserFlag ? futureMonthLabel : undefined,
                                        futureSalary1Percent: isDeletedUserFlag ? nextMonthFreight * 0.01 : undefined,
                                        futureBonus5Percent: isDeletedUserFlag ? nextMonthCut * 0.05 : undefined,
                                        office: stat.office,
                                      });
                                      setPayrollPreviewOpen(true);
                                    }}>
                                              <Send className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Send payroll statement via email</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>}
                                    {/* Show preview-only payroll for dispatch-only users */}
                                    {isDispatchOnly && selectedMonth && selectedMonth !== "all" && <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => {
                                      e.stopPropagation();

                                      // Get pay period label from selectedMonth
                                      const monthParts = selectedMonth.split("-");
                                      const year = parseInt(monthParts[0], 10);
                                      const monthNum = parseInt(monthParts[1], 10) - 1;
                                      const monthDate = new Date(year, monthNum, 1);
                                      const payPeriod = format(monthDate, "MMMM, yyyy");

                                      // Get dates for extra/lost days
                                      const allExtraDayDates = extraDayDatesByUser[stat.userId || stat.name] || [];
                                      const extraDayDatesForDoc = allExtraDayDates.slice(1);
                                      const lostDayDatesForDoc = stat.userId ? (lostDayDatesByUser[stat.userId] || []) : (lostDayDatesByUser[stat.name] || []);

                                      // Calculate extra days amount
                                      const actualExtraDaysCount = extraDayDatesForDoc.length;
                                      const perDayRate = (stat.totalFreight * 0.01 + stat.cut * 0.05) / workDaysInMonth;
                                      const extraDaysAmountForDoc = actualExtraDaysCount > 0 ? perDayRate * actualExtraDaysCount : 0;

                                      // Get dispatcher email
                                      const dispatcherProfile = dispatcherProfiles[stat.name] || dispatcherProfiles[stat.userId || ""];
                                      const recipientEmail = dispatcherProfile?.email || "unknown@email.com";

                                      // Determine food allowance based on office
                                      const isBeograd = stat.office === "BEOGRAD";
                                      const foodAllowanceForPreview = isBeograd ? 0 : 70;

                                      // Check if this is a deleted user
                                      const isDeletedUserFlag = dispatcherProfile?.email?.includes("@deleted.user") || false;
                                      
                                      // Calculate future month data for deleted users
                                      const nextMonthDate = new Date(year, monthNum + 1, 1);
                                      const futureMonthLabel = format(nextMonthDate, "MMMM");
                                      
                                      // For deleted users, calculate next month's values from orders
                                      // Find the next month's date range
                                      const nextMonthStart = new Date(year, monthNum + 1, 1);
                                      const nextMonthEnd = new Date(year, monthNum + 2, 0);
                                      
                                      // Calculate next month freight/cut for this dispatcher
                                      let nextMonthFreight = 0;
                                      let nextMonthDriverRate = 0;
                                      if (isDeletedUserFlag && orders) {
                                        orders.forEach(order => {
                                          const orderDispatcher = order.bookedBy || "";
                                          if (orderDispatcher !== stat.name) return;
                                          
                                          const deliveryDateStr = order.deliveryDate || order.deliveryDatetime;
                                          if (!deliveryDateStr) return;
                                          
                                          const dateStr = String(deliveryDateStr).split("T")[0].split(" ")[0];
                                          const [oYear, oMonth, oDay] = dateStr.split("-").map(Number);
                                          if (!oYear || !oMonth || !oDay) return;
                                          
                                          const deliveryDate = new Date(oYear, oMonth - 1, oDay);
                                          if (deliveryDate >= nextMonthStart && deliveryDate <= nextMonthEnd) {
                                            nextMonthFreight += Number(order.totalFreightAmountNoLumper) || 0;
                                            nextMonthDriverRate += getEffectiveDriverPay(order);
                                          }
                                        });
                                      }
                                      const nextMonthCut = nextMonthFreight - nextMonthDriverRate;

                                      // Open preview dialog with all the data
                                      setPayrollPreviewData({
                                        dispatcherName: stat.name,
                                        dispatcherUserId: stat.userId || "",
                                        recipientEmail,
                                        payPeriod,
                                        salary1Percent: stat.totalFreight * 0.01,
                                        bonus5Percent: stat.cut * 0.05,
                                        foodAllowance: foodAllowanceForPreview,
                                        extraDays,
                                        lostDays,
                                        extraDayDates: extraDayDatesForDoc,
                                        lostDayDates: lostDayDatesForDoc,
                                        extraDaysAmount: Math.max(0, extraDaysAmountForDoc),
                                        dispatcherBonus: bonusAmount,
                                        perDayRate,
                                         isDeletedUser: isDeletedUserFlag,
                                        futureMonthLabel: isDeletedUserFlag ? futureMonthLabel : undefined,
                                        futureSalary1Percent: isDeletedUserFlag ? nextMonthFreight * 0.01 : undefined,
                                        futureBonus5Percent: isDeletedUserFlag ? nextMonthCut * 0.05 : undefined,
                                        office: stat.office,
                                      });
                                      setPayrollPreviewOpen(true);
                                    }}>
                                              <Send className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>View payroll statement</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  $
                                  {stat.totalFreight.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                                </TableCell>
                                <TableCell className="text-right">
                                  $
                                  {stat.cut.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                                </TableCell>
                                <TableCell className="text-right text-green-600">
                                  {!isDispatchOnly && selectedMonth && selectedMonth !== "all" ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="cursor-pointer hover:underline font-medium">
                                          {extraDays > 0 ? `+${extraDays}` : extraDays}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-56 p-3" align="end">
                                        <div className="space-y-2">
                                          <p className="text-xs font-medium text-muted-foreground">Extra Days</p>
                                          {(() => {
                                            const extraKey = stat.userId || stat.name;
                                            const allDates = extraDayDatesByUser[extraKey] || [];
                                            const allRaw = extraDayRawDatesByUser[extraKey] || [];
                                            const extraDates = allDates.slice(1);
                                            const extraRaw = allRaw.slice(1);
                                            return (
                                              <>
                                                {extraDates.length === 0 && <p className="text-xs text-muted-foreground">No extra days</p>}
                                                {extraDates.map((d, i) => (
                                                  <div key={i} className="flex items-center justify-between">
                                                    <span className="text-sm">{d}</span>
                                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={async () => {
                                                      const rawDate = extraRaw[i];
                                                      if (!rawDate) return;
                                                      if (stat.userId) {
                                                        await supabase.from("afterhours_schedule").delete().eq("user_id", stat.userId).eq("scheduled_date", rawDate);
                                                      } else {
                                                        await supabase.from("afterhours_schedule").delete().eq("dispatcher_name", stat.name).is("user_id", null).eq("scheduled_date", rawDate);
                                                      }
                                                      const extraKey = stat.userId || stat.name;
                                                      // Re-fetch
                                                      setExtraDaysByUser(prev => ({ ...prev, [extraKey]: Math.max(0, (prev[extraKey] || 0) - 1) }));
                                                      setExtraDayDatesByUser(prev => {
                                                        const updated = [...(prev[extraKey] || [])];
                                                        // Remove the corresponding date from allDates (index + 1 because of slice)
                                                        updated.splice(i + 1, 1);
                                                        return { ...prev, [extraKey]: updated };
                                                      });
                                                      setExtraDayRawDatesByUser(prev => {
                                                        const updated = [...(prev[extraKey] || [])];
                                                        updated.splice(i + 1, 1);
                                                        return { ...prev, [extraKey]: updated };
                                                      });
                                                    }}>
                                                      <XCircle className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </div>
                                                ))}
                                                <div className="border-t pt-2 mt-2">
                                                  <p className="text-xs font-medium text-muted-foreground mb-1">Add date</p>
                                                  <Input
                                                    type="date"
                                                    className="h-7 text-xs"
                                                    onChange={async (e) => {
                                                      const val = e.target.value;
                                                      if (!val) return;
                                                      // Check if already exists
                                                      const existing = extraRaw.includes(val) || (allRaw.length > 0 && allRaw[0] === val);
                                                      if (existing) { toast.error("Date already added"); return; }
                                                      // Insert: use user_id for active users, dispatcher_name for deleted users
                                                      if (stat.userId) {
                                                        await supabase.from("afterhours_schedule").insert({ user_id: stat.userId, scheduled_date: val, dispatcher_name: stat.name });
                                                      } else {
                                                        await supabase.from("afterhours_schedule").insert({ scheduled_date: val, dispatcher_name: stat.name });
                                                      }
                                                      // Optimistic update - refetch to recalculate properly
                                                      const mp = selectedMonth.split("-");
                                                      const y = parseInt(mp[0]); const m = parseInt(mp[1]) - 1;
                                                      const fd = format(new Date(y, m, 1), "yyyy-MM-dd");
                                                      const ld = format(new Date(y, m + 1, 0), "yyyy-MM-dd");
                                                      let freshData: any[] | null = null;
                                                      if (stat.userId) {
                                                        const res = await supabase.from("afterhours_schedule").select("user_id, scheduled_date, dispatcher_name").gte("scheduled_date", fd).lte("scheduled_date", ld).eq("user_id", stat.userId);
                                                        freshData = res.data;
                                                      } else {
                                                        const res = await supabase.from("afterhours_schedule").select("user_id, scheduled_date, dispatcher_name").gte("scheduled_date", fd).lte("scheduled_date", ld).eq("dispatcher_name", stat.name).is("user_id", null);
                                                        freshData = res.data;
                                                      }
                                                      if (freshData) {
                                                        // Recalculate for this user
                                                        let wkendCount = 0, wkdayCount = 0;
                                                        const wkendDates: string[] = [], wkdayDates: string[] = [], wkendRaw: string[] = [], wkdayRaw: string[] = [];
                                                        freshData.forEach((r: any) => {
                                                          const sd = new Date(r.scheduled_date + "T12:00:00");
                                                          const dow = sd.getDay();
                                                          const isWe = dow === 0 || dow === 6;
                                                          const isMov = r.scheduled_date === "2026-01-10" && stat.office === "KRAGUJEVAC";
                                                          const ds = `${sd.getMonth()+1}/${sd.getDate()}`;
                                                          if (isWe && !isMov) { wkendCount++; wkendDates.push(ds); wkendRaw.push(r.scheduled_date); }
                                                          else { wkdayCount++; wkdayDates.push(ds); wkdayRaw.push(r.scheduled_date); }
                                                        });
                                                        const sortFn = (a: string, b: string) => { const [am,ad]=a.split("/").map(Number); const [bm,bd]=b.split("/").map(Number); return am!==bm?am-bm:ad-bd; };
                                                        wkendDates.sort(sortFn); wkdayDates.sort(sortFn); wkendRaw.sort(); wkdayRaw.sort();
                                                        const extra = Math.max(0, wkendCount - 1) + wkdayCount;
                                                        let dates: string[], raw: string[];
                                                        if (wkendDates.length > 0) {
                                                          dates = [wkendDates[0], ...[...wkdayDates, ...wkendDates.slice(1)].sort(sortFn)];
                                                          raw = [wkendRaw[0], ...[...wkdayRaw, ...wkendRaw.slice(1)].sort()];
                                                        } else { dates = wkdayDates; raw = wkdayRaw; }
                                                        setExtraDaysByUser(prev => ({ ...prev, [extraKey]: extra }));
                                                        setExtraDayDatesByUser(prev => ({ ...prev, [extraKey]: dates }));
                                                        setExtraDayRawDatesByUser(prev => ({ ...prev, [extraKey]: raw }));
                                                      }
                                                      e.target.value = "";
                                                    }}
                                                  />
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    extraDays > 0 ? `+${extraDays}` : extraDays
                                  )}
                                </TableCell>
                                {!isDispatchOnly && <TableCell className="text-right text-red-600">
                                  {selectedMonth && selectedMonth !== "all" ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="cursor-pointer hover:underline font-medium">
                                          {lostDays > 0 ? `-${lostDays}` : lostDays}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-56 p-3" align="end">
                                        <div className="space-y-2">
                                          <p className="text-xs font-medium text-muted-foreground">Days Off</p>
                                          {(() => {
                                            const lookupKey = stat.userId || stat.name;
                                            const dates = lostDayDatesByUser[lookupKey] || [];
                                            const rawDates = lostDayRawDatesByUser[lookupKey] || [];
                                            return (
                                              <>
                                                {dates.length === 0 && <p className="text-xs text-muted-foreground">No days off</p>}
                                                {dates.map((d, i) => (
                                                  <div key={i} className="flex items-center justify-between">
                                                    <span className="text-sm">{d}</span>
                                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={async () => {
                                                      const rawDate = rawDates[i];
                                                      if (!rawDate) return;
                                                      const dispatcherId = stat.userId || lookupKey;
                                                      await supabase.from("dispatcher_off_duty_days").delete().eq("dispatcher_id", dispatcherId).eq("off_duty_date", rawDate);
                                                      // Optimistic update
                                                      setLostDaysByUser(prev => ({ ...prev, [lookupKey]: Math.max(0, (prev[lookupKey] || 0) - 1) }));
                                                      setLostDayDatesByUser(prev => {
                                                        const updated = [...(prev[lookupKey] || [])];
                                                        updated.splice(i, 1);
                                                        return { ...prev, [lookupKey]: updated };
                                                      });
                                                      setLostDayRawDatesByUser(prev => {
                                                        const updated = [...(prev[lookupKey] || [])];
                                                        updated.splice(i, 1);
                                                        return { ...prev, [lookupKey]: updated };
                                                      });
                                                    }}>
                                                      <XCircle className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </div>
                                                ))}
                                                {(
                                                  <div className="border-t pt-2 mt-2">
                                                    <p className="text-xs font-medium text-muted-foreground mb-1">Add date</p>
                                                    <Input
                                                      type="date"
                                                      className="h-7 text-xs"
                                                      onChange={async (e) => {
                                                        const val = e.target.value;
                                                        if (!val) return;
                                                        if (rawDates.includes(val)) { toast.error("Date already added"); return; }
                                                        // Get dispatcher name from profiles
                                                        const dispName = stat.name;
                                                        const dispatcherId = stat.userId || stat.name;
                                                        await supabase.from("dispatcher_off_duty_days").insert({
                                                          dispatcher_id: dispatcherId,
                                                          off_duty_date: val,
                                                          dispatcher_name: dispName,
                                                        });
                                                        // Optimistic update
                                                        const dateObj = new Date(val + "T12:00:00");
                                                        const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
                                                        const sortFn = (a: string, b: string) => { const [am,ad]=a.split("/").map(Number); const [bm,bd]=b.split("/").map(Number); return am!==bm?am-bm:ad-bd; };
                                                        setLostDaysByUser(prev => ({ ...prev, [lookupKey]: (prev[lookupKey] || 0) + 1 }));
                                                        setLostDayDatesByUser(prev => {
                                                          const updated = [...(prev[lookupKey] || []), dateStr].sort(sortFn);
                                                          return { ...prev, [lookupKey]: updated };
                                                        });
                                                        setLostDayRawDatesByUser(prev => {
                                                          const updated = [...(prev[lookupKey] || []), val].sort();
                                                          return { ...prev, [lookupKey]: updated };
                                                        });
                                                        e.target.value = "";
                                                      }}
                                                    />
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    lostDays > 0 ? `-${lostDays}` : lostDays
                                  )}
                                </TableCell>}
                                {!isDispatchOnly && profile?.office !== "BEOGRAD" && <TableCell className="text-right">
                                  {stat.office === "BEOGRAD" ? "$0" : "$70"}
                                </TableCell>}
                                <TableCell className="text-right">
                                  {(() => {
                                    const adj = payment?.additionals as any[] | null;
                                    if (!adj || adj.length === 0) return <span className="text-muted-foreground">—</span>;
                                    const total = adj.reduce((sum: number, a: any) => sum + (a.type === "addition" ? a.amount : -a.amount), 0);
                                    return (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className={total >= 0 ? "text-green-600 cursor-help" : "text-red-600 cursor-help"}>
                                              {total >= 0 ? "+" : ""}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {adj.map((a: any, i: number) => (
                                              <div key={i} className="text-xs">
                                                {a.type === "addition" ? "+" : "-"}${a.amount.toFixed(2)} — {a.reason}
                                              </div>
                                            ))}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span>
                                    $
                                    {displaySalary.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                                  </span>
                                </TableCell>
                                {/* Paid column - read-only for dispatchers */}
                                <TableCell className="text-right">
                                {isPaid ? <span className="text-green-600 font-medium">
                                      $
                                      {payment.paid_amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                                    </span> : !stat.userId ? <span className="text-green-600 font-medium">
                                      ${(baseRate + foodAllowance + extraDaysAmount - daysOffDeduction + bonusAmount).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                                    </span> : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              </TableRow>;
                      });
                    })()}
                        {/* Totals Row for All Time view */}
                        {selectedMonth === "all" && <TableRow className="bg-muted/50 font-medium border-t-2">
                            {/* Hide empty cell for dispatch-only users */}
                            {!isDispatchOnly && <TableCell></TableCell>}
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">
                              $
                              {dispatcherStats.reduce((sum, s) => sum + s.totalFreight, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              $
                              {dispatcherStats.reduce((sum, s) => sum + s.cut, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600">
                              +
                              {dispatcherStats.reduce((sum, s) => sum + (s.userId ? extraDaysByUser[s.userId] || 0 : 0), 0)}
                            </TableCell>
                            {!isDispatchOnly && <TableCell className="text-right font-bold text-red-600">
                              -
                              {dispatcherStats.reduce((sum, s) => sum + (s.userId ? lostDaysByUser[s.userId] || 0 : 0), 0)}
                            </TableCell>}
                            {!isDispatchOnly && profile?.office !== "BEOGRAD" && <TableCell className="text-right font-bold">
                              ${dispatcherStats.reduce((sum, s) => sum + (s.office === "BEOGRAD" ? 0 : 70), 0)}
                            </TableCell>}
                            <TableCell className="text-right font-bold">—</TableCell>
                            <TableCell className="text-right font-bold">—</TableCell>
                            <TableCell className="text-right font-bold text-green-600">
                              $
                              {Object.values(salaryPayments).reduce((sum, p) => sum + (p.paid_amount || 0), 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                            </TableCell>
                          </TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Selection Summary Panel for Salaries */}
              {salarySelectionMode && <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[400px]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Selected Dispatchers</h3>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                setSalarySelectionMode(false);
                setSelectedDispatcherIds(new Set());
              }}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Count:</span>
                      <span className="font-medium">{selectedDispatcherIds.size} dispatcher(s)</span>
                    </div>

                    {(hasRole("manager") || hasRole("admin") || hasRole("accounting") || hasRole("supervisor")) && <Button className="w-full mt-3" size="sm" onClick={() => {
                // Recalculate salaries for bulk action
                // Recalculate salaries for bulk action - use full total
                const calculatedSalaries: Record<string, number> = {};
                const adjustedSalaries: Record<string, number> = {};
                
                // Calculate work days for the selected month
                let bulkWorkDays = 22;
                if (selectedMonth && selectedMonth !== "all" && selectedMonth.includes("-")) {
                  const parts = selectedMonth.split("-");
                  if (parts.length === 2) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    if (!isNaN(year) && !isNaN(month)) {
                      bulkWorkDays = getWorkDaysInMonth(year, month - 1);
                    }
                  }
                }
                
                dispatcherStats.forEach(stat => {
                  if (stat.userId) {
                    const baseRate = stat.totalFreight * 0.01 + stat.cut * 0.05;
                    const perDayRate = bulkWorkDays > 0 ? baseRate / bulkWorkDays : 0;
                    const extraDays = extraDaysByUser[stat.userId] || 0;
                    const lostDays = lostDaysByUser[stat.userId] || 0;
                    const extraDaysAmount = extraDays * perDayRate;
                    const daysOffDeduction = lostDays * perDayRate;
                    const foodAllowance = stat.office === "BEOGRAD" ? 0 : 70;
                    const bonusAmt = dispatcherBonuses[stat.userId]?.amount ?? 0;
                    const payment = salaryPayments[stat.userId];
                    const adj = payment?.additionals as any[] | null;
                    const adjustmentsTotal = adj ? adj.reduce((sum: number, a: any) => sum + (a.type === "addition" ? a.amount : -a.amount), 0) : 0;
                    
                    const fullTotal = baseRate + extraDaysAmount - daysOffDeduction + foodAllowance + bonusAmt + adjustmentsTotal;
                    calculatedSalaries[stat.userId] = baseRate; // Store base rate for salary-based carry-over
                    adjustedSalaries[stat.userId] = fullTotal; // Full total for paid_amount
                  }
                });
                markSelectedAsPaid(calculatedSalaries, adjustedSalaries);
              }} disabled={selectedDispatcherIds.size === 0 || !selectedMonth || selectedMonth === "all"}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Paid ({selectedDispatcherIds.size})
                      </Button>}
                  </div>
                </div>}
            </TabsContent>}
        </Tabs>

        {/* Bonuses Dialog */}
        <DispatcherBonusesDialog open={isBonusesDialogOpen} onOpenChange={setIsBonusesDialogOpen} dispatchers={Object.entries(dispatcherProfiles).filter(([key, profile]) => {
        // Filter to only include entries keyed by user_id (UUID format)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(key) && (profile.roles.includes("dispatch") || profile.roles.includes("supervisor"));
      }).map(([userId, profile]) => ({
        id: userId,
        full_name: Object.entries(dispatcherProfiles).find(([k, p]) => p.user_id === userId && !k.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))?.[0] || profile.email.split("@")[0],
        email: profile.email
      }))} selectedMonth={selectedMonth !== "all" ? selectedMonth : format(new Date(), "yyyy-MM")} />

        {/* Payroll Preview Dialog */}
        {payrollPreviewData && <PayrollPreviewDialog
          key={payrollPreviewData.dispatcherUserId}
          open={payrollPreviewOpen} 
          onOpenChange={setPayrollPreviewOpen} 
          dispatcherName={payrollPreviewData.dispatcherName} 
          dispatcherUserId={payrollPreviewData.dispatcherUserId} 
          recipientEmail={payrollPreviewData.recipientEmail} 
          payPeriod={payrollPreviewData.payPeriod} 
          selectedMonth={selectedMonth} 
          salary1Percent={payrollPreviewData.salary1Percent} 
          bonus5Percent={payrollPreviewData.bonus5Percent} 
          foodAllowance={payrollPreviewData.foodAllowance} 
          extraDays={payrollPreviewData.extraDays} 
          lostDays={payrollPreviewData.lostDays} 
          extraDayDates={payrollPreviewData.extraDayDates} 
          lostDayDates={payrollPreviewData.lostDayDates} 
          extraDaysAmount={payrollPreviewData.extraDaysAmount} 
          dispatcherBonus={payrollPreviewData.dispatcherBonus} 
          perDayRate={payrollPreviewData.perDayRate} 
          previewOnly={isDispatchOnly}
          isDeletedUser={payrollPreviewData.isDeletedUser}
          futureMonthLabel={payrollPreviewData.futureMonthLabel}
          futureSalary1Percent={payrollPreviewData.futureSalary1Percent}
           futureBonus5Percent={payrollPreviewData.futureBonus5Percent}
           office={payrollPreviewData.office}
           onAdjustmentsChanged={() => {
            queryClient.invalidateQueries({ queryKey: ["salary-payments", selectedMonth] });
          }}
          onEmailSent={() => {
            // Refresh salary payments data
            queryClient.invalidateQueries({
              queryKey: ["dispatcher_salary_payments"]
            });
            // Refetch salary payments for the current month
            if (selectedMonth && selectedMonth !== "all") {
              supabase.from("dispatcher_salary_payments" as any).select("*").eq("month", selectedMonth).then(({
                data
              }) => {
                if (data) {
                  const paymentsMap: Record<string, {
                    paid_amount: number;
                    paid_at: string | null;
                    additionals?: any[] | null;
                  }> = {};
                  data.forEach((payment: any) => {
                    paymentsMap[payment.user_id] = {
                      paid_amount: payment.paid_amount,
                      paid_at: payment.paid_at,
                      additionals: payment.additionals || null,
                    };
                  });
                  setSalaryPayments(paymentsMap);
                }
              });
            }
          }} 
        />}
      </div>
    </div>;
};
export default Analytics;