import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, FileText, Users, Package, UserCheck, Building2, BarChart3, Plus } from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  { name: "Active Orders", value: "12", icon: FileText, color: "text-primary" },
  { name: "Available Trucks", value: "8", icon: Truck, color: "text-success" },
  { name: "Active Drivers", value: "15", icon: UserCheck, color: "text-accent" },
  { name: "Total Brokers", value: "24", icon: Building2, color: "text-warning" }
];

const recentOrders = [
  { id: "LD-2024-001", truck: "TRK-001", route: "Chicago → Dallas", status: "In Transit" },
  { id: "LD-2024-002", truck: "TRK-002", route: "LA → Denver", status: "Delivered" },
  { id: "LD-2024-003", truck: "TRK-003", route: "Miami → Atlanta", status: "Loading" }
];

const Index = () => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Dispatch Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage your fleet operations efficiently</p>
        </div>
        <Link to="/new-order">
          <Button size="lg">
            <Plus className="mr-2 h-5 w-5" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{order.id}</p>
                    <p className="text-sm text-muted-foreground">{order.truck} • {order.route}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    order.status === 'Delivered' ? 'bg-success/10 text-success' :
                    order.status === 'In Transit' ? 'bg-primary/10 text-primary' :
                    'bg-warning/10 text-warning'
                  }`}>
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
            <Link to="/orders">
              <Button variant="outline" className="w-full mt-4">View All Orders</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link to="/new-order">
                <Button variant="outline" className="w-full h-20 flex-col">
                  <Plus className="h-6 w-6 mb-2" />
                  New Order
                </Button>
              </Link>
              <Link to="/trucks">
                <Button variant="outline" className="w-full h-20 flex-col">
                  <Truck className="h-6 w-6 mb-2" />
                  Manage Trucks
                </Button>
              </Link>
              <Link to="/drivers">
                <Button variant="outline" className="w-full h-20 flex-col">
                  <Users className="h-6 w-6 mb-2" />
                  View Drivers
                </Button>
              </Link>
              <Link to="/reports">
                <Button variant="outline" className="w-full h-20 flex-col">
                  <BarChart3 className="h-6 w-6 mb-2" />
                  Fleet Reports
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
