import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Clock, AlertCircle } from "lucide-react";

const truckReports = [
  {
    id: 1,
    truckNumber: "TRK-001",
    driver: "John Smith",
    home: "Chicago, IL",
    dispatch: "Sarah Johnson",
    status: "In Transit",
    pickup: {
      address: "123 Industrial Blvd, Chicago, IL",
      date: "2024-01-15",
      time: "08:00"
    },
    delivery: {
      address: "456 Commerce St, Dallas, TX",
      date: "2024-01-17",
      time: "14:00"
    },
    awayDays: 2,
    driveHours: 8.5,
    shiftHours: 10,
    cycleHours: 45,
    note: "On schedule",
    lastEdit: "2024-01-15 10:30",
    editDate: "2024-01-15"
  },
  {
    id: 2,
    truckNumber: "TRK-002",
    driver: "David Wilson",
    home: "Denver, CO",
    dispatch: "Tom Wilson",
    status: "Loading",
    pickup: {
      address: "789 Warehouse Way, Los Angeles, CA", 
      date: "2024-01-16",
      time: "06:00"
    },
    delivery: {
      address: "321 Distribution Dr, Denver, CO",
      date: "2024-01-19",
      time: "16:00"
    },
    awayDays: 1,
    driveHours: 2.0,
    shiftHours: 4,
    cycleHours: 12,
    note: "Delayed at pickup",
    lastEdit: "2024-01-16 11:15",
    editDate: "2024-01-16"
  },
  {
    id: 3,
    truckNumber: "TRK-003",
    driver: "Robert Brown",
    home: "Phoenix, AZ",
    dispatch: "Lisa Brown",
    status: "Available",
    pickup: {
      address: "—",
      date: "—",
      time: "—"
    },
    delivery: {
      address: "—",
      date: "—",
      time: "—"
    },
    awayDays: 0,
    driveHours: 0,
    shiftHours: 0,
    cycleHours: 8,
    note: "Ready for dispatch",
    lastEdit: "2024-01-15 16:45",
    editDate: "2024-01-15"
  }
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "Loading":
      return <Badge className="bg-warning text-warning-foreground">Loading</Badge>;
    case "Available":
      return <Badge className="bg-success text-success-foreground">Available</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const Reports = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Fleet Reports</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Drive, Shift, and Cycle data from Tracking Transit US API
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Fleet Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Home</TableHead>
                  <TableHead>Dispatch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Away (D)</TableHead>
                  <TableHead>Drive</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Last Edit</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {truckReports.map((truck) => (
                  <TableRow key={truck.id}>
                    <TableCell className="font-medium">{truck.truckNumber}</TableCell>
                    <TableCell>{truck.driver}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {truck.home}
                      </div>
                    </TableCell>
                    <TableCell>{truck.dispatch}</TableCell>
                    <TableCell>{getStatusBadge(truck.status)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="max-w-xs truncate">{truck.pickup.address}</div>
                        {truck.pickup.date !== "—" && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {truck.pickup.date} {truck.pickup.time}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="max-w-xs truncate">{truck.delivery.address}</div>
                        {truck.delivery.date !== "—" && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {truck.delivery.date} {truck.delivery.time}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{truck.awayDays}</TableCell>
                    <TableCell>{truck.driveHours}h</TableCell>
                    <TableCell>{truck.shiftHours}h</TableCell>
                    <TableCell>{truck.cycleHours}h</TableCell>
                    <TableCell className="max-w-xs truncate">{truck.note}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{truck.lastEdit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{truck.editDate}</TableCell>
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

export default Reports;