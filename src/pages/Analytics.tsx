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
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    profile
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
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [filterType, setFilterType] = useState<'week' | 'month' | 'custom'>('week');
  const [dispatcherProfiles, setDispatcherProfiles] = useState<Record<string, { email: string; office: string | null }>>({});
  
  const {
    data: orders,
    isLoading,
    error
  } = useOrders();
  const {
    data: companies
  } = useCompanies();

  // Fetch all profiles to get office locations
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, office');
      
      if (profiles) {
        const profileMap = profiles.reduce((acc, p) => {
          if (p.email) {
            acc[p.email] = { email: p.email, office: p.office };
          }
          return acc;
        }, {} as Record<string, { email: string; office: string | null }>);
        setDispatcherProfiles(profileMap);
      }
    };
    fetchProfiles();
  }, []);
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
    // Date filtering - use pickup date for week filters, delivery date for month filters
    let matchesDate = true;
    if (dateRange?.from) {
      const dateToFilter = filterType === 'month' ? order.deliveryDate : order.pickupDate;
      const orderDate = new Date(dateToFilter.split(' - ')[0]);
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
    setSelectedMonth("all");
    setFilterType('week');
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
        label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
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
    setFilterType('month');
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const monthIndex = parseInt(value);
      const monthOption = monthOptions[monthIndex];
      setDateRange({ from: monthOption.start, to: monthOption.end });
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
  })
  .filter(stat => {
    // Supervisors only see dispatchers from their office
    if (hasRole('supervisor') && profile?.office) {
      const dispatcherProfile = dispatcherProfiles[stat.name];
      return dispatcherProfile?.office === profile.office;
    }
    return true;
  })
  .sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    return sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
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
  const totalCutPercent = totals.totalFreight > 0 ? (totalCut / totals.totalFreight) * 100 : 0;
  const totalRatePerMile = totals.totalMiles > 0 ? totals.totalFreight / totals.totalMiles : 0;

  const handleSort = (column: 'totalFreight' | 'ratePerMile' | 'cut' | 'cutPercent') => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };

  // Filter loads booked today with rate >= 1.7
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const qualifyingLoads = orders?.filter(order => {
    const createdAt = new Date(order.createdAt);
    const isToday = createdAt >= today && createdAt <= todayEnd;
    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
    const meetsRateThreshold = ratePerMile <= 1.7;
    return isToday && meetsRateThreshold;
  }) || [];

  return <div className="h-full w-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
        </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList>
          <TabsTrigger value="performance">Dispatcher Performance</TabsTrigger>
          <TabsTrigger value="loads">
            Loads ({qualifyingLoads.length})
          </TabsTrigger>
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
                  {weekOptions.map(week => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedMonth} onValueChange={handleMonthChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time monthly</SelectItem>
                  {monthOptions.map(month => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <DateRangePicker 
                date={dateRange} 
                onDateChange={(range) => {
                  setDateRange(range);
                  setSelectedWeek("all");
                  setSelectedMonth("all");
                  setFilterType('custom');
                }} 
                placeholder="Custom date range" 
                className="w-72" 
              />
              {dateRange && (
                <Button variant="outline" size="sm" onClick={() => {
                  setDateRange(undefined);
                  setSelectedWeek("all");
                  setSelectedMonth("all");
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
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                dispatcherStats.map((stat, index) => (
                  <TableRow key={stat.name} className={index === dispatcherStats.length - 1 ? 'border-b' : ''}>
                    <TableCell className="font-medium">{stat.name}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-8">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Total Freight</p>
              <p className="text-2xl font-bold">${totals.totalFreight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Total Miles</p>
              <p className="text-2xl font-bold">{totals.totalMiles.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Rate/Mile</p>
              <p className="text-2xl font-bold">${totalRatePerMile.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Driver Rate</p>
              <p className="text-2xl font-bold">${totals.totalDriverRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Cut</p>
              <p className="text-2xl font-bold">${totalCut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Cut %</p>
              <p className="text-2xl font-bold">{totalCutPercent.toFixed(1)}%</p>
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
                  <TableHead>Broker</TableHead>
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
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No qualifying loads booked today
                    </TableCell>
                  </TableRow>
                ) : (
                  qualifyingLoads.map((order) => {
                    const ratePerMile = order.mileage > 0 ? order.totalFreightAmount / order.mileage : 0;
                    const pickupLocation = `${order.pickupCity}, ${order.pickupState}`;
                    const deliveryLocation = `${order.deliveryCity}, ${order.deliveryState}`;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.internalLoadNumber}</TableCell>
                        <TableCell>{order.brokerName}</TableCell>
                        <TableCell>{pickupLocation} → {deliveryLocation}</TableCell>
                        <TableCell className="text-right">${order.totalFreightAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right">{order.mileage.toLocaleString()}</TableCell>
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
      </TabsContent>
      </Tabs>
      </div>
    </div>;
};
export default Analytics;