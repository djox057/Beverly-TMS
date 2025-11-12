import { useDriverData } from "@/hooks/useDriverData";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MapPin, Package } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { formatCurrency } from "@/lib/utils";

export default function DriverOrders() {
  const { data, isLoading } = useDriverData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const activeOrders = data?.orders?.filter((o) => o.status === "in_transit" || o.status === "pending") || [];

  const completedOrders = data?.orders?.filter((o) => o.status === "delivered") || [];

  const OrderCard = ({ order }: { order: any }) => {
    const pickup = order.pickup_drops?.find((pd: any) => pd.type === "pickup");
    const delivery = order.pickup_drops?.find((pd: any) => pd.type === "delivery");

    return (
      <Card className="border-primary/20">
        <CardContent className="pt-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-sm font-medium text-foreground mb-1">Load#{order.load_number}</div>
              <div className="text-xs text-muted-foreground">{order.broker?.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-primary">
                {formatCurrency(Number(order.driver_price || 0))}
              </div>
              <div className="text-xs text-muted-foreground">{order.loaded_miles} mi</div>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <div className="font-medium text-foreground">
                  {pickup?.city}, {pickup?.state}
                </div>
                <div className="text-muted-foreground">
                  {order.pickup_datetime &&
                    (() => {
                      const parsed = parseSimpleDateTime(order.pickup_datetime);
                      const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
                      return format(date, "MMM dd, h:mm a");
                    })()}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <div className="font-medium text-foreground">
                  {delivery?.city}, {delivery?.state}
                </div>
                <div className="text-muted-foreground">
                  {order.delivery_datetime &&
                    (() => {
                      const parsed = parseSimpleDateTime(order.delivery_datetime);
                      const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes);
                      return format(date, "MMM dd, h:mm a");
                    })()}
                </div>
              </div>
            </div>
          </div>

          {order.notes && <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{order.notes}</div>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Loads</h1>
      </header>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="active">Active ({activeOrders.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No active loads</p>
              </CardContent>
            </Card>
          ) : (
            activeOrders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completedOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No completed loads</p>
              </CardContent>
            </Card>
          ) : (
            completedOrders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
