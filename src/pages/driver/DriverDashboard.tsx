import { useDriverData } from "@/hooks/useDriverData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Truck, Package, MapPin, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { parseSimpleDateTime } from "@/utils/dateUtils";

export default function DriverDashboard() {
  const { data, isLoading } = useDriverData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const activeOrders = data?.orders?.filter(o => o.status === 'in_transit' || o.status === 'pending') || [];
  const completedThisMonth = data?.orders?.filter(o => {
    if (!o.delivery_datetime) return false;
    // Parse without timezone conversion
    const parsed = parseSimpleDateTime(o.delivery_datetime);
    const deliveryDate = new Date(parsed.year, parsed.month - 1, parsed.day);
    const now = new Date();
    return deliveryDate.getMonth() === now.getMonth() && 
           deliveryDate.getFullYear() === now.getFullYear() &&
           o.status === 'delivered';
  }) || [];

  const totalEarnings = completedThisMonth.reduce((sum, order) => 
    sum + (Number(order.driver_price) || 0), 0
  );

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">
          Welcome, {data?.driver?.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data?.truck?.truck_number || 'No truck assigned'}
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Active Loads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {activeOrders.length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              ${totalEarnings.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedThisMonth.length} loads completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Loads */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground mb-3">Active Loads</h2>
        {activeOrders.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No active loads</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const pickup = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
              const delivery = order.pickup_drops?.find((pd: any) => pd.type === 'delivery');
              
              return (
                <Card key={order.id} className="border-primary/20">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-sm font-medium text-foreground mb-1">
                          Load #{order.load_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.broker?.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-primary">
                          ${Number(order.driver_price || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.loaded_miles} mi
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="text-xs">
                          <div className="font-medium text-foreground">{pickup?.city}, {pickup?.state}</div>
                          <div className="text-muted-foreground">
                            {order.pickup_datetime && (() => {
                              const parsed = parseSimpleDateTime(order.pickup_datetime);
                              const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
                              return format(date, 'MMM dd, h:mm a');
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="text-xs">
                          <div className="font-medium text-foreground">{delivery?.city}, {delivery?.state}</div>
                          <div className="text-muted-foreground">
                            {order.delivery_datetime && (() => {
                              const parsed = parseSimpleDateTime(order.delivery_datetime);
                              const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
                              return format(date, 'MMM dd, h:mm a');
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <div className="inline-block px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                        {order.status === 'in_transit' ? 'In Transit' : 'Ready for Pickup'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
