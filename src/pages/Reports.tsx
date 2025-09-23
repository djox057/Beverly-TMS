import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EditingState {
  truckId: string;
  field: 'status' | 'pickup-address' | 'pickup-date' | 'pickup-time' | 'delivery-address' | 'delivery-date' | 'delivery-time' | 'note';
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

  const handleEdit = (truckId: string, field: 'status' | 'pickup-address' | 'pickup-date' | 'pickup-time' | 'delivery-address' | 'delivery-date' | 'delivery-time' | 'note', currentValue: string) => {
    setEditing({ truckId, field, value: currentValue });
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      
      if (editing.field === 'status') {
        await updateTruckStatus.mutateAsync({ truckId: editing.truckId, status: editing.value.toLowerCase() });
      } else if (editing.field === 'note' && truck?.orderId) {
        await updateOrderNote.mutateAsync({ orderId: truck.orderId, notes: editing.value });
      } else if (editing.field.startsWith('pickup-') && truck?.pickup.id) {
        const currentPickup = truck.pickup;
        const updates: any = { address: currentPickup.address };
        
        if (editing.field === 'pickup-address') {
          updates.address = editing.value;
        } else if (editing.field === 'pickup-date' || editing.field === 'pickup-time') {
          // Combine date and time for datetime update
          const currentDate = currentPickup.date !== '—' ? currentPickup.date : new Date().toLocaleDateString();
          const currentTime = currentPickup.time !== '—' ? currentPickup.time : '00:00';
          
          const newDate = editing.field === 'pickup-date' ? editing.value : currentDate;
          const newTime = editing.field === 'pickup-time' ? editing.value : currentTime;
          
          updates.datetime = new Date(`${newDate} ${newTime}`).toISOString();
        }
        
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.pickup.id,
          ...updates
        });
      } else if (editing.field.startsWith('delivery-') && truck?.delivery.id) {
        const currentDelivery = truck.delivery;
        const updates: any = { address: currentDelivery.address };
        
        if (editing.field === 'delivery-address') {
          updates.address = editing.value;
        } else if (editing.field === 'delivery-date' || editing.field === 'delivery-time') {
          // Combine date and time for datetime update
          const currentDate = currentDelivery.date !== '—' ? currentDelivery.date : new Date().toLocaleDateString();
          const currentTime = currentDelivery.time !== '—' ? currentDelivery.time : '00:00';
          
          const newDate = editing.field === 'delivery-date' ? editing.value : currentDate;
          const newTime = editing.field === 'delivery-time' ? editing.value : currentTime;
          
          updates.datetime = new Date(`${newDate} ${newTime}`).toISOString();
        }
        
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.delivery.id,
          ...updates
        });
      }
      
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace('-', ' ')} has been updated.`,
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

  const renderEditableField = (truckId: string, field: 'status' | 'pickup-address' | 'pickup-date' | 'pickup-time' | 'delivery-address' | 'delivery-date' | 'delivery-time' | 'note', value: string, displayValue?: React.ReactNode) => {
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
          ) : field.includes('date') ? (
            <Input
              type="date"
              value={editing.value}
              onChange={(e) => setEditing({...editing, value: e.target.value})}
              className="w-36"
            />
          ) : field.includes('time') ? (
            <Input
              type="time"
              value={editing.value}
              onChange={(e) => setEditing({...editing, value: e.target.value})}
              className="w-32"
            />
          ) : (
            <Input
              value={editing.value}
              onChange={(e) => setEditing({...editing, value: e.target.value})}
              className="min-w-[150px]"
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
        className="flex items-center gap-2 cursor-pointer group hover:bg-muted/50 p-1 rounded min-h-[2rem]"
        onClick={() => handleEdit(truckId, field, value)}
      >
        <div className="flex-1">
          {displayValue || value || "—"}
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
                      <TableHead>Pickup Address</TableHead>
                      <TableHead>Pickup Date</TableHead>
                      <TableHead>Pickup Time</TableHead>
                      <TableHead>Delivery Address</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead>Delivery Time</TableHead>
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
                          {renderEditableField(truck.id, 'pickup-address', truck.pickup.address)}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'pickup-date', truck.pickup.date)}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'pickup-time', truck.pickup.time)}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'delivery-address', truck.delivery.address)}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'delivery-date', truck.delivery.date)}
                        </TableCell>
                        <TableCell>
                          {renderEditableField(truck.id, 'delivery-time', truck.delivery.time)}
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