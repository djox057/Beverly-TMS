import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState, useEffect, useRef } from "react";
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

const DEFAULT_COLUMN_WIDTHS = {
  truck: 100,
  driver: 120,
  home: 100,
  status: 120,
  pickupAddress: 180,
  pickupDate: 120,
  pickupTime: 100,
  deliveryAddress: 180,
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
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const { toast } = useToast();

  // Load column widths from localStorage on mount
  useEffect(() => {
    const savedWidths = localStorage.getItem('reports-column-widths');
    if (savedWidths) {
      setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(savedWidths) });
    }
  }, []);

  // Save column widths to localStorage when they change
  useEffect(() => {
    localStorage.setItem('reports-column-widths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  const handleMouseDown = (column: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(column);
    
    const startX = e.clientX;
    const startWidth = columnWidths[column as keyof typeof columnWidths];

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
        <Card>
          <CardHeader>
            <CardTitle>All Dispatchers Fleet Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.truck }}
                    >
                      Dispatcher
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('truck')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.driver }}
                    >
                      Truck #
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('driver')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.home }}
                    >
                      Driver
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('home')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.status }}
                    >
                      Home
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('status')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.pickupAddress }}
                    >
                      Status
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('pickupAddress')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.pickupDate }}
                    >
                      Pickup Address
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('pickupDate')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.pickupTime }}
                    >
                      Pickup Date
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('pickupTime')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.deliveryAddress }}
                    >
                      Pickup Time
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('deliveryAddress')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.deliveryDate }}
                    >
                      Delivery Address
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('deliveryDate')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.deliveryTime }}
                    >
                      Delivery Date
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('deliveryTime')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.away }}
                    >
                      Delivery Time
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('away')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.drive }}
                    >
                      Away (D)
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('drive')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.shift }}
                    >
                      Drive
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('shift')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.cycle }}
                    >
                      Shift
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('cycle')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.note }}
                    >
                      Cycle
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('note')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.lastEdit }}
                    >
                      Note
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('lastEdit')}
                      />
                    </TableHead>
                    <TableHead 
                      className="relative select-none" 
                      style={{ width: columnWidths.date }}
                    >
                      Last Edit
                      <div 
                        className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-border bg-transparent"
                        onMouseDown={handleMouseDown('date')}
                      />
                    </TableHead>
                    <TableHead className="relative select-none">
                      Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(groupedReports || {}).map(([dispatcherId, group]) => 
                    group.trucks.map((truck, index) => (
                      <TableRow key={truck.id}>
                        {index === 0 && (
                          <TableCell 
                            rowSpan={group.trucks.length} 
                            className="font-semibold bg-muted/30 border-r text-center align-middle"
                            style={{ width: columnWidths.truck, writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                          >
                            {group.dispatcher}
                          </TableCell>
                        )}
                        <TableCell className="font-medium" style={{ width: columnWidths.driver }}>
                          {truck.truckNumber}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.home }}>{truck.driver}</TableCell>
                        <TableCell style={{ width: columnWidths.status }}>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {truck.home}
                          </div>
                        </TableCell>
                        <TableCell style={{ width: columnWidths.pickupAddress }}>
                          {renderEditableField(
                            truck.id,
                            'status',
                            truck.status,
                            getStatusBadge(truck.status)
                          )}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.pickupDate }}>
                          {renderEditableField(truck.id, 'pickup-address', truck.pickup.address)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.pickupTime }}>
                          {renderEditableField(truck.id, 'pickup-date', truck.pickup.date)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.deliveryAddress }}>
                          {renderEditableField(truck.id, 'pickup-time', truck.pickup.time)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.deliveryDate }}>
                          {renderEditableField(truck.id, 'delivery-address', truck.delivery.address)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.deliveryTime }}>
                          {renderEditableField(truck.id, 'delivery-date', truck.delivery.date)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.away }}>
                          {renderEditableField(truck.id, 'delivery-time', truck.delivery.time)}
                        </TableCell>
                        <TableCell style={{ width: columnWidths.drive }}>{truck.awayDays}</TableCell>
                        <TableCell style={{ width: columnWidths.shift }}>{truck.driveHours}h</TableCell>
                        <TableCell style={{ width: columnWidths.cycle }}>{truck.shiftHours}h</TableCell>
                        <TableCell style={{ width: columnWidths.note }}>{truck.cycleHours}h</TableCell>
                        <TableCell style={{ width: columnWidths.lastEdit }}>
                          {renderEditableField(truck.id, 'note', truck.note)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" style={{ width: columnWidths.date }}>
                          {truck.lastEdit}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {truck.editDate}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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