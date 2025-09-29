import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, FileText, Users, Package, UserCheck, Building2, BarChart3, Plus, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useDashboardStats, useRecentOrders } from "@/hooks/useDashboard";

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'bg-success/10 text-success';
    case 'in_transit':
    case 'pending':
      return 'bg-primary/10 text-primary';
    case 'loading':
      return 'bg-warning/10 text-warning';
    default:
      return 'bg-muted/10 text-muted-foreground';
  }
};

const formatStatus = (status: string) => {
  return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const Index = () => {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentOrders, isLoading: ordersLoading } = useRecentOrders();

  const statItems = [
    { name: "Active Orders", value: stats?.activeOrders?.toString() || "0", icon: FileText, color: "text-primary" },
    { name: "Available Trucks", value: stats?.availableTrucks?.toString() || "0", icon: Truck, color: "text-success" },
    { name: "Active Drivers", value: stats?.activeDrivers?.toString() || "0", icon: UserCheck, color: "text-accent" },
    { name: "Total Brokers", value: stats?.totalBrokers?.toString() || "0", icon: Building2, color: "text-warning" }
  ];

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
        {statItems.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                  {statsLoading ? (
                    <div className="flex items-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <p className="text-3xl font-bold">{stat.value}</p>
                  )}
                </div>
                <stat.icon className={`h-0.05 w-0.05 ${stat.color}`} />
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
            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders && recentOrders.length > 0 ? (
                  recentOrders.map((order) => {
                    const route = [
                      order.pickup_city && order.pickup_state ? `${order.pickup_city}, ${order.pickup_state}` : order.pickup_address?.substring(0, 20) + '...',
                      order.delivery_city && order.delivery_state ? `${order.delivery_city}, ${order.delivery_state}` : order.delivery_address?.substring(0, 20) + '...'
                    ].filter(Boolean).join(' → ');

                    return (
                      <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{order.load_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {order.truck_number || 'Unassigned'} • {route || 'Route not specified'}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {formatStatus(order.status)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted-foreground py-4">No recent orders found</p>
                )}
              </div>
            )}
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
