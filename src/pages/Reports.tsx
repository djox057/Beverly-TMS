import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useReports } from "@/hooks/useReports";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "Loading":
      return <Badge className="bg-warning text-warning-foreground">Loading</Badge>;
    case "Available":
      return <Badge className="bg-success text-success-foreground">Available</Badge>;
    case "Maintenance":
      return <Badge variant="destructive">Maintenance</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const Reports = () => {
  const { data: truckReports, isLoading, error } = useReports();

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
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Dispatcher Fleet Reports</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Real-time fleet status by dispatcher assignment
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Fleet Status by Dispatcher</CardTitle>
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
                {truckReports && truckReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No truck data found
                    </TableCell>
                  </TableRow>
                ) : (
                  truckReports?.map((truck) => (
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

export default Reports;