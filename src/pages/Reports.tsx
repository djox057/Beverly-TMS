import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock, AlertCircle, Loader2, Edit3, Check, X } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EditingState {
  truckId: string;
  field: 'status' | 'pickup' | 'delivery' | 'note';
  value: string;
}

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
  const { data: groupedReports, isLoading, error, updateTruckStatus, updateOrderNote, updatePickupDrop } = useReports();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const { toast } = useToast();

  const handleEdit = (truckId: string, field: 'status' | 'pickup' | 'delivery' | 'note', currentValue: string) => {
    setEditing({ truckId, field, value: currentValue });
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      // Find the truck to get orderId
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      
      if (editing.field === 'status') {
        await updateTruckStatus.mutateAsync({ truckId: editing.truckId, status: editing.value.toLowerCase() });
      } else if (editing.field === 'note' && truck?.orderId) {
        await updateOrderNote.mutateAsync({ orderId: truck.orderId, notes: editing.value });
      }
      // For pickup/delivery updates, we'd need more complex logic to update the pickup_drops table
      
      toast({
        title: "Updated successfully",
        description: `${editing.field} has been updated.`,
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setEditing(null);
  };

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

  const renderEditableField = (truckId: string, field: 'status' | 'pickup' | 'delivery' | 'note', value: string, displayValue?: React.ReactNode) => {
    const isEditing = editing?.truckId === truckId && editing?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          {field === 'status' ? (
            <Select value={editing.value} onValueChange={(value) => setEditing({...editing, value})}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="in_use">In Transit</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          ) : field === 'note' ? (
            <Textarea
              value={editing.value}
              onChange={(e) => setEditing({...editing, value: e.target.value})}
              className="min-h-[60px]"
            />
          ) : (
            <Input
              value={editing.value}
              onChange={(e) => setEditing({...editing, value: e.target.value})}
              className="min-w-[200px]"
            />
          )}
          <div className="flex gap-1">
            <button onClick={handleSave} className="text-green-600 hover:text-green-800">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={handleCancel} className="text-red-600 hover:text-red-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex items-center gap-2 cursor-pointer group hover:bg-muted/50 p-1 rounded"
        onClick={() => handleEdit(truckId, field, value)}
      >
        <div className="flex-1">
          {displayValue || value}
        </div>
        <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50" />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Dispatcher Fleet Reports</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Real-time fleet status by dispatcher assignment
        </div>
      </div>

      {groupedReports && Object.keys(groupedReports).length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No trucks assigned to dispatchers found
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedReports || {}).map(([dispatcherId, group]) => (
          <Card key={dispatcherId}>
            <CardHeader>
              <CardTitle>
                {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? 's' : ''})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck #</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Home</TableHead>
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
                    {group.trucks.map((truck) => (
                      <TableRow key={truck.id}>
                        <TableCell className="font-medium">{truck.truckNumber}</TableCell>
                        <TableCell>{truck.driver}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {truck.home}
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderEditableField(
                            truck.id,
                            'status',
                            truck.status,
                            getStatusBadge(truck.status)
                          )}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(
                            truck.id,
                            'pickup',
                            truck.pickup.address,
                            <div className="text-sm">
                              <div className="max-w-xs truncate">{truck.pickup.address}</div>
                              {truck.pickup.date !== "—" && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {truck.pickup.date} {truck.pickup.time}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(
                            truck.id,
                            'delivery',
                            truck.delivery.address,
                            <div className="text-sm">
                              <div className="max-w-xs truncate">{truck.delivery.address}</div>
                              {truck.delivery.date !== "—" && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {truck.delivery.date} {truck.delivery.time}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{truck.awayDays}</TableCell>
                        <TableCell>{truck.driveHours}h</TableCell>
                        <TableCell>{truck.shiftHours}h</TableCell>
                        <TableCell>{truck.cycleHours}h</TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'note', truck.note)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{truck.lastEdit}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{truck.editDate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default Reports;