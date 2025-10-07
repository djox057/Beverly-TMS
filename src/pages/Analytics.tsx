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
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
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
    hasRole
  } = useAuthContext();

  // Debug navigation function
  const navigateToEditOrder = (orderId: string) => {
    console.log('=== NAVIGATION DEBUG ===');
    console.log('Order ID to navigate to:', orderId);
    console.log('Order ID type:', typeof orderId);
    console.log('Current location:', window.location.href);
    if (!orderId) {
      console.error('Order ID is missing!');
      return;
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      console.error('Invalid order ID format:', orderId);
      return;
    }
    const targetUrl = `/edit-order/${orderId}`;
    console.log('Target URL:', targetUrl);

    // Try navigation with fallback to window.location
    try {
      console.log('Attempting React Router navigation...');
      navigate(targetUrl);
      console.log('React Router navigation completed');
    } catch (error) {
      console.error('Navigation failed, using window.location:', error);
      window.location.href = targetUrl;
    }
    console.log('=== END NAVIGATION DEBUG ===');
  };
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sortBy, setSortBy] = useState<'totalFreight' | 'ratePerMile' | 'cut' | 'cutPercent'>('totalFreight');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const {
    data: orders,
    isLoading,
    error
  } = useOrders();
  const {
    data: companies
  } = useCompanies();
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
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

  // Filter orders based on date
  const filteredOrders = orders?.filter(order => {
    // Date filtering based on delivery date
    let matchesDate = true;
    if (dateRange?.from) {
      const orderDeliveryDate = new Date(order.deliveryDate.split(' - ')[0]);
      const orderDateOnly = new Date(orderDeliveryDate.getFullYear(), orderDeliveryDate.getMonth(), orderDeliveryDate.getDate());
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
    return matchesDate;
  }) || [];

  // Helper function to get week start date
  const getWeekStartDate = (weeksAgo: number) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff - (weeksAgo * 7));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  };

  const setWeekFilter = (weeks: number) => {
    const startDate = getWeekStartDate(weeks);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    setDateRange({ from: startDate, to: endDate });
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
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      
      weeks.push({
        value: i.toString(),
        label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        weekNumber: weeksFromStart - i
      });
    }
    
    return weeks;
  };

  const weekOptions = generateWeekOptions();

  const handleWeekChange = (value: string) => {
    setSelectedWeek(value);
    if (value === "all") {
      setDateRange(undefined);
    } else {
      setWeekFilter(parseInt(value));
    }
  };
  // Calculate dispatcher analytics
  const dispatcherAnalytics = filteredOrders.reduce((acc, order) => {
    const dispatcher = order.bookedBy || 'Unknown';
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
  }, {} as Record<string, { totalFreight: number; totalDriverRate: number; totalMiles: number; orderCount: number }>);

  const dispatcherStats = Object.entries(dispatcherAnalytics).map(([name, stats]) => {
    const cut = stats.totalFreight - stats.totalDriverRate;
    const cutPercent = stats.totalFreight > 0 ? (cut / stats.totalFreight) * 100 : 0;
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
  }).sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    return sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
  });

  const handleSort = (column: 'totalFreight' | 'ratePerMile' | 'cut' | 'cutPercent') => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };

  return <div className="h-full w-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
        </div>

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
                  <SelectItem value="all">All Time</SelectItem>
                  {weekOptions.map(week => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker 
                date={dateRange} 
                onDateChange={(range) => {
                  setDateRange(range);
                  setSelectedWeek("all");
                }} 
                placeholder="Custom date range" 
                className="w-72" 
              />
              {dateRange && (
                <Button variant="outline" size="sm" onClick={() => {
                  setDateRange(undefined);
                  setSelectedWeek("all");
                }}>
                  Clear Filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispatcher</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('totalFreight')}
                >
                  Total Freight {sortBy === 'totalFreight' && (sortDirection === 'desc' ? '↓' : '↑')}
                </TableHead>
                <TableHead className="text-right">Total Miles</TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('ratePerMile')}
                >
                  Rate/Mile {sortBy === 'ratePerMile' && (sortDirection === 'desc' ? '↓' : '↑')}
                </TableHead>
                <TableHead className="text-right">Driver Rate</TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('cut')}
                >
                  Cut {sortBy === 'cut' && (sortDirection === 'desc' ? '↓' : '↑')}
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('cutPercent')}
                >
                  Cut % {sortBy === 'cutPercent' && (sortDirection === 'desc' ? '↓' : '↑')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispatcherStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                dispatcherStats.map((stat) => (
                  <TableRow key={stat.name}>
                    <TableCell className="font-medium">{stat.name}</TableCell>
                    <TableCell className="text-right">{stat.orderCount}</TableCell>
                    <TableCell className="text-right">${stat.totalFreight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{stat.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${stat.ratePerMile.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${stat.totalDriverRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">${stat.cut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{stat.cutPercent.toFixed(1)}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>;
};
export default Analytics;