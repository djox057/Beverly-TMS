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
  Route,
  Warehouse,
  Bell
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useYardLoadsCount } from "@/hooks/useYardLoadsCount";
import { supabase } from "@/integrations/supabase/client";
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
  { name: "Loads at the Yard", href: "/yard-loads", icon: Warehouse, roles: ['manager', 'admin', 'chicago_management', 'yard'] },
  { name: "Trips", href: "/trips", icon: Route, roles: ['accounting', 'manager', 'admin', 'chicago_management'] },
  { name: "Trucks", href: "/trucks", icon: Truck },
  { name: "Trailers", href: "/trailers", icon: Package },
  { name: "Drivers", href: "/drivers", icon: UserCheck },
  { name: "Brokers", href: "/brokers", icon: Building2 },
  { name: "Fleets", href: "/fleets", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Yard Arrivals", href: "/yard-arrivals", icon: Warehouse },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
];

export const Sidebar = () => {
  const { profile, signOut, hasRole, getPrimaryRole, user } = useAuthContext();
  const { state, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { data: yardLoadsCount = 0 } = useYardLoadsCount();
  const [isScheduledThisWeekend, setIsScheduledThisWeekend] = useState(false);
  
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
        .select('id')
        .eq('user_id', user.id)
        .in('scheduled_date', [saturdayStr, sundayStr])
        .limit(1);
      
      setIsScheduledThisWeekend(data && data.length > 0);
    };
    
    checkWeekendSchedule();
  }, [user?.id]);
  
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
    
    // Admin role: all navigation + Alerts + User Management + Data Management
    if (primaryRole === 'admin') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "Data Management", href: "/data-management", icon: Settings },
        { name: "User Management", href: "/admin/users", icon: Settings }
      ];
    }
    
    // Manager role: all pages + Alerts (full operational access)
    if (primaryRole === 'manager') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Supervisor role: all pages + Alerts (full access)
    if (primaryRole === 'supervisor') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Chicago Management role: all pages + Alerts (view-only access to everything)
    if (primaryRole === 'chicago_management') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Accounting role: all pages except Analytics (financial + operational oversight)
    if (primaryRole === 'accounting') {
      return filteredNav.filter(item => item.href !== '/analytics');
    }
    
    // Safety role: specific pages only (New Load, Loads, Trucks, Trailers, Drivers, Reports, Yard Arrivals, Alerts)
    if (hasRole('safety')) {
      const safetyPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers', '/reports', '/yard-arrivals'];
      return [
        ...filteredNav.filter(item => safetyPages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Maintenance role: specific pages (New Load, Loads, Drivers, Trucks, Trailers, Reports, Yard Arrivals, Alerts)
    if (hasRole('maintenance')) {
      const maintenancePages = ['/new-order', '/orders', '/drivers', '/trucks', '/trailers', '/reports', '/yard-arrivals'];
      return [
        ...filteredNav.filter(item => maintenancePages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Yard role: only Loads at Yard, Trucks, Trailers, Drivers, Yard Arrivals
    if (hasRole('yard')) {
      const yardPages = ['/yard-loads', '/trucks', '/trailers', '/drivers', '/yard-arrivals'];
      return filteredNav.filter(item => yardPages.includes(item.href));
    }
    
    // Dispatch role: all navigation
    if (primaryRole === 'dispatch') {
      return filteredNav;
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
                              {item.href === "/fleets" && isScheduledThisWeekend && (
                                <Bell className="h-4 w-4 ml-auto text-amber-500 animate-pulse" />
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
    </SidebarPrimitive>
  );
};