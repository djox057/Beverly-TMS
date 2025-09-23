import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Edit, Loader2 } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useState } from "react";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Delivered":
      return <Badge className="bg-success text-success-foreground">Delivered</Badge>;
    case "In Transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "Pending":
      return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const Orders = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const {
    data: orders,
    isLoading,
    error
  } = useOrders();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-destructive">Error loading orders: {error.message}</p>
        </div>
      </div>
    );
  }

  // Filter orders based on search term
  const filteredOrders = orders?.filter(order =>
    order.loadNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.brokerName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Orders</h1>
        <Button>
          <FileText className="mr-2 h-4 w-4" />
          New Order
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Orders</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search orders..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Load #</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Miles</TableHead>
                  <TableHead>Driver Price</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Freight</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Booked By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.truckNumber}</TableCell>
                      <TableCell>{order.loadNumber}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{order.pickupCity}</div>
                          <div className="text-muted-foreground">{order.pickupDate}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{order.deliveryCity}</div>
                          <div className="text-muted-foreground">{order.deliveryDate}</div>
                        </div>
                      </TableCell>
                      <TableCell>{order.mileage.toLocaleString()}</TableCell>
                      <TableCell>${order.driverPrice.toLocaleString()}</TableCell>
                      <TableCell>{order.driverName}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{order.brokerName}</div>
                          <div className="text-muted-foreground">{order.brokerLoadNumber}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>${order.freightAmount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-xs truncate">{order.notes}</TableCell>
                      <TableCell>{order.bookedBy}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;