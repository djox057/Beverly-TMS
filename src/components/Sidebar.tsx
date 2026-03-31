import { NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { 
  Truck, 
  FileText, 
  Users, 
  Package, 
  UserCheck, 
  Building2, 
  BarChart3, 
  Calendar,
  Plus,
  LogOut,
  User,
  Settings,
  TrendingUp,
  AlertTriangle,
  Moon,
  Sun,
  Fuel,
  Route,
  Warehouse,
  Bell,
  Wrench,
  UserCircle,
  CreditCard,
  MapPin
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useYardLoadsCount } from "@/hooks/useYardLoadsCount";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { name: "New Load", href: "/new-order", icon: Plus },
  { name: "Loads", href: "/orders", icon: FileText },
  { name: "Loads at the Yard", href: "/yard-loads", icon: Warehouse, roles: ['manager', 'admin', 'chicago_management', 'yard', 'afterhours'] },
  { name: "Trips", href: "/trips", icon: Route, roles: ['accounting', 'manager', 'admin', 'chicago_management', 'safety', 'dispatch'] },
  { name: "Trucks", href: "/trucks", icon: Truck },
  { name: "Trailers", href: "/trailers", icon: Package },
  { name: "Drivers", href: "/drivers", icon: UserCheck },
  { name: "Stuff", href: "/stuff", icon: User, roles: ['manager', 'admin', 'accounting', 'chicago_management'] },
  { name: "Brokers", href: "/brokers", icon: Building2 },
  { name: "Fleets", href: "/fleets", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Problems", href: "/problems", icon: FileText, roles: ['supervisor', 'manager', 'admin'] },
  { name: "Yard Arrivals", href: "/yard-arrivals", icon: Warehouse },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
  { name: "Transfer List", href: "/transfer-list", icon: Users, roles: ['admin', 'manager', 'safety', 'maintenance', 'dispatch', 'afterhours', 'yard'] },
  { name: "Beverly Heatmap", href: "/beverly-heatmap", icon: MapPin, roles: ['manager', 'admin', 'chicago_management'] },
];

export const Sidebar = () => {
  const { profile, signOut, hasRole, getPrimaryRole, user } = useAuthContext();
  const { individualMode, setIndividualMode, canUseIndividualMode } = useIndividualMode();
  const { state, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { data: yardLoadsCount = 0 } = useYardLoadsCount();
  const [isScheduledThisWeekend, setIsScheduledThisWeekend] = useState(false);
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [hasAcknowledgedToday, setHasAcknowledgedToday] = useState(false);
  
  // Get today's date in GMT+1 for acknowledgment storage
  const getTodayGMT1 = () => {
    const now = new Date();
    const gmt1Offset = 1 * 60;
    const localOffset = now.getTimezoneOffset();
    const gmt1Time = new Date(now.getTime() + (localOffset + gmt1Offset) * 60 * 1000);
    return gmt1Time.toISOString().split('T')[0];
  };
  
  // Check if already acknowledged today
  useEffect(() => {
    if (!user?.id) return;
    const acknowledgedDate = localStorage.getItem(`weekend_schedule_ack_${user.id}`);
    const today = getTodayGMT1();
    setHasAcknowledgedToday(acknowledgedDate === today);
  }, [user?.id]);
  
  // Check if user is scheduled this weekend (show bell from Monday to end of Sunday, GMT+1)
  useEffect(() => {
    const checkWeekendSchedule = async () => {
      if (!user?.id) return;
      
      // Get current time in GMT+1
      const now = new Date();
      const gmt1Offset = 1 * 60; // GMT+1 in minutes
      const localOffset = now.getTimezoneOffset();
      const gmt1Time = new Date(now.getTime() + (localOffset + gmt1Offset) * 60 * 1000);
      
      const dayOfWeek = gmt1Time.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      
      // Calculate the upcoming Saturday and Sunday dates
      const daysUntilSaturday = dayOfWeek === 0 ? -1 : 6 - dayOfWeek; // If Sunday, Saturday was yesterday
      const saturday = new Date(gmt1Time);
      saturday.setDate(gmt1Time.getDate() + daysUntilSaturday);
      saturday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      
      // Format dates for query
      const saturdayStr = saturday.toISOString().split('T')[0];
      const sundayStr = sunday.toISOString().split('T')[0];
      
      // Check if user is scheduled for this weekend
      const { data } = await supabase
        .from('afterhours_schedule')
        .select('scheduled_date')
        .eq('user_id', user.id)
        .in('scheduled_date', [saturdayStr, sundayStr]);
      
      if (data && data.length > 0) {
        setIsScheduledThisWeekend(true);
        setScheduledDates(data.map(d => d.scheduled_date));
      } else {
        setIsScheduledThisWeekend(false);
        setScheduledDates([]);
      }
    };
    
    checkWeekendSchedule();
  }, [user?.id]);
  
  const handleBellClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowAcknowledgeDialog(true);
  };
  
  const handleAcknowledge = () => {
    if (!user?.id) return;
    const today = getTodayGMT1();
    localStorage.setItem(`weekend_schedule_ack_${user.id}`, today);
    setHasAcknowledgedToday(true);
    setShowAcknowledgeDialog(false);
  };
  
  // Format scheduled dates for display
  const formatScheduledDates = () => {
    return scheduledDates.map(dateStr => {
      const date = new Date(dateStr + 'T00:00:00');
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      return `${dayName}, ${formattedDate}`;
    }).join(' and ');
  };
  
  // On mobile, always show text when sidebar is open
  const showText = isMobile ? true : state !== "collapsed";

  const handleSignOut = async () => {
    await signOut();
  };

  // Filter navigation based on role
  const getFilteredNavigation = () => {
    const primaryRole = getPrimaryRole();
    
    // Filter out items based on role restrictions
    const filteredNav = navigation.filter(item => {
      // If item has role restrictions, check if user has one of those roles
      if (item.roles && item.roles.length > 0) {
        return item.roles.some(role => hasRole(role as any));
      }
      
      return true;
    });
    
    // Admin role: all navigation + Alerts + Maintenance and Repairs + Fuel Reports + EFS Requests + User Management
    if (primaryRole === 'admin') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "Maintenance and Repairs", href: "/repairs", icon: Wrench },
        { name: "Fuel Reports", href: "/fuel-reports", icon: Fuel },
        { name: "EFS Requests", href: "/efs-requests", icon: CreditCard },
        { name: "User Management", href: "/admin/users", icon: Settings }
      ];
    }
    
    // Manager role: all pages + Alerts + Maintenance and Repairs (full operational access)
    if (primaryRole === 'manager') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "Maintenance and Repairs", href: "/repairs", icon: Wrench },
        { name: "Fuel Reports", href: "/fuel-reports", icon: Fuel },
        { name: "EFS Requests", href: "/efs-requests", icon: CreditCard }
      ];
    }
    
    // Supervisor role: all pages + Alerts (full access)
    if (primaryRole === 'supervisor') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Chicago Management role: all pages + Alerts + Maintenance and Repairs + Fuel Reports + EFS Requests (view-only access to everything)
    if (primaryRole === 'chicago_management') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "Maintenance and Repairs", href: "/repairs", icon: Wrench },
        { name: "Fuel Reports", href: "/fuel-reports", icon: Fuel },
        { name: "EFS Requests", href: "/efs-requests", icon: CreditCard }
      ];
    }
    
    // Accounting role: all pages except Analytics + Maintenance and Repairs + Fuel Reports + EFS Requests (financial + operational oversight)
    if (primaryRole === 'accounting') {
      return [
        ...filteredNav.filter(item => item.href !== '/analytics' && item.href !== '/beverly-heatmap'),
        { name: "Maintenance and Repairs", href: "/repairs", icon: Wrench },
        { name: "Fuel Reports", href: "/fuel-reports", icon: Fuel },
        { name: "EFS Requests", href: "/efs-requests", icon: CreditCard }
      ];
    }
    
    // Safety role: specific pages only (New Load, Loads, Trucks, Trailers, Drivers, Reports, Yard Arrivals, Trips, Fleets, Alerts)
    if (hasRole('safety')) {
      const safetyPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers', '/reports', '/yard-arrivals', '/trips', '/fleets', '/transfer-list'];
      return [
        ...filteredNav.filter(item => safetyPages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Maintenance role: specific pages (New Load, Loads, Drivers, Trucks, Trailers, Fleets, Reports, Yard Arrivals, Alerts, Maintenance and Repairs, Fuel Reports)
    if (hasRole('maintenance')) {
      const maintenancePages = ['/new-order', '/orders', '/drivers', '/trucks', '/trailers', '/fleets', '/reports', '/yard-arrivals', '/transfer-list'];
      return [
        ...filteredNav.filter(item => maintenancePages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "Maintenance and Repairs", href: "/repairs", icon: Wrench },
        { name: "Fuel Reports", href: "/fuel-reports", icon: Fuel }
      ];
    }
    
    // Yard role: only Loads at Yard, Trucks, Trailers, Drivers, Yard Arrivals
    if (hasRole('yard')) {
      const yardPages = ['/yard-loads', '/trucks', '/trailers', '/drivers', '/yard-arrivals', '/transfer-list'];
      return filteredNav.filter(item => yardPages.includes(item.href));
    }
    
    // Dispatch and Afterhours roles: all navigation + EFS Requests
    if (primaryRole === 'dispatch' || primaryRole === 'afterhours') {
      return [
        ...filteredNav,
        { name: "EFS Requests", href: "/efs-requests", icon: CreditCard }
      ];
    }
    
    return filteredNav;
  };

  const allNavigation = getFilteredNavigation();

  return (
    <SidebarPrimitive className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            {showText && <SidebarTrigger className="ml-auto" />}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {allNavigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.href}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all relative",
                          isActive
                            ? "text-foreground bg-muted"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                          )}
                          <item.icon className={cn("h-4 w-4", !showText ? "mx-auto" : "")} />
                          {showText && (
                            <div className="flex items-center gap-2 flex-1">
                              <span>{item.name}</span>
                              {item.href === "/yard-loads" && yardLoadsCount > 0 && (
                                <Badge variant="secondary" className="ml-auto">
                                  {yardLoadsCount}
                                </Badge>
                              )}
                              {item.href === "/fleets" && isScheduledThisWeekend && !hasAcknowledgedToday && (
                                <Bell 
                                  className="h-4 w-4 ml-auto text-amber-500 animate-pulse cursor-pointer hover:text-amber-400" 
                                  onClick={handleBellClick}
                                />
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Theme Toggle & User Profile */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            {/* Individual Mode Toggle - Only for dispatch/afterhours */}
            {canUseIndividualMode && (
              <div className="px-4 py-3 border-t border-border">
                <div className="flex items-center justify-between gap-3">
                  {showText ? (
                    <>
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="individual-toggle" className="text-sm font-medium cursor-pointer">
                          Individual
                        </Label>
                      </div>
                      <Switch
                        id="individual-toggle"
                        checked={individualMode}
                        onCheckedChange={setIndividualMode}
                      />
                    </>
                  ) : (
                    <Button
                      variant={individualMode ? "default" : "ghost"}
                      size="icon"
                      className="w-8 h-8 mx-auto"
                      onClick={() => setIndividualMode(!individualMode)}
                    >
                      <UserCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            {/* Theme Toggle */}
            <div className="px-4 py-3 border-t border-border">
              <div className="flex items-center justify-between gap-3">
                {showText ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="theme-toggle" className="text-sm font-medium cursor-pointer">
                        Dark Mode
                      </Label>
                    </div>
                    <Switch
                      id="theme-toggle"
                      checked={theme === "dark"}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 mx-auto"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "dark" ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <Sun className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            {/* User Profile & Logout */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
                {showText && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {profile?.full_name || profile?.email || 'User'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {getPrimaryRole() || 'dispatch'}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
              <Button 
                variant="outline" 
                size={!showText ? "icon" : "sm"}
                className={!showText ? "w-8 h-8" : "w-full"}
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                {showText && <span className="ml-2">Sign Out</span>}
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      {/* Weekend Schedule Acknowledgment Dialog */}
      <AlertDialog open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weekend Schedule Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              You are scheduled to work on <span className="font-medium text-foreground">{formatScheduledDates()}</span>. Please confirm that you are aware of your schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcknowledge}>
              I'm aware
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarPrimitive>
  );
};