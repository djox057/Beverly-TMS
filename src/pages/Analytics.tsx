import { DateRange } from "react-day-picker";
import { formatDateNoTimezone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useDrivers } from "@/hooks/useDrivers";
import { useDriverPerformance } from "@/hooks/useDriverPerformance";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useDispatcherNotes } from "@/hooks/useDispatcherNotes";
import { DispatcherNoteDialog } from "@/components/DispatcherNoteDialog";
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
  const { hasRole, profile, getPrimaryRole } = useAuthContext();

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
  const [sortBy, setSortBy] = useState<"totalFreight" | "ratePerMile" | "cut" | "cutPercent">("totalFreight");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [filterType, setFilterType] = useState<"week" | "month" | "custom">("week");
  const [dispatcherProfiles, setDispatcherProfiles] = useState<
    Record<
      string,
      {
        email: string;
        office: string | null;
        roles: string[];
        user_id: string;
      }
    >
  >({});
  const [selectedDriverNotice, setSelectedDriverNotice] = useState<{
    name: string;
    notice: string;
  } | null>(null);
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>("");

  // Fetch dispatcher notes for the current date range
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : startDate;
  const { notes: dispatcherNotes } = useDispatcherNotes(startDate, endDate);

  // Create a map of dispatcher notes by dispatcher_id and date for quick lookup
  const notesByDispatcher = useMemo(() => {
    const map: Record<string, { note: string; color: "red" | "yellow" | "green"; id: string }> = {};
    dispatcherNotes.forEach((note) => {
      // For each dispatcher, use the most recent note in the date range
      const key = `${note.dispatcher_id}-${note.date}`;
      map[key] = { note: note.note, color: note.color, id: note.id };
    });
    return map;
  }, [dispatcherNotes]);
  const [grossTierFilter, setGrossTierFilter] = useState<string>("all");
  const [dispatcherTruckCounts, setDispatcherTruckCounts] = useState<
    Record<string, { totalTrucks: number; daysCount: number }>
  >({});
  const [safetyTierFilter, setSafetyTierFilter] = useState<string>("all");
  const [managementTierFilter, setManagementTierFilter] = useState<string>("all");
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [showOver100kGross, setShowOver100kGross] = useState<boolean>(false);

  // Check if user has only dispatch role (same logic as Orders page)
  const isDispatchOnly =
    hasRole("dispatch") &&
    !hasRole("afterhours") &&
    !hasRole("admin") &&
    !hasRole("manager") &&
    !hasRole("accounting") &&
    !hasRole("supervisor") &&
    !hasRole("safety");

  // Don't use database-level filtering for dispatch users - let client-side filtering handle both full_name and user_id formats
  const { data: orders, isLoading, error } = useOrders();
  const { data: companies } = useCompanies();
  const { data: drivers } = useDrivers();
  const { performanceData, updatePerformance } = useDriverPerformance();

  // Merge database data with local state
  const driverTiers = useMemo(() => performanceData, [performanceData]);

  // Create a Set of company driver IDs for analytics calculations
  const companyDriverIds = useMemo(() => {
    return new Set(
      (drivers || [])
        .filter(d => d.is_company_driver)
        .map(d => d.id)
    );
  }, [drivers]);

  // Helper function: For company drivers, driver pay equals freight amount (0% cut)
  const getEffectiveDriverPay = (order: any): number => {
    if (order.driver1Id && companyDriverIds.has(order.driver1Id)) {
      return Number(order.totalFreightAmount) || 0;
    }
    return Number(order.totalDriverPay) || 0;
  };

  // Fetch all profiles to get office locations and roles indexed by full_name AND user_id
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: profiles } = await supabase.from("profiles").select("email, full_name, office, user_id");

      // Also fetch all unique booked_by values from orders to include deleted users
      const { data: ordersData } = await supabase.from("orders").select("booked_by").not("booked_by", "is", null);

      if (profiles) {
        // Fetch user roles for all users
        const { data: userRoles } = await supabase.from("user_roles").select("user_id, role");
        const rolesMap =
          userRoles?.reduce(
            (acc, ur) => {
              if (!acc[ur.user_id]) {
                acc[ur.user_id] = [];
              }
              acc[ur.user_id].push(ur.role);
              return acc;
            },
            {} as Record<string, string[]>,
          ) || {};
        const profileMap = profiles.reduce(
          (acc, p) => {
            // Index by both full_name and user_id to handle both old and new booked_by formats
            if (p.full_name) {
              acc[p.full_name] = {
                email: p.email,
                office: p.office,
                roles: rolesMap[p.user_id] || [],
                user_id: p.user_id,
              };
            }
            if (p.user_id) {
              acc[p.user_id] = {
                email: p.email,
                office: p.office,
                roles: rolesMap[p.user_id] || [],
                user_id: p.user_id,
              };
            }
            return acc;
          },
          {} as Record<
            string,
            {
              email: string;
              office: string | null;
              roles: string[];
              user_id: string;
            }
          >,
        );

        // Add deleted users (those who appear in orders but not in profiles)
        if (ordersData) {
          const uniqueBookedBy = [...new Set(ordersData.map((o) => o.booked_by).filter(Boolean))];
          uniqueBookedBy.forEach((bookedBy) => {
            if (!profileMap[bookedBy as string]) {
              // This is a deleted user - add them with minimal info
              profileMap[bookedBy as string] = {
                email: `${bookedBy}@deleted.user`,
                office: null,
                roles: [],
                user_id: bookedBy as string,
              };
            }
          });
        }

        setDispatcherProfiles(profileMap);
      }
    };
    fetchProfiles();
  }, [profile, hasRole]);

  // Fetch dispatcher driver counts for the selected date range
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

        // Use direct query with type assertion to bypass type checking
        const { data, error } = await supabase
          .from("dispatcher_daily_driver_counts" as any)
          .select("*")
          .gte("date", fromDate)
          .lte("date", toDate);

        if (error) {
          console.error("Error fetching driver counts:", error);
          return;
        }

        // Aggregate counts by dispatcher
        const countsMap: Record<string, { totalTrucks: number; daysCount: number }> = {};
        if (data && Array.isArray(data)) {
          data.forEach((record: any) => {
            if (!countsMap[record.dispatcher_id]) {
              countsMap[record.dispatcher_id] = { totalTrucks: 0, daysCount: 0 };
            }
            countsMap[record.dispatcher_id].totalTrucks += record.driver_count;
            countsMap[record.dispatcher_id].daysCount += 1;
          });
        }

        setDispatcherTruckCounts(countsMap);
      } catch (error) {
        console.error("Error in fetchDriverCounts:", error);
      }
    };

    fetchDriverCounts();
  }, [dateRange]);

  // Filter orders based on date and role - wait for profiles to load
  const filteredOrders = useMemo(() => {
    const primaryRole = getPrimaryRole();

    // Wait for profiles to load for supervisors
    if (primaryRole === "supervisor" && Object.keys(dispatcherProfiles).length === 0) {
      return [];
    }
    const filtered =
      orders?.filter((order) => {
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
                    const fromDateOnly = new Date(
                      dateRange.from.getFullYear(),
                      dateRange.from.getMonth(),
                      dateRange.from.getDate(),
                    );
                    const toDateOnly = new Date(
                      dateRange.to.getFullYear(),
                      dateRange.to.getMonth(),
                      dateRange.to.getDate(),
                    );
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
              }
            } catch (error) {
              console.error("Date parsing error for order:", order.id, dateToFilter, error);
              matchesDate = false;
            }
          }
        }
        // When dateRange is not set, all orders pass the date filter (matchesDate = true)

        // Filter by selected offices (only for admin/manager/chicago_management)
        if (
          selectedOffices.length > 0 &&
          (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "chicago_management")
        ) {
          if (!order.bookedBy || order.bookedBy === "N/A" || order.bookedBy === "Unknown") {
            return false;
          }
          const dispatcherProfile = dispatcherProfiles[order.bookedBy];
          if (!dispatcherProfile || !selectedOffices.includes(dispatcherProfile.office as string)) {
            return false;
          }
        }

        // Filter based on PRIMARY role only
        if (
          primaryRole === "admin" ||
          primaryRole === "manager" ||
          primaryRole === "accounting" ||
          primaryRole === "chicago_management"
        ) {
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
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 w-20 bg-muted animate-pulse rounded" />
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
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>
    );
  }

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
      to: endDate,
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
          year: "numeric",
        });
      };
      weeks.push({
        value: i.toString(),
        label: i === 0 ? "This Week" : i === 1 ? "Last Week" : `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        weekNumber: weeksFromStart - i,
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
      months.push({
        value: i.toString(),
        label: monthStart.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        start: monthStart,
        end: monthEnd,
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
      const monthIndex = parseInt(value);
      const monthOption = monthOptions[monthIndex];
      setDateRange({
        from: monthOption.start,
        to: monthOption.end,
      });
    }
  };
  // Calculate dispatcher analytics
  const dispatcherAnalytics = filteredOrders.reduce(
    (acc, order) => {
      const dispatcher = order.bookedBy || "Unknown";
      if (!acc[dispatcher]) {
        acc[dispatcher] = {
          totalFreight: 0,
          totalDriverRate: 0,
          totalMiles: 0,
          orderCount: 0,
        };
      }
      acc[dispatcher].totalFreight += Number(order.totalFreightAmount) || 0;
      acc[dispatcher].totalDriverRate += getEffectiveDriverPay(order);
      acc[dispatcher].totalMiles += Number(order.mileage) || 0;
      acc[dispatcher].orderCount += 1;
      return acc;
    },
    {} as Record<
      string,
      {
        totalFreight: number;
        totalDriverRate: number;
        totalMiles: number;
        orderCount: number;
      }
    >,
  );
  const dispatcherStats = Object.entries(dispatcherAnalytics)
    .map(
      ([name, stats]: [
        string,
        { totalFreight: number; totalDriverRate: number; totalMiles: number; orderCount: number },
      ]) => {
        const cut = stats.totalFreight - stats.totalDriverRate;
        const cutPercent = stats.totalFreight > 0 ? (cut / stats.totalFreight) * 100 : 0;
        const ratePerMile = stats.totalMiles > 0 ? stats.totalFreight / stats.totalMiles : 0;
        const dispatcherProfile = dispatcherProfiles[name];

        // Get dispatcher user_id from the profile - name can be either full_name or user_id
        const dispatcherUserId = dispatcherProfile?.user_id;
        const truckCountData = dispatcherUserId ? dispatcherTruckCounts[dispatcherUserId] : null;
        const avgTrucks = truckCountData ? truckCountData.totalTrucks / truckCountData.daysCount : 0;

        return {
          name,
          userId: dispatcherUserId || "",
          totalFreight: stats.totalFreight,
          totalDriverRate: stats.totalDriverRate,
          totalMiles: stats.totalMiles,
          orderCount: stats.orderCount,
          cut,
          cutPercent,
          ratePerMile,
          office: dispatcherProfile?.office || "Unknown",
          avgTrucks,
        };
      },
    )
    .filter((stat) => {
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
      const isManagerOrSupervisorOrAfterhours =
        dispatcherProfile.roles.includes("manager") || 
        dispatcherProfile.roles.includes("supervisor") ||
        dispatcherProfile.roles.includes("afterhours");
      
      // Show if: has dispatch role, OR is manager/supervisor/afterhours with orders, OR has gross > 0 (deleted users)
      if (!hasDispatchRole && !(isManagerOrSupervisorOrAfterhours && hasBookedOrders) && !hasBookedOrders) {
        return false;
      }

      // Filter by selected offices (only for admin/manager/chicago_management)
      if (
        selectedOffices.length > 0 &&
        (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "chicago_management")
      ) {
        if (!selectedOffices.includes(stat.office)) {
          return false;
        }
      }

      // Admins, managers, accounting, and chicago_management see all dispatchers
      if (
        primaryRole === "admin" ||
        primaryRole === "manager" ||
        primaryRole === "accounting" ||
        primaryRole === "chicago_management"
      ) {
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
    })
    .filter((stat) => {
      // Filter by 100k+ gross if enabled
      if (showOver100kGross && stat.totalFreight < 100000) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
    });

  // Calculate totals directly from filteredOrders to include ALL orders that pass date/office filters
  // This ensures totals match what the /orders page shows, regardless of dispatcher profile status
  const totals = filteredOrders.reduce(
    (acc, order) => {
      acc.totalFreight += Number(order.totalFreightAmount) || 0;
      acc.totalDriverRate += getEffectiveDriverPay(order);
      acc.totalMiles += Number(order.mileage) || 0;
      acc.orderCount += 1;
      return acc;
    },
    {
      totalFreight: 0,
      totalDriverRate: 0,
      totalMiles: 0,
      orderCount: 0,
    },
  );
  const totalCut = totals.totalFreight - totals.totalDriverRate;
  const totalCutPercent = totals.totalFreight > 0 ? (totalCut / totals.totalFreight) * 100 : 0;
  const totalRatePerMile = totals.totalMiles > 0 ? totals.totalFreight / totals.totalMiles : 0;

  // Calculate driver analytics
  const driverAnalytics = filteredOrders.reduce(
    (acc, order) => {
      // Get driver name from the order (already transformed)
      const driverName = order.driverName;
      if (driverName && driverName !== "N/A") {
        if (!acc[driverName]) {
          acc[driverName] = {
            totalDriverRate: 0,
            totalMiles: 0,
            orderCount: 0,
          };
        }
        acc[driverName].totalDriverRate += Number(order.totalDriverPay) || 0;
        acc[driverName].totalMiles += Number(order.mileage) || 0;
        acc[driverName].orderCount += 1;
      }
      return acc;
    },
    {} as Record<
      string,
      {
        totalDriverRate: number;
        totalMiles: number;
        orderCount: number;
      }
    >,
  );
  const driverStats = Object.entries(driverAnalytics)
    .map(([name, stats]: [string, { totalDriverRate: number; totalMiles: number; orderCount: number }]) => {
      const ratePerMile = stats.totalMiles > 0 ? stats.totalDriverRate / stats.totalMiles : 0;
      return {
        name,
        totalDriverRate: stats.totalDriverRate,
        totalMiles: stats.totalMiles,
        orderCount: stats.orderCount,
        ratePerMile,
        grossTier: driverTiers[name]?.grossTier || "Tier 1",
        safetyTier: driverTiers[name]?.safetyTier || "Tier 1",
        managementTier: driverTiers[name]?.managementTier || "Tier 1",
        notice: driverTiers[name]?.notice || "",
      };
    })
    .filter((stat) => {
      // Filter by driver name search
      const matchesSearch = stat.name.toLowerCase().includes(driverSearchQuery.toLowerCase());

      // Filter by tiers
      const matchesGrossTier = grossTierFilter === "all" || stat.grossTier === grossTierFilter;
      const matchesSafetyTier = safetyTierFilter === "all" || stat.safetyTier === safetyTierFilter;
      const matchesManagementTier = managementTierFilter === "all" || stat.managementTier === managementTierFilter;
      return matchesSearch && matchesGrossTier && matchesSafetyTier && matchesManagementTier;
    })
    .sort((a, b) => {
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
  const handleTierChange = (
    driverName: string,
    tierType: "grossTier" | "safetyTier" | "managementTier",
    value: string,
  ) => {
    const currentData = driverTiers[driverName] || {
      grossTier: "Tier 1",
      safetyTier: "Tier 1",
      managementTier: "Tier 1",
      notice: "",
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: tierType === "grossTier" ? value : currentData.grossTier,
      safety_tier: tierType === "safetyTier" ? value : currentData.safetyTier,
      management_tier: tierType === "managementTier" ? value : currentData.managementTier,
      notice: currentData.notice,
    });
  };
  const handleNoticeChange = (driverName: string, notice: string) => {
    const currentData = driverTiers[driverName] || {
      grossTier: "Tier 1",
      safetyTier: "Tier 1",
      managementTier: "Tier 1",
      notice: "",
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: currentData.grossTier,
      safety_tier: currentData.safetyTier,
      management_tier: currentData.managementTier,
      notice,
    });
  };

  // Calculate driver totals
  const driverTotals = driverStats.reduce(
    (acc, stat) => {
      acc.totalDriverRate += stat.totalDriverRate;
      acc.totalMiles += stat.totalMiles;
      acc.orderCount += stat.orderCount;
      return acc;
    },
    {
      totalDriverRate: 0,
      totalMiles: 0,
      orderCount: 0,
    },
  );
  const driverTotalRatePerMile =
    driverTotals.totalMiles > 0 ? driverTotals.totalDriverRate / driverTotals.totalMiles : 0;
  const handleSort = (column: "totalFreight" | "ratePerMile" | "cut" | "cutPercent") => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // Filter loads booked today with rate <= 2.00
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Calculate current week start (Monday) and end (Sunday) in Chicago time
  const getChicagoWeekBounds = () => {
    // Get current time in Chicago
    const chicagoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
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
    
    return { weekStart, weekEnd };
  };
  
  const { weekStart, weekEnd } = getChicagoWeekBounds();

  // Filter loads booked today with rate <= 2.00, respecting role permissions
  const qualifyingLoads = filteredOrders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    const isToday = createdAt >= today && createdAt <= todayEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
    const meetsRateThreshold = ratePerMile <= 2.0;
    return isToday && meetsRateThreshold;
  });

  // Filter loads booked this week with rate >= 4.00 (Chicago time, Monday reset)
  const highRateLoads = filteredOrders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    const isThisWeek = createdAt >= weekStart && createdAt <= weekEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
    const meetsRateThreshold = ratePerMile >= 4.0;
    return isThisWeek && meetsRateThreshold;
  });

  // Filter loads with 50%+ cut booked this week (Chicago time, Monday reset)
  // Company driver orders are excluded since their effective driver pay = freight (0% cut)
  const highCutLoads = filteredOrders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    const isThisWeek = createdAt >= weekStart && createdAt <= weekEnd;
    if (!isThisWeek) return false;
    
    const freightAmount = Number(order.totalFreightAmount) || 0;
    const driverPay = getEffectiveDriverPay(order);
    if (freightAmount <= 0) return false;
    const cutPercent = ((freightAmount - driverPay) / freightAmount) * 100;
    return cutPercent >= 50;
  });
  return (
    <div className="h-full w-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList>
            <TabsTrigger value="performance">Dispatcher Performance</TabsTrigger>
            <TabsTrigger value="driver-performance">Driver Performance</TabsTrigger>
            <TabsTrigger value="loads">Loads ({qualifyingLoads.length})</TabsTrigger>
          </TabsList>

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
                        {weekOptions.map((week) => (
                          <SelectItem key={week.value} value={week.value}>
                            {week.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedMonth} onValueChange={handleMonthChange}>
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time monthly</SelectItem>
                        {monthOptions.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <DateRangePicker
                      date={filterType === "custom" ? dateRange : undefined}
                      onDateChange={(range) => {
                        setDateRange(range);
                        setSelectedWeek("all");
                        setSelectedMonth("all");
                        setFilterType("custom");
                      }}
                      placeholder="Custom date range (by pickup)"
                      className="w-full sm:w-72"
                    />
                    {dateRange && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDateRange(undefined);
                          setSelectedWeek("all");
                          setSelectedMonth("all");
                        }}
                      >
                        Clear Filter
                      </Button>
                    )}
                  </div>

                  {/* Filters - Only for Admin/Manager/Chicago Management */}
                  {(hasRole("admin") || hasRole("manager") || hasRole("chicago_management")) && (
                    <div className="flex flex-wrap gap-2 items-center w-full justify-between">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-muted-foreground">Office:</span>
                      {Array.from(
                        new Set(
                          Object.values(dispatcherProfiles)
                            .map((p) => p.office)
                            .filter(Boolean),
                        ),
                      ).map((office) => (
                        <Button
                          key={office}
                          variant={selectedOffices.includes(office as string) ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSelectedOffices((prev) =>
                              prev.includes(office as string)
                                ? prev.filter((o) => o !== office)
                                : [...prev, office as string],
                            );
                          }}
                        >
                          {office}
                        </Button>
                      ))}
                      {selectedOffices.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedOffices([])}>
                          Clear Offices
                        </Button>
                      )}
                      </div>
                      <Button
                        variant={showOver100kGross ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowOver100kGross(!showOver100kGross)}
                      >
                        100k+ Gross
                      </Button>
                    </div>
                  )}
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
                          maximumFractionDigits: 2,
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
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div className="text-center col-span-2 sm:col-span-1">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Comm. %</p>
                      <p className="text-lg sm:text-2xl font-bold">{totalCutPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Only show dispatcher table if there's more than 1 dispatcher */}
                {dispatcherStats.length > 1 && (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispatcher</TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("totalFreight")}
                      >
                        Total Freight {sortBy === "totalFreight" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>
                      <TableHead className="text-right">Total Miles</TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("ratePerMile")}
                      >
                        Rate/Mile {sortBy === "ratePerMile" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>

                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("cut")}
                      >
                        Comm. {sortBy === "cut" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("cutPercent")}
                      >
                        Comm. % {sortBy === "cutPercent" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>
                      <TableHead className="text-right">Avg Trucks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatcherStats.map((stat, index) => {
                      // Get the most recent note for this dispatcher in the date range
                      const dispatcherNotesForUser = dispatcherNotes.filter((n) => n.dispatcher_id === stat.userId);
                      const mostRecentNote =
                        dispatcherNotesForUser.length > 0
                          ? dispatcherNotesForUser.reduce((latest, current) =>
                              new Date(current.date) > new Date(latest.date) ? current : latest,
                            )
                          : null;

                      const canViewAndEditNotes =
                        hasRole("manager") || hasRole("admin") || hasRole("chicago_management");
                      const todayDate = format(new Date(), "yyyy-MM-dd");

                      return (
                        <TableRow key={stat.name} className={index === dispatcherStats.length - 1 ? "border-b" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              {stat.name}
                              {canViewAndEditNotes && stat.userId && (
                                <DispatcherNoteDialog
                                  dispatcherId={stat.userId}
                                  initialDate={todayDate}
                                  existingNote={
                                    mostRecentNote
                                      ? {
                                          id: mostRecentNote.id,
                                          note: mostRecentNote.note,
                                          color: mostRecentNote.color,
                                        }
                                      : undefined
                                  }
                                  canEdit={canViewAndEditNotes}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            $
                            {stat.totalFreight.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>

                          <TableCell className="text-right">
                            $
                            {stat.cut.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right">{stat.cutPercent.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">
                            {stat.avgTrucks > 0 ? stat.avgTrucks.toFixed(1) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="driver-performance" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <CardTitle>Driver Performance</CardTitle>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input
                      placeholder="Search driver name..."
                      value={driverSearchQuery}
                      onChange={(e) => setDriverSearchQuery(e.target.value)}
                      className="w-64"
                    />

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

                    {(driverSearchQuery ||
                      grossTierFilter !== "all" ||
                      safetyTierFilter !== "all" ||
                      managementTierFilter !== "all") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDriverSearchQuery("");
                          setGrossTierFilter("all");
                          setSafetyTierFilter("all");
                          setManagementTierFilter("all");
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver Name</TableHead>
                      <TableHead className="text-right">Total Driver Rate</TableHead>
                      <TableHead className="text-right">Total Miles</TableHead>
                      <TableHead className="text-right">Rate/Mile</TableHead>
                      <TableHead>GROSS Tier</TableHead>
                      <TableHead>Safety Tier</TableHead>
                      <TableHead>Management Tier</TableHead>
                      <TableHead>Notice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      driverStats.map((stat, index) => (
                        <TableRow key={stat.name} className={index === driverStats.length - 1 ? "border-b" : ""}>
                          <TableCell className="font-medium">{stat.name}</TableCell>
                          <TableCell className="text-right">
                            $
                            {stat.totalDriverRate.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>
                          <TableCell>
                            <Select
                              value={stat.grossTier}
                              onValueChange={(value) => handleTierChange(stat.name, "grossTier", value)}
                            >
                              <SelectTrigger className={`w-22 ${getTierColor(stat.grossTier)}`}>
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
                            <Select
                              value={stat.safetyTier}
                              onValueChange={(value) => handleTierChange(stat.name, "safetyTier", value)}
                            >
                              <SelectTrigger className={`w-22 ${getTierColor(stat.safetyTier)}`}>
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
                            <Select
                              value={stat.managementTier}
                              onValueChange={(value) => handleTierChange(stat.name, "managementTier", value)}
                            >
                              <SelectTrigger className={`w-22 ${getTierColor(stat.managementTier)}`}>
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
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setSelectedDriverNotice({
                                      name: stat.name,
                                      notice: stat.notice,
                                    })
                                  }
                                  className="h-auto p-2 text-left justify-start"
                                >
                                  <span className="line-clamp-2 text-xs">
                                    {stat.notice
                                      ? stat.notice.length > 44
                                        ? stat.notice.substring(0, 44) + "..."
                                        : stat.notice
                                      : "Click to add note..."}
                                  </span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Notice for {stat.name}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <Textarea
                                    value={
                                      selectedDriverNotice?.name === stat.name
                                        ? selectedDriverNotice.notice
                                        : stat.notice
                                    }
                                    onChange={(e) => {
                                      const newNotice = e.target.value;
                                      setSelectedDriverNotice({
                                        name: stat.name,
                                        notice: newNotice,
                                      });
                                      handleNoticeChange(stat.name, newNotice);
                                    }}
                                    placeholder="Enter notice for this driver..."
                                    className="min-h-[200px]"
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Totals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Total Driver Rate</p>
                    <p className="text-2xl font-bold">
                      $
                      {driverTotals.totalDriverRate.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Total Miles</p>
                    <p className="text-2xl font-bold">{driverTotals.totalMiles.toLocaleString()}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Rate/Mile</p>
                    <p className="text-2xl font-bold">${driverTotalRatePerMile.toFixed(2)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                    <p className="text-2xl font-bold">{driverTotals.orderCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="loads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Loads Booked Today (Rate ≤ $2.00/mile)</CardTitle>
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
                    {qualifyingLoads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No qualifying loads booked today
                        </TableCell>
                      </TableRow>
                    ) : (
                      qualifyingLoads.map((order) => {
                        const ratePerMile =
                          order.mileage && order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                        const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                        const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                        return (
                          <TableRow 
                            key={order.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigateToEditOrder(order.id)}
                          >
                            <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                            <TableCell>{order.brokerLoadNumber}</TableCell>
                            <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                            <TableCell>
                              {pickupLocation} → {deliveryLocation}
                            </TableCell>
                            <TableCell className="text-right">
                              $
                              {order.totalFreightAmount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right">
                              {order.mileage != null ? order.mileage.toLocaleString() : "0"}
                            </TableCell>
                            <TableCell className="text-right">${ratePerMile.toFixed(2)}</TableCell>
                            <TableCell>{order.bookedBy}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {hasRole('admin') && (
              <Card>
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
                      {highRateLoads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No qualifying loads booked this week
                          </TableCell>
                        </TableRow>
                      ) : (
                        highRateLoads.map((order) => {
                          const ratePerMile =
                            order.mileage && order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                          const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                          const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                          return (
                            <TableRow 
                              key={order.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigateToEditOrder(order.id)}
                            >
                              <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                              <TableCell>{order.brokerLoadNumber}</TableCell>
                              <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                              <TableCell>
                                {pickupLocation} → {deliveryLocation}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {order.totalFreightAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right">
                                {order.mileage != null ? order.mileage.toLocaleString() : "0"}
                              </TableCell>
                              <TableCell className="text-right">${ratePerMile.toFixed(2)}</TableCell>
                              <TableCell>{order.bookedBy}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {hasRole('admin') && (
              <Card>
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
                      {highCutLoads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No loads with 50%+ cut found this week
                          </TableCell>
                        </TableRow>
                      ) : (
                        highCutLoads.map((order) => {
                          const freightAmount = Number(order.totalFreightAmount) || 0;
                          const driverPay = Number(order.totalDriverPay) || 0;
                          const cut = freightAmount - driverPay;
                          const cutPercent = freightAmount > 0 ? (cut / freightAmount) * 100 : 0;
                          const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                          const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                          return (
                            <TableRow 
                              key={order.id} 
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigateToEditOrder(order.id)}
                            >
                              <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                              <TableCell>{order.brokerLoadNumber}</TableCell>
                              <TableCell>{formatDateNoTimezone(order.pickupDatetime)}</TableCell>
                              <TableCell>
                                {pickupLocation} → {deliveryLocation}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {freightAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right">
                                $
                                {driverPay.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                $
                                {cut.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {cutPercent.toFixed(1)}%
                              </TableCell>
                              <TableCell>{order.bookedBy}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
export default Analytics;
