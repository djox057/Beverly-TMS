import { NavLink } from "react-router-dom";
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
  Warehouse
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  { name: "Loads at the Yard", href: "/yard-loads", icon: Warehouse },
  { name: "Trips", href: "/trips", icon: Route, roles: ['accounting', 'manager', 'admin'] },
  { name: "Trucks", href: "/trucks", icon: Truck },
  { name: "Trailers", href: "/trailers", icon: Package },
  { name: "Drivers", href: "/drivers", icon: UserCheck },
  { name: "Brokers", href: "/brokers", icon: Building2 },
  { name: "Fleets", href: "/fleets", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
];

export const Sidebar = () => {
  const { profile, signOut, hasRole, getPrimaryRole } = useAuthContext();
  const { state, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  
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
    
    // Admin role: all navigation + Alerts + User Management
    if (primaryRole === 'admin') {
      return [
        ...filteredNav,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
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
    
    // Accounting role: all pages except Analytics (financial + operational oversight)
    if (primaryRole === 'accounting') {
      return filteredNav.filter(item => item.href !== '/analytics');
    }
    
    // Safety role: specific pages only (New Load, Loads, Trucks, Trailers, Drivers, Reports, Alerts)
    if (hasRole('safety')) {
      const safetyPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers', '/reports'];
      return [
        ...filteredNav.filter(item => safetyPages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Dispatch role: all navigation except Analytics
    if (primaryRole === 'dispatch') {
      return filteredNav.filter(item => item.href !== '/analytics');
    }
    
    return filteredNav;
  };

  const allNavigation = getFilteredNavigation();

  return (
    <SidebarPrimitive>
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
                          {showText && <span>{item.name}</span>}
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