import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useDrivers } from "@/hooks/useDrivers";
import { Combobox } from "@/components/ui/combobox";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PreviousTransfer {
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  miles: number;
  driverPrice: number;
}

interface AddTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: AddTransferData) => void;
  previousTransfer: PreviousTransfer;
  sequenceNumber: number;
}

export interface AddTransferData {
  newTruckId: string;
  newTrailerId: string;
  newDriverId: string;
  newMiles: number;
  newDriverPrice: number;
  transferDate: string;
  sequenceNumber: number;
}

export function AddTransferDialog({
  open,
  onOpenChange,
  onSave,
  previousTransfer,
  sequenceNumber,
}: AddTransferDialogProps) {
  const { data: trucks } = useAvailableTrucks(true);
  const { data: drivers } = useDrivers();
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  
  const { data: trailers } = useAvailableTrailers(selectedTruckId || undefined);

  const [newTruckId, setNewTruckId] = useState<string>("");
  const [newTrailerId, setNewTrailerId] = useState<string>("");
  const [newDriverId, setNewDriverId] = useState<string>("");
  const [newMiles, setNewMiles] = useState<string>("");
  const [newDriverPrice, setNewDriverPrice] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setNewTruckId("");
      setNewTrailerId("");
      setNewDriverId("");
      setNewMiles("");
      setNewDriverPrice("");
      setSelectedTruckId("");
      setError("");
    }
  }, [open]);

  const handleTruckChange = (truckId: string) => {
    setNewTruckId(truckId);
    setSelectedTruckId(truckId);
    
    const selectedTruck = trucks?.find((t) => t.id === truckId);
    if (selectedTruck) {
      const trailerId = selectedTruck.trailer_id || "";
      const driverId = selectedTruck.driver1_id || "";
      setNewTrailerId(trailerId);
      setNewDriverId(driverId);
    }
  };

  const handleSave = () => {
    setError("");

    if (!newTruckId || !newDriverId) {
      setError("Please select new truck and driver");
      return;
    }

    if (!newMiles || !newDriverPrice) {
      setError("Please enter miles and driver rate");
      return;
    }

    onSave({
      newTruckId,
      newTrailerId,
      newDriverId,
      newMiles: parseFloat(newMiles) || 0,
      newDriverPrice: parseFloat(newDriverPrice) || 0,
      transferDate: new Date().toISOString(),
      sequenceNumber,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Transfer #{sequenceNumber}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Previous Driver Section (Read-only) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Previous Driver (Transfer #{sequenceNumber - 1})</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Driver</Label>
                <Input value={previousTransfer.driverName || "N/A"} disabled />
              </div>
              <div>
                <Label>Truck</Label>
                <Input value={previousTransfer.truckNumber || "N/A"} disabled />
              </div>
              <div>
                <Label>Trailer</Label>
                <Input value={previousTransfer.trailerNumber || "N/A"} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Miles</Label>
                <Input value={previousTransfer.miles?.toString() || "0"} disabled />
              </div>
              <div>
                <Label>Driver Rate</Label>
                <Input value={`$${previousTransfer.driverPrice?.toFixed(2) || "0.00"}`} disabled />
              </div>
            </div>
          </div>

          {/* New Transfer Driver Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">New Transfer Driver #{sequenceNumber}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Truck *</Label>
                <Combobox
                  options={trucks?.map((truck) => ({
                    value: truck.id,
                    label: truck.truck_number,
                  })) || []}
                  value={newTruckId}
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
                  value={newTrailerId}
                  onValueChange={setNewTrailerId}
                  placeholder="Select trailer"
                  searchPlaceholder="Search trailers..."
                  emptyText="No trailer found."
                />
              </div>
              <div>
                <Label>Driver *</Label>
                <Combobox
                  options={drivers?.map((driver) => ({
                    value: driver.id,
                    label: driver.name,
                  })) || []}
                  value={newDriverId}
                  onValueChange={setNewDriverId}
                  placeholder="Select driver"
                  searchPlaceholder="Search drivers..."
                  emptyText="No driver found."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Miles to Complete *</Label>
                <Input
                  type="number"
                  value={newMiles}
                  onChange={(e) => setNewMiles(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Driver Rate *</Label>
                <Input
                  type="number"
                  value={newDriverPrice}
                  onChange={(e) => setNewDriverPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Add Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
