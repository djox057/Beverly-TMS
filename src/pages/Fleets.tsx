import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Truck, User, Package2, Loader2, Edit, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFleets, useUpdateFleetStatus, useUpdateFleetNote, useUpdatePickupDelivery } from "@/hooks/useFleets";

interface EditState {
  id: string | null;
  field: string | null;
  value: string;
}

const getStatusBadge = (status: string) => {
  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case "in_transit":
    case "in transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "pending":
    case "loading":
      return <Badge className="bg-warning text-warning-foreground">Loading</Badge>;
    case "available":
      return <Badge className="bg-success text-success-foreground">Available</Badge>;
    case "maintenance":
      return <Badge variant="destructive">Maintenance</Badge>;
    case "delivered":
      return <Badge className="bg-info text-info-foreground">Delivered</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const Fleets = () => {
  const { data: fleetData, isLoading, error } = useFleets();
  const updateStatus = useUpdateFleetStatus();
  const updateNote = useUpdateFleetNote();
  const updatePickupDelivery = useUpdatePickupDelivery();
  
  const [editState, setEditState] = useState<EditState>({
    id: null,
    field: null,
    value: ""
  });

  const handleEdit = (id: string, field: string, currentValue: string) => {
    setEditState({
      id,
      field,
      value: currentValue
    });
  };

  const handleSave = async (fleet: any) => {
    if (!editState.id || !editState.field) return;

    try {
      switch (editState.field) {
        case 'status':
          await updateStatus.mutateAsync({
            truckId: fleet.id,
            orderId: fleet.orderId,
            status: editState.value
          });
          break;
        case 'note':
          if (fleet.orderId) {
            await updateNote.mutateAsync({
              orderId: fleet.orderId,
              note: editState.value
            });
          }
          break;
        case 'pickup':
          if (fleet.orderId) {
            await updatePickupDelivery.mutateAsync({
              orderId: fleet.orderId,
              type: 'pickup',
              address: editState.value
            });
          }
          break;
        case 'delivery':
          if (fleet.orderId) {
            await updatePickupDelivery.mutateAsync({
              orderId: fleet.orderId,
              type: 'delivery',
              address: editState.value
            });
          }
          break;
      }
      setEditState({ id: null, field: null, value: "" });
    } catch (error) {
      console.error("Failed to update:", error);
    }
  };

  const handleCancel = () => {
    setEditState({ id: null, field: null, value: "" });
  };

  const isEditing = (id: string, field: string) => {
    return editState.id === id && editState.field === field;
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
          Error loading fleet data: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Fleet Management</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" />
          {fleetData?.length || 0} Active Vehicles
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Trucks</CardTitle>
            <Truck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {fleetData?.filter(f => f.status === 'available').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Package2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {fleetData?.filter(f => f.status === 'in_transit' || f.status === 'pending').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
            <User className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-info">
              {fleetData?.filter(f => f.driver !== "Unassigned").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Trailer</TableHead>
                  <TableHead>Fleet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pickup Location</TableHead>
                  <TableHead>Delivery Location</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fleetData && fleetData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No fleet data found
                    </TableCell>
                  </TableRow>
                ) : (
                  fleetData?.map((fleet) => (
                    <TableRow key={fleet.id}>
                      <TableCell className="font-medium">{fleet.truckNumber}</TableCell>
                      <TableCell>{fleet.driver}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{fleet.trailer}</div>
                          {fleet.trailerType !== "—" && (
                            <div className="text-muted-foreground text-xs">{fleet.trailerType}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{fleet.fleetAssignment}</TableCell>
                      
                      {/* Editable Status */}
                      <TableCell>
                        {isEditing(fleet.id, 'status') ? (
                          <div className="flex items-center gap-2">
                            <Select value={editState.value} onValueChange={(value) => setEditState(prev => ({ ...prev, value }))}>
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="available">Available</SelectItem>
                                <SelectItem value="pending">Loading</SelectItem>
                                <SelectItem value="in_transit">In Transit</SelectItem>
                                <SelectItem value="delivered">Delivered</SelectItem>
                                <SelectItem value="maintenance">Maintenance</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" onClick={() => handleSave(fleet)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancel}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="flex items-center gap-2 cursor-pointer group"
                            onClick={() => handleEdit(fleet.id, 'status', fleet.status)}
                          >
                            {getStatusBadge(fleet.status)}
                            <Edit className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          </div>
                        )}
                      </TableCell>

                      {/* Editable Pickup */}
                      <TableCell>
                        {isEditing(fleet.id, 'pickup') ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editState.value}
                              onChange={(e) => setEditState(prev => ({ ...prev, value: e.target.value }))}
                              className="min-w-32"
                              placeholder="Pickup address"
                            />
                            <Button size="sm" onClick={() => handleSave(fleet)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancel}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="max-w-xs truncate cursor-pointer group flex items-center gap-2"
                            onClick={() => handleEdit(fleet.id, 'pickup', fleet.pickup)}
                          >
                            <span>{fleet.pickup}</span>
                            {fleet.orderId && <Edit className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </div>
                        )}
                      </TableCell>

                      {/* Editable Delivery */}
                      <TableCell>
                        {isEditing(fleet.id, 'delivery') ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editState.value}
                              onChange={(e) => setEditState(prev => ({ ...prev, value: e.target.value }))}
                              className="min-w-32"
                              placeholder="Delivery address"
                            />
                            <Button size="sm" onClick={() => handleSave(fleet)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancel}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="max-w-xs truncate cursor-pointer group flex items-center gap-2"
                            onClick={() => handleEdit(fleet.id, 'delivery', fleet.delivery)}
                          >
                            <span>{fleet.delivery}</span>
                            {fleet.orderId && <Edit className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </div>
                        )}
                      </TableCell>

                      {/* Editable Notes */}
                      <TableCell>
                        {isEditing(fleet.id, 'note') ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editState.value}
                              onChange={(e) => setEditState(prev => ({ ...prev, value: e.target.value }))}
                              className="min-w-32"
                              placeholder="Add note..."
                            />
                            <Button size="sm" onClick={() => handleSave(fleet)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancel}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="max-w-xs truncate cursor-pointer group flex items-center gap-2"
                            onClick={() => handleEdit(fleet.id, 'note', fleet.note)}
                          >
                            <span>{fleet.note || "Click to add note..."}</span>
                            {fleet.orderId && <Edit className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </div>
                        )}
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

export default Fleets;