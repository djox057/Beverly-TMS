import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface EditingState {
  truckId: string;
  field: 'status' | 'pickup-address' | 'pickup-date' | 'pickup-time' | 'delivery-address' | 'delivery-date' | 'delivery-time' | 'note';
  value: string;
}

const STATUS_COLORS = {
  red: 'bg-red-500',
  cyan: 'bg-cyan-500', 
  orange: 'bg-orange-500',
  'dark-blue': 'bg-blue-900',
  green: 'bg-green-500',
  black: 'bg-black'
};

const getStatusColor = (status: string) => {
  const statusLower = status.toLowerCase().replace(/\s+/g, '-');
  return STATUS_COLORS[statusLower as keyof typeof STATUS_COLORS] || STATUS_COLORS.black;
};

// Column width management
const STORAGE_KEY = 'reports-column-widths';
const DEFAULT_WIDTHS = {
  truck: 80,
  driver: 120,
  dispatcher: 120,
  home: 100,
  status: 80,
  pickupAddress: 200,
  pickupDate: 120,
  pickupTime: 100,
  deliveryAddress: 200,
  deliveryDate: 120,
  deliveryTime: 100,
  away: 80,
  drive: 80,
  shift: 80,
  cycle: 80,
  note: 200,
  lastEdit: 100,
  date: 100
};

const Reports = () => {
  const { data: groupedReports, isLoading, error, updateTruckStatus, updateOrderNote, updatePickupDrop } = useReports();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_WIDTHS;
  });
  const { toast } = useToast();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  // Flatten all trucks from all dispatchers
  const allTrucks = Object.values(groupedReports || {}).flatMap(group => 
    group.trucks.map(truck => ({
      ...truck,
      dispatcherName: group.dispatcher
    }))
  );

  const handleEdit = (truckId: string, field: 'status' | 'pickup-address' | 'pickup-date' | 'pickup-time' | 'delivery-address' | 'delivery-date' | 'delivery-time' | 'note', currentValue: string) => {
    setEditing({ truckId, field, value: currentValue });
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
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
                <SelectItem value="red">Red</SelectItem>
                <SelectItem value="cyan">Cyan</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
                <SelectItem value="dark-blue">Dark Blue</SelectItem>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="black">Black</SelectItem>
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

    if (field === 'status') {
      return (
        <div
          className={`w-full h-8 rounded cursor-pointer flex items-center justify-center text-white font-medium ${getStatusColor(value)}`}
          onClick={() => handleEdit(truckId, field, value)}
        >
          {value || "—"}
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
        <h1 className="text-3xl font-semibold text-foreground">Fleet Reports</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Real-time fleet status - all dispatchers
        </div>
      </div>

      {allTrucks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No trucks with assigned dispatchers found
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              All Trucks ({allTrucks.length} truck{allTrucks.length !== 1 ? 's' : ''})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: `${columnWidths.truck}px` }}>Truck #</TableHead>
                    <TableHead style={{ width: `${columnWidths.driver}px` }}>Driver</TableHead>
                    <TableHead style={{ width: `${columnWidths.dispatcher}px` }}>Dispatcher</TableHead>
                    <TableHead style={{ width: `${columnWidths.home}px` }}>Home</TableHead>
                    <TableHead style={{ width: `${columnWidths.status}px` }}>Status</TableHead>
                    <TableHead style={{ width: `${columnWidths.pickupAddress}px` }}>Pickup Address</TableHead>
                    <TableHead style={{ width: `${columnWidths.pickupDate}px` }}>Pickup Date</TableHead>
                    <TableHead style={{ width: `${columnWidths.pickupTime}px` }}>Pickup Time</TableHead>
                    <TableHead style={{ width: `${columnWidths.deliveryAddress}px` }}>Delivery Address</TableHead>
                    <TableHead style={{ width: `${columnWidths.deliveryDate}px` }}>Delivery Date</TableHead>
                    <TableHead style={{ width: `${columnWidths.deliveryTime}px` }}>Delivery Time</TableHead>
                    <TableHead style={{ width: `${columnWidths.away}px` }}>Away (D)</TableHead>
                    <TableHead style={{ width: `${columnWidths.drive}px` }}>Drive</TableHead>
                    <TableHead style={{ width: `${columnWidths.shift}px` }}>Shift</TableHead>
                    <TableHead style={{ width: `${columnWidths.cycle}px` }}>Cycle</TableHead>
                    <TableHead style={{ width: `${columnWidths.note}px` }}>Note</TableHead>
                    <TableHead style={{ width: `${columnWidths.lastEdit}px` }}>Last Edit</TableHead>
                    <TableHead style={{ width: `${columnWidths.date}px` }}>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTrucks.map((truck) => (
                    <TableRow key={truck.id}>
                      <TableCell className="font-medium">{truck.truckNumber}</TableCell>
                      <TableCell>{truck.driver}</TableCell>
                      <TableCell>{truck.dispatcherName}</TableCell>
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
                          truck.status
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
      )}
    </div>
  );
};

export default Reports;