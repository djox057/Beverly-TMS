import React, { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { format, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Award, Medal, Trophy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnalyticsAggregates, DispatcherAnalytics } from "@/hooks/useAnalyticsAggregates";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import crownImage from "@/assets/crown.png";

// Helper to get Monday of week
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DispatcherAnalyticsAggregatedProps {
  filterType: "week" | "month";
  selectedWeek: string;
  selectedMonth: string;
  selectedOffices: string[];
  onWeekChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  dispatcherProfiles: Record<string, { email: string; office: string | null; roles: string[]; user_id: string }>;
  dispatcherTruckCounts: Record<string, { totalTrucks: number; daysCount: number }>;
}

// Generate week options for dropdown
const generateWeekOptions = () => {
  const weeks = [];
  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const dayOfWeek = startOfYear.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const firstMonday = new Date(startOfYear);
  firstMonday.setDate(startOfYear.getDate() - diff);
  const currentWeekStart = getWeekStart(new Date());
  const weeksFromStart = Math.floor((currentWeekStart.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  for (let i = 0; i < 52; i++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const formatDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    weeks.push({
      value: i.toString(),
      label: i === 0 ? "This Week" : i === 1 ? "Last Week" : `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
      weekNumber: weeksFromStart - i,
      start: weekStart,
    });
  }
  return weeks;
};

// Generate month options for dropdown
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
      index: i,
      label: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      start: monthStart,
      end: monthEnd,
    });
  }
  return months;
};

export function DispatcherAnalyticsAggregated({
  filterType,
  selectedWeek,
  selectedMonth,
  selectedOffices,
  onWeekChange,
  onMonthChange,
  dispatcherProfiles,
  dispatcherTruckCounts,
}: DispatcherAnalyticsAggregatedProps) {
  const { hasRole, profile, getPrimaryRole } = useAuthContext();
  const [sortBy, setSortBy] = useState<"totalFreight" | "ratePerMile" | "cut" | "cutPercent">("totalFreight");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showOver100kGross, setShowOver100kGross] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const monthOptions = useMemo(() => generateMonthOptions(), []);

  // Calculate period start date based on filter
  const periodStart = useMemo(() => {
    if (filterType === "week") {
      const weekIndex = parseInt(selectedWeek) || 0;
      const weekOption = weekOptions[weekIndex];
      return weekOption?.start || getWeekStart(new Date());
    } else {
      const monthOption = monthOptions.find(m => m.value === selectedMonth);
      return monthOption?.start || startOfMonth(new Date());
    }
  }, [filterType, selectedWeek, selectedMonth, weekOptions, monthOptions]);

  // Use pre-aggregated analytics
  const { dispatchers, totals, isLoading, error, recalculate, lastCalculatedAt } = useAnalyticsAggregates({
    periodType: filterType,
    periodStart,
    office: selectedOffices.length === 1 ? selectedOffices[0] : undefined,
    enabled: true,
  });

  const primaryRole = getPrimaryRole();

  // Filter and sort dispatchers
  const filteredDispatcherStats = useMemo(() => {
    let filtered = dispatchers;

    // Filter by selected offices (for admin/manager)
    if (selectedOffices.length > 0 && (primaryRole === "admin" || primaryRole === "manager" || primaryRole === "chicago_management")) {
      filtered = filtered.filter(d => d.office && selectedOffices.includes(d.office));
    }

    // Filter by 100k+ gross if enabled
    if (showOver100kGross) {
      filtered = filtered.filter(d => d.total_freight >= 100000);
    }

    // Filter for dispatchers only (show users with gross > 0 or dispatch role)
    filtered = filtered.filter(stat => {
      const dispatcherProfile = dispatcherProfiles[stat.dispatcher_name] || dispatcherProfiles[stat.dispatcher_id];
      const hasBookedOrders = stat.total_freight > 0;

      if (!dispatcherProfile) {
        return hasBookedOrders;
      }

      const hasDispatchRole = dispatcherProfile.roles.includes("dispatch");
      const isManagerOrSupervisorOrAfterhours =
        dispatcherProfile.roles.includes("manager") ||
        dispatcherProfile.roles.includes("supervisor") ||
        dispatcherProfile.roles.includes("afterhours");

      if (!hasDispatchRole && !(isManagerOrSupervisorOrAfterhours && hasBookedOrders) && !hasBookedOrders) {
        return false;
      }

      // Supervisors only see their office
      if (primaryRole === "supervisor" && profile?.office) {
        return dispatcherProfile.office === profile.office;
      }

      // Dispatchers only see themselves
      if (primaryRole === "dispatch" && profile?.full_name) {
        return stat.dispatcher_name === profile.full_name || stat.dispatcher_id === profile.user_id;
      }

      return true;
    });

    // Sort
    return filtered.sort((a, b) => {
      let aValue: number, bValue: number;
      switch (sortBy) {
        case "totalFreight":
          aValue = a.total_freight;
          bValue = b.total_freight;
          break;
        case "ratePerMile":
          aValue = a.rate_per_mile;
          bValue = b.rate_per_mile;
          break;
        case "cut":
          aValue = a.dispatcher_cut;
          bValue = b.dispatcher_cut;
          break;
        case "cutPercent":
          aValue = a.dispatcher_cut_percent;
          bValue = b.dispatcher_cut_percent;
          break;
        default:
          aValue = a.total_freight;
          bValue = b.total_freight;
      }
      return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
    });
  }, [dispatchers, selectedOffices, showOver100kGross, sortBy, sortDirection, dispatcherProfiles, primaryRole, profile]);

  // Handle sort
  const handleSort = (column: "totalFreight" | "ratePerMile" | "cut" | "cutPercent") => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // Handle manual recalculation
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await recalculate();
      toast.success("Analytics recalculated successfully");
    } catch (err) {
      toast.error("Failed to recalculate analytics");
    } finally {
      setIsRecalculating(false);
    }
  };

  // Calculate totals from filtered data or use pre-calculated totals
  const displayTotals = useMemo(() => {
    if (totals && selectedOffices.length === 0) {
      return {
        totalFreight: totals.total_freight,
        totalDriverRate: totals.total_driver_rate,
        totalCut: totals.total_cut,
        totalCutPercent: totals.total_cut_percent,
        totalMiles: totals.total_miles,
        ratePerMile: totals.rate_per_mile,
        orderCount: totals.order_count,
      };
    }

    // Calculate from filtered dispatchers
    const agg = filteredDispatcherStats.reduce(
      (acc, d) => ({
        totalFreight: acc.totalFreight + d.total_freight,
        totalDriverRate: acc.totalDriverRate + d.total_driver_rate,
        totalMiles: acc.totalMiles + d.total_miles,
        orderCount: acc.orderCount + d.order_count,
      }),
      { totalFreight: 0, totalDriverRate: 0, totalMiles: 0, orderCount: 0 }
    );

    const cut = agg.totalFreight - agg.totalDriverRate;
    const cutPercent = agg.totalFreight > 0 ? (cut / agg.totalFreight) * 100 : 0;
    const rpm = agg.totalMiles > 0 ? agg.totalFreight / agg.totalMiles : 0;

    return {
      ...agg,
      totalCut: cut,
      totalCutPercent: cutPercent,
      ratePerMile: rpm,
    };
  }, [totals, filteredDispatcherStats, selectedOffices]);

  // Get ranking icon
  const getRankingIcon = (index: number) => {
    if (index === 0) return <img src={crownImage} alt="1st" className="w-5 h-5" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Award className="w-4 h-4 text-amber-600" />;
    return <span className="text-muted-foreground text-sm w-4">{index + 1}</span>;
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Error loading analytics: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gross</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${displayTotals.totalFreight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{displayTotals.orderCount} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Driver Pay</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${displayTotals.totalDriverRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cut</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${displayTotals.totalCut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{displayTotals.totalCutPercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rate Per Mile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${displayTotals.ratePerMile.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{displayTotals.totalMiles.toLocaleString()} miles</p>
          </CardContent>
        </Card>
      </div>

      {/* Dispatcher Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Dispatcher Performance</CardTitle>
            <div className="flex items-center gap-2">
              {lastCalculatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated: {new Date(lastCalculatedAt).toLocaleString()}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculate}
                disabled={isRecalculating}
              >
                {isRecalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Refresh</span>
              </Button>
              {(primaryRole === "admin" || primaryRole === "manager") && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="over100k"
                    checked={showOver100kGross}
                    onCheckedChange={(checked) => setShowOver100kGross(!!checked)}
                  />
                  <label htmlFor="over100k" className="text-sm">100k+ Gross</label>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Dispatcher</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("totalFreight")}>
                    Gross {sortBy === "totalFreight" && (sortDirection === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right">Driver Pay</TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cut")}>
                    Cut {sortBy === "cut" && (sortDirection === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("cutPercent")}>
                    Cut % {sortBy === "cutPercent" && (sortDirection === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ratePerMile")}>
                    RPM {sortBy === "ratePerMile" && (sortDirection === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">Avg Trucks</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDispatcherStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No data available for this period. Click Refresh to calculate.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDispatcherStats.map((stat, index) => (
                    <TableRow key={stat.id}>
                      <TableCell>{getRankingIcon(index)}</TableCell>
                      <TableCell className="font-medium">{stat.dispatcher_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{stat.office || "Unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${stat.total_freight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ${stat.total_driver_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ${stat.dispatcher_cut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{stat.dispatcher_cut_percent.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">${stat.rate_per_mile.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{stat.total_miles.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{stat.avg_trucks.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{stat.order_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
