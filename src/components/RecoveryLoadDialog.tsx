import { useState } from "react";
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

interface RecoveryLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: RecoveryData) => void;
  currentDriver: string;
  currentTruck: string;
  currentTrailer: string;
  totalMiles: number;
  totalFreight: number;
  totalDriverRate: number;
}

export interface RecoveryData {
  originalMiles: number;
  originalFreight: number;
  originalDriverRate: number;
  recoveryTruckId: string;
  recoveryTrailerId: string;
  recoveryDriverId: string;
  recoveryMiles: number;
  recoveryFreight: number;
  recoveryDriverRate: number;
  recoveryDate: string;
}

export function RecoveryLoadDialog({
  open,
  onOpenChange,
  onSave,
  currentDriver,
  currentTruck,
  currentTrailer,
  totalMiles,
  totalFreight,
  totalDriverRate,
}: RecoveryLoadDialogProps) {
  const { data: trucks } = useAvailableTrucks(true); // Pass true for recovery mode
  const { data: drivers } = useDrivers();
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  
  const { data: trailers } = useAvailableTrailers(selectedTruckId || undefined);

  const [originalMiles, setOriginalMiles] = useState<string>("");
  const [originalFreight, setOriginalFreight] = useState<string>("");
  const [originalDriverRate, setOriginalDriverRate] = useState<string>("");
  const [recoveryTruckId, setRecoveryTruckId] = useState<string>("");
  const [recoveryTrailerId, setRecoveryTrailerId] = useState<string>("");
  const [recoveryDriverId, setRecoveryDriverId] = useState<string>("");
  const [recoveryMiles, setRecoveryMiles] = useState<string>("");
  const [recoveryFreight, setRecoveryFreight] = useState<string>("");
  const [recoveryDriverRate, setRecoveryDriverRate] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleTruckChange = (truckId: string) => {
    setRecoveryTruckId(truckId);
    setSelectedTruckId(truckId);
    
    const selectedTruck = trucks?.find((t) => t.id === truckId);
    if (selectedTruck) {
      const trailerId = selectedTruck.trailer_id || "";
      const driverId = selectedTruck.driver1_id || "";
      setRecoveryTrailerId(trailerId);
      setRecoveryDriverId(driverId);
    }
  };

  const handleSave = () => {
    setError("");

    const origMiles = parseFloat(originalMiles) || 0;
    const recMiles = parseFloat(recoveryMiles) || 0;
    const origFreight = parseFloat(originalFreight) || 0;
    const recFreight = parseFloat(recoveryFreight) || 0;

    if (origFreight + recFreight > totalFreight) {
      setError(`Total freight ($${origFreight + recFreight}) cannot exceed load freight ($${totalFreight})`);
      return;
    }

    if (!recoveryTruckId || !recoveryDriverId) {
      setError("Please select recovery truck and driver");
      return;
    }

    onSave({
      originalMiles: origMiles,
      originalFreight: origFreight,
      originalDriverRate: parseFloat(originalDriverRate) || 0,
      recoveryTruckId,
      recoveryTrailerId,
      recoveryDriverId,
      recoveryMiles: recMiles,
      recoveryFreight: recFreight,
      recoveryDriverRate: parseFloat(recoveryDriverRate) || 0,
      recoveryDate: new Date().toISOString(),
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recovery Load</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Original Driver Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Original Driver</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Driver</Label>
                <Input value={currentDriver || "N/A"} disabled />
              </div>
              <div>
                <Label>Truck</Label>
                <Input value={currentTruck || "N/A"} disabled />
              </div>
              <div>
                <Label>Trailer</Label>
                <Input value={currentTrailer || "N/A"} disabled />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Miles Driven *</Label>
                <Input
                  type="number"
                  value={originalMiles}
                  onChange={(e) => setOriginalMiles(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Freight Amount *</Label>
                <Input
                  type="number"
                  value={originalFreight}
                  onChange={(e) => setOriginalFreight(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Driver Rate *</Label>
                <Input
                  type="number"
                  value={originalDriverRate}
                  onChange={(e) => setOriginalDriverRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Recovery Driver Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Recovery Driver</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Truck *</Label>
                <Combobox
                  options={trucks?.map((truck) => ({
                    value: truck.id,
                    label: truck.truck_number,
                  })) || []}
                  value={recoveryTruckId}
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
                  value={recoveryTrailerId}
                  onValueChange={setRecoveryTrailerId}
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
                  value={recoveryDriverId}
                  onValueChange={setRecoveryDriverId}
                  placeholder="Select driver"
                  searchPlaceholder="Search drivers..."
                  emptyText="No driver found."
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Miles to Complete *</Label>
                <Input
                  type="number"
                  value={recoveryMiles}
                  onChange={(e) => setRecoveryMiles(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Freight Amount *</Label>
                <Input
                  type="number"
                  value={recoveryFreight}
                  onChange={(e) => setRecoveryFreight(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Driver Rate *</Label>
                <Input
                  type="number"
                  value={recoveryDriverRate}
                  onChange={(e) => setRecoveryDriverRate(e.target.value)}
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
          <Button onClick={handleSave}>Save Recovery</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
