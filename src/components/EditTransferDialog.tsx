import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useDrivers } from "@/hooks/useDrivers";
import { Combobox } from "@/components/ui/combobox";
import { AlertCircle, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseSimpleDateTime } from "@/utils/dateUtils";

interface EditTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: EditTransferData) => void;
  transfer: {
    id: string;
    sequenceNumber: number;
    driverId?: string;
    driverName?: string;
    truckId?: string;
    truckNumber?: string;
    trailerId?: string;
    trailerNumber?: string;
    miles?: number;
    driverPrice?: number;
    transferCity?: string;
    transferState?: string;
    transferAddress?: string;
    transferDatetime?: string;
  };
}

export interface EditTransferData {
  id: string;
  truckId?: string;
  trailerId?: string;
  driverId?: string;
  miles?: number;
  driverPrice?: number;
  transferCity: string;
  transferState: string;
  transferAddress?: string;
  transferDatetime: string;
}

export function EditTransferDialog({
  open,
  onOpenChange,
  onSave,
  transfer,
}: EditTransferDialogProps) {
  const { data: trucks } = useAvailableTrucks(true);
  const { data: drivers } = useDrivers();
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");

  const { data: trailers } = useAvailableTrailers(selectedTruckId || undefined);

  const [truckId, setTruckId] = useState<string>("");
  const [trailerId, setTrailerId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [miles, setMiles] = useState<string>("");
  const [driverPrice, setDriverPrice] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Transfer location fields
  const [transferCity, setTransferCity] = useState<string>("");
  const [transferState, setTransferState] = useState<string>("");
  const [transferAddress, setTransferAddress] = useState<string>("");
  const [transferDatetime, setTransferDatetime] = useState<string>("");

  // Populate form when dialog opens
  useEffect(() => {
    if (open && transfer) {
      setTruckId(transfer.truckId || "");
      setTrailerId(transfer.trailerId || "");
      setDriverId(transfer.driverId || "");
      setSelectedTruckId(transfer.truckId || "");
      setMiles(transfer.miles?.toString() || "");
      setDriverPrice(transfer.driverPrice?.toString() || "");
      setTransferCity(transfer.transferCity || "");
      setTransferState(transfer.transferState || "");
      setTransferAddress(transfer.transferAddress || "");

      // Parse the datetime as naive (strip timezone) for datetime-local input
      if (transfer.transferDatetime) {
        const parsed = parseSimpleDateTime(transfer.transferDatetime);
        const year = parsed.year;
        const month = String(parsed.month).padStart(2, "0");
        const day = String(parsed.day).padStart(2, "0");
        const hours = String(parsed.hours).padStart(2, "0");
        const minutes = String(parsed.minutes).padStart(2, "0");
        setTransferDatetime(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setTransferDatetime("");
      }

      setError("");
    }
  }, [open, transfer]);

  const handleTruckChange = (newTruckId: string) => {
    setTruckId(newTruckId);
    setSelectedTruckId(newTruckId);

    const selectedTruck = trucks?.find((t) => t.id === newTruckId);
    if (selectedTruck) {
      setTrailerId(selectedTruck.trailer_id || "");
      setDriverId(selectedTruck.driver1_id || "");
    }
  };

  const handleSave = () => {
    setError("");

    if (!transferCity || !transferState) {
      setError("Please enter transfer location (city and state)");
      return;
    }

    if (!transferDatetime) {
      setError("Please select transfer date and time");
      return;
    }

    // Save as ISO string with Z suffix (naive Chicago wall-time stored as UTC literal)
    // This matches the convention used elsewhere in the app
    const isoDatetime = transferDatetime.replace("T", " ") + ":00";

    onSave({
      id: transfer.id,
      truckId: truckId || undefined,
      trailerId: trailerId || undefined,
      driverId: driverId || undefined,
      miles: miles ? parseFloat(miles) : undefined,
      driverPrice: driverPrice ? parseFloat(driverPrice) : undefined,
      transferCity,
      transferState,
      transferAddress: transferAddress || undefined,
      transferDatetime: isoDatetime,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {transfer.sequenceNumber === 0 ? "Original Driver" : `Transfer #${transfer.sequenceNumber}`}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Driver/Truck/Trailer Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Assignment</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Truck</Label>
                <Combobox
                  options={trucks?.map((truck) => ({
                    value: truck.id,
                    label: truck.truck_number,
                  })) || []}
                  value={truckId}
                  onValueChange={handleTruckChange}
                  placeholder="Select truck"
                  searchPlaceholder="Search trucks..."
                  emptyText="No truck found."
                />
              </div>
              <div>
                <Label>Trailer</Label>
                <Combobox
                  options={trailers?.map((trailer) => ({
                    value: trailer.id,
                    label: trailer.trailer_number,
                  })) || []}
                  value={trailerId}
                  onValueChange={setTrailerId}
                  placeholder="Select trailer"
                  searchPlaceholder="Search trailers..."
                  emptyText="No trailer found."
                />
              </div>
              <div>
                <Label>Driver</Label>
                <Combobox
                  options={drivers?.map((driver) => ({
                    value: driver.id,
                    label: driver.name,
                  })) || []}
                  value={driverId}
                  onValueChange={setDriverId}
                  placeholder="Select driver"
                  searchPlaceholder="Search drivers..."
                  emptyText="No driver found."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Miles</Label>
                <Input
                  type="number"
                  value={miles}
                  onChange={(e) => setMiles(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Driver Rate</Label>
                <Input
                  type="number"
                  value={driverPrice}
                  onChange={(e) => setDriverPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Transfer Location Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">
                {transfer.sequenceNumber === 0 ? "Delivery Point (Handoff Location)" : "Pickup Point (Handoff Location)"}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {transfer.sequenceNumber === 0 
                ? "Where did this driver hand off the load to the next driver?"
                : "Where did this driver pick up the load from the previous driver?"}
            </p>
            <div className="grid grid-cols-[1fr_80px_1.5fr] gap-4">
              <div>
                <Label>City *</Label>
                <Input
                  value={transferCity}
                  onChange={(e) => setTransferCity(e.target.value)}
                  placeholder="e.g. Chicago"
                />
              </div>
              <div>
                <Label>State *</Label>
                <Input
                  value={transferState}
                  onChange={(e) => setTransferState(e.target.value.toUpperCase())}
                  placeholder="IL"
                  maxLength={2}
                />
              </div>
              <div>
                <Label>Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={transferDatetime}
                  onChange={(e) => setTransferDatetime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Full Address (optional)</Label>
              <Input
                value={transferAddress}
                onChange={(e) => setTransferAddress(e.target.value)}
                placeholder="e.g. 123 Main St, Chicago, IL 60601"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
