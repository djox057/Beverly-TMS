import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useTrailers } from "@/hooks/useTrailers";
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
  totalDriverRate: number;
}

export interface RecoveryData {
  originalMiles: number;
  originalDriverRate: number;
  recoveryTruckId: string;
  recoveryTrailerId: string;
  recoveryDriverId: string;
  recoveryMiles: number;
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
  totalDriverRate,
}: RecoveryLoadDialogProps) {
  const { data: trucks } = useAvailableTrucks(true); // Pass true for recovery mode
  const { data: drivers } = useDrivers();
  const { data: allTrailers } = useTrailers(); // Get ALL trailers for lookup
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  
  const { data: trailers } = useAvailableTrailers(selectedTruckId || undefined);

  const [originalMiles, setOriginalMiles] = useState<string>("");
  const [originalDriverRate, setOriginalDriverRate] = useState<string>("");
  const [recoveryTruckId, setRecoveryTruckId] = useState<string>("");
  const [recoveryTrailerId, setRecoveryTrailerId] = useState<string>("");
  const [recoveryDriverId, setRecoveryDriverId] = useState<string>("");
  const [recoveryMiles, setRecoveryMiles] = useState<string>("");
  const [recoveryDriverRate, setRecoveryDriverRate] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [originalTrailerDisplay, setOriginalTrailerDisplay] = useState<string>("");
  const [recoveryTrailerDisplay, setRecoveryTrailerDisplay] = useState<string>("");
  const [originalTrailerId, setOriginalTrailerId] = useState<string>(""); // Track original trailer ID

  // Initialize original trailer when dialog opens or allTrailers loads
  useEffect(() => {
    if (open && currentTrailer && allTrailers && !originalTrailerId) {
      const trailer = allTrailers.find(t => t.trailer_number === currentTrailer);
      if (trailer) {
        setOriginalTrailerId(trailer.id);
        setOriginalTrailerDisplay(currentTrailer);
      }
    }
  }, [open, currentTrailer, allTrailers, originalTrailerId]);

  const handleTruckChange = (truckId: string) => {
    setRecoveryTruckId(truckId);
    setSelectedTruckId(truckId);
    
    const selectedTruck = trucks?.find((t) => t.id === truckId);
    if (selectedTruck) {
      const trailerId = selectedTruck.trailer_id || "";
      const driverId = selectedTruck.driver1_id || "";
      setRecoveryTrailerId(trailerId);
      setRecoveryDriverId(driverId);
      
      // Find and set the trailer display number
      const selectedTrailer = trailers?.find((t) => t.id === trailerId);
      if (selectedTrailer) {
        setRecoveryTrailerDisplay(selectedTrailer.trailer_number);
      }
    }
  };

  const handleSwitchTrailers = () => {
    // Swap display values
    const tempDisplay = originalTrailerDisplay;
    setOriginalTrailerDisplay(recoveryTrailerDisplay);
    setRecoveryTrailerDisplay(tempDisplay);
    
    // Swap IDs
    const tempId = originalTrailerId;
    setOriginalTrailerId(recoveryTrailerId);
    setRecoveryTrailerId(tempId);
  };

  const handleSave = () => {
    setError("");

    if (!recoveryTruckId || !recoveryDriverId) {
      setError("Please select transfer truck and driver");
      return;
    }

    onSave({
      originalMiles: parseFloat(originalMiles) || 0,
      originalDriverRate: parseFloat(originalDriverRate) || 0,
      recoveryTruckId,
      recoveryTrailerId: recoveryTrailerId || "", // Transfer driver gets this trailer
      recoveryDriverId,
      recoveryMiles: parseFloat(recoveryMiles) || 0,
      recoveryDriverRate: parseFloat(recoveryDriverRate) || 0,
      recoveryDate: new Date().toISOString(),
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer Load</DialogTitle>
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
                <Input value={originalTrailerDisplay || currentTrailer || "N/A"} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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

          {/* Transfer Driver Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Transfer Driver</h3>
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={handleSwitchTrailers}
              >
                Switch Trailers
              </Button>
            </div>
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
                  onValueChange={(value) => {
                    setRecoveryTrailerId(value);
                    const selectedTrailer = trailers?.find((t) => t.id === value);
                    if (selectedTrailer) {
                      setRecoveryTrailerDisplay(selectedTrailer.trailer_number);
                    }
                  }}
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
            <div className="grid grid-cols-2 gap-4">
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
          <Button onClick={handleSave}>Save Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
