import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PickupDrop {
  id: string;
  type: "pickup" | "delivery";
  address: string;
  city: string;
  state: string;
  datetime: string;
}

const NewOrder = () => {
  const [bookedByCompany, setBookedByCompany] = useState("BF Prime");
  const [broker, setBroker] = useState("");
  const [truck, setTruck] = useState("");
  const [driver1, setDriver1] = useState("");
  const [driver2, setDriver2] = useState("");
  const [pickupDateTime, setPickupDateTime] = useState("");
  const [deliveryDateTime, setDeliveryDateTime] = useState("");
  const [pickupsDrops, setPickupsDrops] = useState<PickupDrop[]>([]);

  // Initialize with one pickup and one delivery
  useEffect(() => {
    const defaultPickup: PickupDrop = {
      id: "pickup-1",
      type: "pickup",
      address: "",
      city: "",
      state: "",
      datetime: "",
    };
    const defaultDelivery: PickupDrop = {
      id: "delivery-1",
      type: "delivery",
      address: "",
      city: "",
      state: "",
      datetime: "",
    };
    setPickupsDrops([defaultPickup, defaultDelivery]);
  }, []);

  const addPickupDrop = (type: "pickup" | "delivery") => {
    const newItem: PickupDrop = {
      id: Date.now().toString(),
      type,
      address: "",
      city: "",
      state: "",
      datetime: "",
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

  // Options for dropdowns
  const companyOptions = [
    { value: "BF Prime", label: "BF Prime" },
    { value: "Beverly group", label: "Beverly group" },
    { value: "Beverly Freight", label: "Beverly Freight" },
    { value: "BF Prime Unite", label: "BF Prime Unite" },
    { value: "BG Prime Inc", label: "BG Prime Inc" },
  ];

  const brokerOptions = [
    { value: "broker1", label: "ABC Logistics" },
    { value: "broker2", label: "XYZ Transport" },
    { value: "broker3", label: "QuickMove Inc" },
  ];

  const truckOptions = [
    { value: "truck1", label: "TRK-001" },
    { value: "truck2", label: "TRK-002" },
    { value: "truck3", label: "TRK-003" },
  ];

  const driverOptions = [
    { value: "driver1", label: "John Smith" },
    { value: "driver2", label: "Mike Johnson" },
    { value: "driver3", label: "David Wilson" },
  ];

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
              <Combobox
                options={companyOptions}
                value={bookedByCompany}
                onValueChange={setBookedByCompany}
                placeholder="Select company"
                searchPlaceholder="Search companies..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="broker">Broker</Label>
              <Combobox
                options={brokerOptions}
                value={broker}
                onValueChange={setBroker}
                placeholder="Select broker"
                searchPlaceholder="Search brokers..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="load-number">Load #</Label>
              <Input id="load-number" placeholder="Load number" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="truck">Truck #</Label>
              <Combobox
                options={truckOptions}
                value={truck}
                onValueChange={setTruck}
                placeholder="Select truck"
                searchPlaceholder="Search trucks..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trailer">Trailer #</Label>
              <Input id="trailer" placeholder="Trailer number" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver1">Driver 1</Label>
              <Combobox
                options={driverOptions}
                value={driver1}
                onValueChange={setDriver1}
                placeholder="Select primary driver"
                searchPlaceholder="Search drivers..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver2">Driver 2 (Optional)</Label>
              <Combobox
                options={[{ value: "none", label: "None" }, ...driverOptions]}
                value={driver2}
                onValueChange={setDriver2}
                placeholder="Select second driver"
                searchPlaceholder="Search drivers..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pickup-datetime">Pickup Date & Time</Label>
              <Input
                id="pickup-datetime"
                type="datetime-local"
                value={pickupDateTime}
                onChange={(e) => setPickupDateTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery-datetime">Delivery Date & Time</Label>
              <Input
                id="delivery-datetime"
                type="datetime-local"
                value={deliveryDateTime}
                onChange={(e) => setDeliveryDateTime(e.target.value)}
              />
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                  <Input
                    type="datetime-local"
                    value={item.datetime}
                    onChange={(e) => updatePickupDrop(item.id, "datetime", e.target.value)}
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