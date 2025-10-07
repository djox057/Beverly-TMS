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
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { state } = useSidebar();

  const handleSignOut = async () => {
    await signOut();
  };

  // Filter navigation based on role
  const getFilteredNavigation = () => {
    // Admin role: all navigation + admin pages (check first!)
    if (hasRole('admin')) {
      return [
        ...navigation,
        { name: "User Management", href: "/admin/users", icon: Settings }
      ];
    }
    
    // Manager role: limited navigation including Analytics
    if (hasRole('manager')) {
      const allowedPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers', '/analytics'];
      return navigation.filter(item => allowedPages.includes(item.href));
    }
    
    // Safety role: specific pages only (New Order, Orders, Trucks, Trailers, Drivers)
    if (hasRole('safety')) {
      const safetyPages = ['/new-order', '/orders', '/trucks', '/trailers', '/drivers'];
      return navigation.filter(item => safetyPages.includes(item.href));
    }
    
    // Dispatch role: all navigation except admin pages and Analytics
    return navigation.filter(item => item.href !== '/analytics');
  };

  const allNavigation = getFilteredNavigation();

  return (
    <SidebarPrimitive>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            {state !== "collapsed" && <SidebarTrigger className="ml-auto" />}
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
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {state !== "collapsed" && <span>{item.name}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Profile & Logout */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
                {state !== "collapsed" && (
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
                size={state === "collapsed" ? "icon" : "sm"}
                className={state === "collapsed" ? "w-8 h-8" : "w-full"}
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                {state !== "collapsed" && <span className="ml-2">Sign Out</span>}
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </SidebarPrimitive>
  );
};