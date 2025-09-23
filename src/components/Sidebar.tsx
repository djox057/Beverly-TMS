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
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "New Order", href: "/new-order", icon: Plus },
  { name: "Orders", href: "/orders", icon: FileText },
  { name: "Trucks", href: "/trucks", icon: Truck },
  { name: "Trailers", href: "/trailers", icon: Package },
  { name: "Drivers", href: "/drivers", icon: UserCheck },
  { name: "Brokers", href: "/brokers", icon: Building2 },
  { name: "Fleets", href: "/fleets", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Weekly Report", href: "/weekly-report", icon: Calendar },
];

export const Sidebar = () => {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          Dispatch Manager
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )
            }
          >
            <item.icon className="mr-3 h-4 w-4" />
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};