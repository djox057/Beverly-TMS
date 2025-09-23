import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, FileText, Edit, Loader2 } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useCompanies } from "@/hooks/useCompanies";
import { useTrucks } from "@/hooks/useTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { useBrokers } from "@/hooks/useBrokers";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const {
    data: orders,
    isLoading,
    error,
    refetch
  } = useOrders();
  
  const { data: companies } = useCompanies();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const { data: brokers } = useBrokers();

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
    order.internalLoadNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                  <TableHead>Pickup Date</TableHead>
                  <TableHead>Pickup City</TableHead>
                  <TableHead>Pickup State</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Delivery City</TableHead>
                  <TableHead>Delivery State</TableHead>
                  <TableHead>Miles</TableHead>
                  <TableHead>Driver Price</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Broker Name</TableHead>
                  <TableHead>Broker Load #</TableHead>
                  <TableHead>Invoiced</TableHead>
                  <TableHead>Freight</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Booked By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={19} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.truckNumber}</TableCell>
                      <TableCell>{order.internalLoadNumber}</TableCell>
                      <TableCell>{order.pickupDate}</TableCell>
                      <TableCell>{order.pickupCity}</TableCell>
                      <TableCell>{order.pickupState}</TableCell>
                      <TableCell>{order.deliveryDate}</TableCell>
                      <TableCell>{order.deliveryCity}</TableCell>
                      <TableCell>{order.deliveryState}</TableCell>
                      <TableCell>{order.mileage.toLocaleString()}</TableCell>
                      <TableCell>${order.driverPrice.toLocaleString()}</TableCell>
                      <TableCell>{order.driverName}</TableCell>
                      <TableCell>{order.brokerName}</TableCell>
                      <TableCell>{order.brokerLoadNumber}</TableCell>
                      <TableCell>{order.invoiced}</TableCell>
                      <TableCell>${order.freightAmount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-xs truncate">{order.notes}</TableCell>
                      <TableCell>{order.companyName}</TableCell>
                      <TableCell>{order.bookedBy}</TableCell>
                      <TableCell>
                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setEditingOrder(order);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <EditOrderDialog 
                            order={editingOrder}
                            companies={companies || []}
                            trucks={trucks || []}
                            drivers={drivers || []}
                            brokers={brokers || []}
                            onClose={() => setIsEditDialogOpen(false)}
                            onSave={async (updatedOrder) => {
                              try {
                                const { error } = await supabase
                                  .from('orders')
                                  .update({
                                    freight_amount: updatedOrder.freightAmount,
                                    driver_price: updatedOrder.driverPrice,
                                    mileage: updatedOrder.mileage,
                                    notes: updatedOrder.notes,
                                    booked_by: updatedOrder.bookedBy,
                                    invoiced: updatedOrder.invoiced === 'Done',
                                    company_id: updatedOrder.companyId,
                                    truck_id: updatedOrder.truckId,
                                    driver1_id: updatedOrder.driverId,
                                    broker_id: updatedOrder.brokerId,
                                    broker_load_number: updatedOrder.brokerLoadNumber
                                  })
                                  .eq('id', updatedOrder.id);
                                
                                if (error) throw error;
                                
                                toast({
                                  title: "Success",
                                  description: "Order updated successfully",
                                });
                                
                                refetch();
                                setIsEditDialogOpen(false);
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to update order",
                                  variant: "destructive",
                                });
                              }
                            }}
                          />
                        </Dialog>
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

const EditOrderDialog = ({ order, companies, trucks, drivers, brokers, onSave, onClose }: {
  order: any;
  companies: any[];
  trucks: any[];
  drivers: any[];
  brokers: any[];
  onSave: (order: any) => void;
  onClose: () => void;
}) => {
  const [formData, setFormData] = useState({
    freightAmount: order?.freightAmount || 0,
    driverPrice: order?.driverPrice || 0,
    mileage: order?.mileage || 0,
    notes: order?.notes || '',
    bookedBy: order?.bookedBy || '',
    invoiced: order?.invoiced || '',
    companyId: companies.find(c => c.name === order?.companyName)?.id || '',
    truckId: trucks.find(t => t.truck_number === order?.truckNumber)?.id || '',
    driverId: drivers.find(d => d.name === order?.driverName)?.id || '',
    brokerId: brokers.find(b => b.name === order?.brokerName)?.id || '',
    brokerLoadNumber: order?.brokerLoadNumber || ''
  });

  if (!order) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: order.id
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Order</DialogTitle>
        <DialogDescription>
          Update order details for Load #{order.internalLoadNumber}
        </DialogDescription>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Select 
              value={formData.companyId} 
              onValueChange={(value) => setFormData({...formData, companyId: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="truck">Truck</Label>
            <Select 
              value={formData.truckId} 
              onValueChange={(value) => setFormData({...formData, truckId: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select truck" />
              </SelectTrigger>
              <SelectContent>
                {trucks.map((truck) => (
                  <SelectItem key={truck.id} value={truck.id}>
                    {truck.truck_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver">Driver</Label>
            <Select 
              value={formData.driverId} 
              onValueChange={(value) => setFormData({...formData, driverId: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broker">Broker</Label>
            <Select 
              value={formData.brokerId} 
              onValueChange={(value) => setFormData({...formData, brokerId: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent>
                {brokers.map((broker) => (
                  <SelectItem key={broker.id} value={broker.id}>
                    {broker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brokerLoadNumber">Broker Load #</Label>
            <Input
              id="brokerLoadNumber"
              value={formData.brokerLoadNumber}
              onChange={(e) => setFormData({...formData, brokerLoadNumber: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiced">Invoiced</Label>
            <Select 
              value={formData.invoiced} 
              onValueChange={(value) => setFormData({...formData, invoiced: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Not Invoiced</SelectItem>
                <SelectItem value="Done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="freightAmount">Freight Amount</Label>
            <Input
              id="freightAmount"
              type="number"
              value={formData.freightAmount}
              onChange={(e) => setFormData({...formData, freightAmount: Number(e.target.value)})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="driverPrice">Driver Price</Label>
            <Input
              id="driverPrice"
              type="number"
              value={formData.driverPrice}
              onChange={(e) => setFormData({...formData, driverPrice: Number(e.target.value)})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mileage">Mileage</Label>
            <Input
              id="mileage"
              type="number"
              value={formData.mileage}
              onChange={(e) => setFormData({...formData, mileage: Number(e.target.value)})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookedBy">Booked By</Label>
            <Input
              id="bookedBy"
              value={formData.bookedBy}
              onChange={(e) => setFormData({...formData, bookedBy: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Save Changes
          </Button>
        </div>
      </form>
    </DialogContent>
  );
};

export default Orders;