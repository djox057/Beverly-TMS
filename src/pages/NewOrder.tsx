import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PickupDrop {
  id: string;
  type: "pickup" | "delivery";
  address: string;
  city: string;
  state: string;
  date: Date | undefined;
  time: string;
}

const NewOrder = () => {
  const [pickupDate, setPickupDate] = useState<Date>();
  const [deliveryDate, setDeliveryDate] = useState<Date>();
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);

  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      city: "",
      state: "",
      date: undefined,
      time: "",
    };
    setPickupsDrops([...pickupsDrops, newItem]);
  };

  const removePickupDrop = (id: string) => {
    setPickupsDrops(pickupsDrops.filter(item => item.id !== id));
  };

  const updatePickupDrop = (id: string, field: keyof PickupDrop, value: any) => {
    setPickupsDrops(pickupsDrops.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Create New Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Booked by Company</Label>
              <Input id="company" placeholder="Company name" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="broker">Broker</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select broker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="broker1">ABC Logistics</SelectItem>
                  <SelectItem value="broker2">XYZ Transport</SelectItem>
                  <SelectItem value="broker3">QuickMove Inc</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="load-number">Load #</Label>
              <Input id="load-number" placeholder="Load number" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="truck">Truck #</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="truck1">TRK-001</SelectItem>
                  <SelectItem value="truck2">TRK-002</SelectItem>
                  <SelectItem value="truck3">TRK-003</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trailer">Trailer #</Label>
              <Input id="trailer" placeholder="Trailer number" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver1">Driver 1</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select primary driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver1">John Smith</SelectItem>
                  <SelectItem value="driver2">Mike Johnson</SelectItem>
                  <SelectItem value="driver3">David Wilson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver2">Driver 2 (Optional)</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select second driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="driver1">John Smith</SelectItem>
                  <SelectItem value="driver2">Mike Johnson</SelectItem>
                  <SelectItem value="driver3">David Wilson</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pickup Date & Time</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !pickupDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {pickupDate ? format(pickupDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={pickupDate}
                      onSelect={setPickupDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input type="time" className="w-32" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Delivery Date & Time</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !deliveryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryDate ? format(deliveryDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deliveryDate}
                      onSelect={setDeliveryDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input type="time" className="w-32" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Additional Pickups & Deliveries</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addPickupDrop("pickup")}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Pickup
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addPickupDrop("delivery")}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Delivery
                </Button>
              </div>
            </div>

            {pickupsDrops.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium capitalize">{item.type}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removePickupDrop(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="Address"
                    value={item.address}
                    onChange={(e) => updatePickupDrop(item.id, "address", e.target.value)}
                  />
                  <Input
                    placeholder="City"
                    value={item.city}
                    onChange={(e) => updatePickupDrop(item.id, "city", e.target.value)}
                  />
                  <Input
                    placeholder="State"
                    value={item.state}
                    onChange={(e) => updatePickupDrop(item.id, "state", e.target.value)}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="freight-amount">Freight Amount</Label>
              <Input id="freight-amount" type="number" placeholder="0.00" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver-price">Price for Driver</Label>
              <Input id="driver-price" type="number" placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="files">Upload Files</Label>
            <Input id="files" type="file" multiple />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline">Cancel</Button>
            <Button>Create Order</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewOrder;