import { DateRange } from "react-day-picker";
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
    getPrimaryRole
  } = useAuthContext();

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
  const [dispatcherProfiles, setDispatcherProfiles] = useState<Record<string, {
    email: string;
    office: string | null;
    roles: string[];
  }>>({});
  const [selectedDriverNotice, setSelectedDriverNotice] = useState<{
    name: string;
    notice: string;
  } | null>(null);
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>("");
  const [grossTierFilter, setGrossTierFilter] = useState<string>("all");
  const [safetyTierFilter, setSafetyTierFilter] = useState<string>("all");
  const [managementTierFilter, setManagementTierFilter] = useState<string>("all");
  const {
    data: orders,
    isLoading,
    error
  } = useOrders();
  const {
    data: companies
  } = useCompanies();
  const {
    data: drivers
  } = useDrivers();
  const {
    performanceData,
    updatePerformance
  } = useDriverPerformance();

  // Merge database data with local state
  const driverTiers = useMemo(() => performanceData, [performanceData]);

  // Fetch all profiles to get office locations and roles indexed by full_name
  useEffect(() => {
    const fetchProfiles = async () => {
      const {
        data: profiles
      } = await supabase.from("profiles").select("email, full_name, office, user_id");
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
          if (p.full_name) {
            acc[p.full_name] = {
              email: p.email,
              office: p.office,
              roles: rolesMap[p.user_id] || []
            };
          }
          return acc;
        }, {} as Record<string, {
          email: string;
          office: string | null;
          roles: string[];
        }>);
        setDispatcherProfiles(profileMap);
      }
    };
    fetchProfiles();
  }, [profile, hasRole]);

  // Filter orders based on date and role - wait for profiles to load
  const filteredOrders = useMemo(() => {
    const primaryRole = getPrimaryRole();

    // Wait for profiles to load for supervisors
    if (primaryRole === "supervisor" && Object.keys(dispatcherProfiles).length === 0) {
      return [];
    }
    const filtered = orders?.filter(order => {
      // Exclude canceled orders from analytics
      if (order.canceled) {
        return false;
      }

      // Date filtering - use pickup date for week filters, delivery date for month filters
      let matchesDate = true;
      if (dateRange?.from) {
        const dateToFilter = filterType === "month" ? order.deliveryDate : order.pickupDate;
        const orderDate = new Date(dateToFilter.split(" - ")[0]);
        const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
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

      // Filter based on PRIMARY role only
      if (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "accounting") {
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

      // Dispatchers only see their own orders
      if (primaryRole === "dispatch") {
        if (!profile?.full_name) {
          return false;
        }
        return matchesDate && order.bookedBy === profile.full_name;
      }

      // Default: no access for other roles
      return false;
    }) || [];
    return filtered;
  }, [orders, dateRange, filterType, dispatcherProfiles, getPrimaryRole, profile]);
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 w-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              </div>
            </div>)}
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>;
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
      months.push({
        value: i.toString(),
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
      const monthIndex = parseInt(value);
      const monthOption = monthOptions[monthIndex];
      setDateRange({
        from: monthOption.start,
        to: monthOption.end
      });
    }
  };
  // Calculate dispatcher analytics
  const dispatcherAnalytics = filteredOrders.reduce((acc, order) => {
    const dispatcher = order.bookedBy || "Unknown";
    if (!acc[dispatcher]) {
      acc[dispatcher] = {
        totalFreight: 0,
        totalDriverRate: 0,
        totalMiles: 0,
        orderCount: 0
      };
    }
    acc[dispatcher].totalFreight += order.totalFreightAmount;
    acc[dispatcher].totalDriverRate += order.driverPrice;
    acc[dispatcher].totalMiles += order.mileage;
    acc[dispatcher].orderCount += 1;
    return acc;
  }, {} as Record<string, {
    totalFreight: number;
    totalDriverRate: number;
    totalMiles: number;
    orderCount: number;
  }>);
  const dispatcherStats = Object.entries(dispatcherAnalytics).map(([name, stats]) => {
    const cut = stats.totalFreight - stats.totalDriverRate;
    const cutPercent = stats.totalFreight > 0 ? cut / stats.totalFreight * 100 : 0;
    const ratePerMile = stats.totalMiles > 0 ? stats.totalFreight / stats.totalMiles : 0;
    return {
      name,
      totalFreight: stats.totalFreight,
      totalDriverRate: stats.totalDriverRate,
      totalMiles: stats.totalMiles,
      orderCount: stats.orderCount,
      cut,
      cutPercent,
      ratePerMile
    };
  }).filter(stat => {
    const dispatcherProfile = dispatcherProfiles[stat.name];
    const primaryRole = getPrimaryRole();

    // Only show users with 'dispatch' role
    if (!dispatcherProfile || !dispatcherProfile.roles.includes('dispatch')) {
      return false;
    }

    // Admins, managers and accounting see all dispatchers
    if (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "accounting") {
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
  }).sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
  });

  // Calculate totals
  const totals = dispatcherStats.reduce((acc, stat) => {
    acc.totalFreight += stat.totalFreight;
    acc.totalDriverRate += stat.totalDriverRate;
    acc.totalMiles += stat.totalMiles;
    acc.orderCount += stat.orderCount;
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

  // Calculate driver analytics
  const driverAnalytics = filteredOrders.reduce((acc, order) => {
    // Get driver name from the order (already transformed)
    const driverName = order.driverName;
    if (driverName && driverName !== 'N/A') {
      if (!acc[driverName]) {
        acc[driverName] = {
          totalDriverRate: 0,
          totalMiles: 0,
          orderCount: 0
        };
      }
      acc[driverName].totalDriverRate += order.driverPrice;
      acc[driverName].totalMiles += order.mileage;
      acc[driverName].orderCount += 1;
    }
    return acc;
  }, {} as Record<string, {
    totalDriverRate: number;
    totalMiles: number;
    orderCount: number;
  }>);
  const driverStats = Object.entries(driverAnalytics).map(([name, stats]) => {
    const ratePerMile = stats.totalMiles > 0 ? stats.totalDriverRate / stats.totalMiles : 0;
    return {
      name,
      totalDriverRate: stats.totalDriverRate,
      totalMiles: stats.totalMiles,
      orderCount: stats.orderCount,
      ratePerMile,
      grossTier: driverTiers[name]?.grossTier || 'Tier 1',
      safetyTier: driverTiers[name]?.safetyTier || 'Tier 1',
      managementTier: driverTiers[name]?.managementTier || 'Tier 1',
      notice: driverTiers[name]?.notice || ''
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
      case 'Tier 1':
        return 'bg-green-500 text-white hover:bg-green-600';
      case 'Tier 2':
        return 'bg-yellow-500 text-white hover:bg-yellow-600';
      case 'Tier 3':
        return 'bg-red-500 text-white hover:bg-red-600';
      default:
        return 'bg-gray-500 text-white hover:bg-gray-600';
    }
  };
  const handleTierChange = (driverName: string, tierType: 'grossTier' | 'safetyTier' | 'managementTier', value: string) => {
    const currentData = driverTiers[driverName] || {
      grossTier: 'Tier 1',
      safetyTier: 'Tier 1',
      managementTier: 'Tier 1',
      notice: ''
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: tierType === 'grossTier' ? value : currentData.grossTier,
      safety_tier: tierType === 'safetyTier' ? value : currentData.safetyTier,
      management_tier: tierType === 'managementTier' ? value : currentData.managementTier,
      notice: currentData.notice
    });
  };
  const handleNoticeChange = (driverName: string, notice: string) => {
    const currentData = driverTiers[driverName] || {
      grossTier: 'Tier 1',
      safetyTier: 'Tier 1',
      managementTier: 'Tier 1',
      notice: ''
    };
    updatePerformance({
      driver_name: driverName,
      gross_tier: currentData.grossTier,
      safety_tier: currentData.safetyTier,
      management_tier: currentData.managementTier,
      notice
    });
  };

  // Calculate driver totals
  const driverTotals = driverStats.reduce((acc, stat) => {
    acc.totalDriverRate += stat.totalDriverRate;
    acc.totalMiles += stat.totalMiles;
    acc.orderCount += stat.orderCount;
    return acc;
  }, {
    totalDriverRate: 0,
    totalMiles: 0,
    orderCount: 0
  });
  const driverTotalRatePerMile = driverTotals.totalMiles > 0 ? driverTotals.totalDriverRate / driverTotals.totalMiles : 0;
  const handleSort = (column: "totalFreight" | "ratePerMile" | "cut" | "cutPercent") => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // Filter loads booked today with rate >= 1.7
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Filter loads booked today with rate <= 1.7, respecting role permissions
  const qualifyingLoads = filteredOrders.filter(order => {
    const createdAt = new Date(order.createdAt);
    const isToday = createdAt >= today && createdAt <= todayEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
    const meetsRateThreshold = ratePerMile <= 1.7;
    return isToday && meetsRateThreshold;
  });
  return <div className="h-full w-full">
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
                  <div className="flex flex-wrap gap-2 items-center">
                    <Select value={selectedWeek} onValueChange={handleWeekChange}>
                      <SelectTrigger className="w-64">
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
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time monthly</SelectItem>
                        {monthOptions.map(month => <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>

                    <DateRangePicker date={dateRange} onDateChange={range => {
                    setDateRange(range);
                    setSelectedWeek("all");
                    setSelectedMonth("all");
                    setFilterType("custom");
                  }} placeholder="Custom date range" className="w-72" />
                    {dateRange && <Button variant="outline" size="sm" onClick={() => {
                    setDateRange(undefined);
                    setSelectedWeek("all");
                    setSelectedMonth("all");
                  }}>
                        Clear Filter
                      </Button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Totals Section */}
                <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
                  <div className="grid grid-cols-7 gap-4">
                    
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Freight</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        ${totals.totalFreight.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Miles</p>
                      <p className="text-2xl font-bold">{totals.totalMiles.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Avg Rate/Mile</p>
                      <p className="text-2xl font-bold">${totalRatePerMile.toFixed(2)}</p>
                    </div>
                    
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Cut</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        ${totalCut.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Avg Cut %</p>
                      <p className="text-2xl font-bold">{totalCutPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

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
                      
                      <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cut")}>
                        Cut {sortBy === "cut" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>
                      <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cutPercent")}>
                        Cut % {sortBy === "cutPercent" && (sortDirection === "desc" ? "↓" : "↑")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatcherStats.length === 0 ? <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow> : dispatcherStats.map((stat, index) => <TableRow key={stat.name} className={index === dispatcherStats.length - 1 ? "border-b" : ""}>
                          <TableCell className="font-medium">{stat.name}</TableCell>
                          <TableCell className="text-right">
                            $
                            {stat.totalFreight.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                          </TableCell>
                          <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>
                          
                          <TableCell className="text-right">
                            $
                            {stat.cut.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                          </TableCell>
                          <TableCell className="text-right">{stat.cutPercent.toFixed(1)}%</TableCell>
                        </TableRow>)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            
          </TabsContent>

          <TabsContent value="driver-performance" className="space-y-6">
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
                            <Select value={stat.grossTier} onValueChange={value => handleTierChange(stat.name, 'grossTier', value)}>
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
                            <Select value={stat.safetyTier} onValueChange={value => handleTierChange(stat.name, 'safetyTier', value)}>
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
                            <Select value={stat.managementTier} onValueChange={value => handleTierChange(stat.name, 'managementTier', value)}>
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
                                <Button variant="ghost" size="sm" onClick={() => setSelectedDriverNotice({
                            name: stat.name,
                            notice: stat.notice
                          })} className="h-auto p-2 text-left justify-start">
                                  <span className="line-clamp-2 text-xs">
                                    {stat.notice ? stat.notice.length > 44 ? stat.notice.substring(0, 44) + '...' : stat.notice : 'Click to add note...'}
                                  </span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Notice for {stat.name}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <Textarea value={selectedDriverNotice?.name === stat.name ? selectedDriverNotice.notice : stat.notice} onChange={e => {
                              const newNotice = e.target.value;
                              setSelectedDriverNotice({
                                name: stat.name,
                                notice: newNotice
                              });
                              handleNoticeChange(stat.name, newNotice);
                            }} placeholder="Enter notice for this driver..." className="min-h-[200px]" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>)}
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
                      maximumFractionDigits: 2
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
                <CardTitle>Loads Booked Today (Rate ≤ $1.70/mile)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Load #</TableHead>
                      <TableHead>Broker load#</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="text-right">Freight Amount</TableHead>
                      <TableHead className="text-right">Miles</TableHead>
                      <TableHead className="text-right">Rate/Mile</TableHead>
                      <TableHead>Booked By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qualifyingLoads.length === 0 ? <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No qualifying loads booked today
                        </TableCell>
                      </TableRow> : qualifyingLoads.map(order => {
                    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                    const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                    const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                    return <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                            <TableCell>{order.brokerLoadNumber}</TableCell>
                            <TableCell>
                              {pickupLocation} → {deliveryLocation}
                            </TableCell>
                            <TableCell className="text-right">
                              $
                              {order.totalFreightAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                            </TableCell>
                            <TableCell className="text-right">{order.mileage.toLocaleString()}</TableCell>
                            <TableCell className="text-right">${ratePerMile.toFixed(2)}</TableCell>
                            <TableCell>{order.bookedBy}</TableCell>
                          </TableRow>;
                  })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>;
};
export default Analytics;