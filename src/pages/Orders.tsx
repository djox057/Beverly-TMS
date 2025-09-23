import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Edit } from "lucide-react";

// Sample data
const orders = [
  {
    id: 1,
    truckNumber: "TRK-001",
    loadNumber: "LD-2024-001",
    pickupDate: "2024-01-15",
    pickupCity: "Chicago",
    pickupState: "IL",
    deliveryDate: "2024-01-17",
    deliveryCity: "Dallas",
    deliveryState: "TX",
    mileage: 925,
    driverPrice: 1850,
    driverName: "John Smith",
    brokerName: "ABC Logistics",
    brokerLoadNumber: "ABC-001",
    status: "In Transit",
    freightAmount: 2500,
    notes: "Special handling required",
    bookedBy: "Sarah Johnson"
  },
  {
    id: 2,
    truckNumber: "TRK-002",
    loadNumber: "LD-2024-002",
    pickupDate: "2024-01-16",
    pickupCity: "Los Angeles",
    pickupState: "CA",
    deliveryDate: "2024-01-19",
    deliveryCity: "Denver",
    deliveryState: "CO",
    mileage: 1015,
    driverPrice: 2030,
    driverName: "Mike Johnson",
    brokerName: "XYZ Transport",
    brokerLoadNumber: "XYZ-445",
    status: "Delivered",
    freightAmount: 2800,
    notes: "Delivered on time",
    bookedBy: "Tom Wilson"
  },
  {
    id: 3,
    truckNumber: "TRK-003",
    loadNumber: "LD-2024-003",
    pickupDate: "2024-01-18",
    pickupCity: "Miami",
    pickupState: "FL",
    deliveryDate: "2024-01-20",
    deliveryCity: "Atlanta",
    deliveryState: "GA",
    mileage: 650,
    driverPrice: 1300,
    driverName: "David Wilson",
    brokerName: "QuickMove Inc",
    brokerLoadNumber: "QM-789",
    status: "Pending",
    freightAmount: 1800,
    notes: "Waiting for dispatch",
    bookedBy: "Lisa Brown"
  }
];

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
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.truckNumber}</TableCell>
                    <TableCell>{order.loadNumber}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{order.pickupCity}, {order.pickupState}</div>
                        <div className="text-muted-foreground">{order.pickupDate}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{order.deliveryCity}, {order.deliveryState}</div>
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
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;