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
  Sun
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
  { name: "New Order", href: "/new-order", icon: Plus },
  { name: "Orders", href: "/orders", icon: FileText },
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
    
    // Accounting role: exclude Analytics, but include Reports
    if (primaryRole === 'accounting') {
      return navigation.filter(item => 
        item.href !== '/analytics'
      );
    }

    // Admin role: all navigation + User Management page + Alerts
    if (primaryRole === 'admin') {
      return [
        ...navigation,
        { name: "Alerts", href: "/alerts", icon: AlertTriangle },
        { name: "User Management", href: "/admin/users", icon: Settings }
      ];
    }
    
    // Manager role: all navigation except User Management (same as admin minus user management)
    if (hasRole('manager')) {
      return navigation;
    }
    
    // Supervisor role: all navigation except User Management and Analytics has filtered view
    if (hasRole('supervisor')) {
      return navigation;
    }
    
    // Safety role: specific pages only (New Order, Orders, Trucks, Trailers, Drivers, Alerts)
    if (hasRole('safety')) {
      const safetyPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers'];
      return [
        ...navigation.filter(item => safetyPages.includes(item.href)),
        { name: "Alerts", href: "/alerts", icon: AlertTriangle }
      ];
    }
    
    // Dispatch role: all navigation except Analytics
    return navigation.filter(item => item.href !== '/analytics');
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