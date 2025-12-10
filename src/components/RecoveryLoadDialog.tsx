import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  currentTrailerId?: string;
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
  swapTrailers: boolean;
  // Manual entry fields when N/A
  manualTruckNumber?: string;
  manualDriverName?: string;
}

export function RecoveryLoadDialog({
  open,
  onOpenChange,
  onSave,
  currentDriver,
  currentTruck,
  currentTrailer,
  currentTrailerId,
  totalMiles,
  totalDriverRate,
}: RecoveryLoadDialogProps) {
  const { data: trucks } = useAvailableTrucks(true); // Pass true for recovery mode
  const { data: drivers } = useDrivers();
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  
  const { data: trailers } = useAvailableTrailers(selectedTruckId || undefined);

  const [originalMiles, setOriginalMiles] = useState<string>("");
  const [originalDriverRate, setOriginalDriverRate] = useState<string>("");
  const [recoveryTruckId, setRecoveryTruckId] = useState<string>("");
  const [recoveryTrailerId, setRecoveryTrailerId] = useState<string>("");
  const [recoveryDriverId, setRecoveryDriverId] = useState<string>("");
  const [recoveryMiles, setRecoveryMiles] = useState<string>("");
  const [recoveryDriverRate, setRecoveryDriverRate] = useState<string>("");
  const [swapTrailers, setSwapTrailers] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  // Manual entry states
  const [useManualEntry, setUseManualEntry] = useState<boolean>(false);
  const [manualTruckNumber, setManualTruckNumber] = useState<string>("");
  const [manualDriverName, setManualDriverName] = useState<string>("");

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

    if (useManualEntry) {
      if (!manualTruckNumber || !manualDriverName) {
        setError("Please enter transfer truck number and driver name");
        return;
      }
    } else {
      if (!recoveryTruckId || !recoveryDriverId) {
        setError("Please select transfer truck and driver");
        return;
      }
    }

    if (swapTrailers && (!currentTrailerId || !recoveryTrailerId)) {
      setError("Both trucks must have trailers to perform a swap");
      return;
    }

    onSave({
      originalMiles: parseFloat(originalMiles) || 0,
      originalDriverRate: parseFloat(originalDriverRate) || 0,
      recoveryTruckId: useManualEntry ? "" : recoveryTruckId,
      recoveryTrailerId: recoveryTrailerId,
      recoveryDriverId: useManualEntry ? "" : recoveryDriverId,
      recoveryMiles: parseFloat(recoveryMiles) || 0,
      recoveryDriverRate: parseFloat(recoveryDriverRate) || 0,
      recoveryDate: new Date().toISOString(),
      swapTrailers,
      manualTruckNumber: useManualEntry ? manualTruckNumber : undefined,
      manualDriverName: useManualEntry ? manualDriverName : undefined,
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
                <Input value={currentTrailer || "N/A"} disabled />
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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="manualEntry"
                  checked={useManualEntry}
                  onCheckedChange={(checked) => setUseManualEntry(checked as boolean)}
                />
                <Label htmlFor="manualEntry" className="text-sm">Manual entry</Label>
              </div>
            </div>
            
            {useManualEntry ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Truck # *</Label>
                  <Input
                    value={manualTruckNumber}
                    onChange={(e) => setManualTruckNumber(e.target.value)}
                    placeholder="Enter truck number"
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
                  <Label>Driver Name *</Label>
                  <Input
                    value={manualDriverName}
                    onChange={(e) => setManualDriverName(e.target.value)}
                    placeholder="Enter driver name"
                  />
                </div>
              </div>
            ) : (
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
            )}
            
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

          {/* Swap Trailers Checkbox */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="swapTrailers"
                checked={swapTrailers}
                onCheckedChange={(checked) => setSwapTrailers(checked as boolean)}
                disabled={!currentTrailerId || !recoveryTrailerId}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="swapTrailers"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Swap trailers between trucks
                </Label>
                <p className="text-sm text-muted-foreground">
                  Original truck will get transfer truck's trailer, and transfer truck will get original truck's trailer
                </p>
              </div>
            </div>

            {swapTrailers && currentTrailerId && recoveryTrailerId && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1 text-sm">
                    <div><strong>{currentTruck || manualTruckNumber || "Original truck"}</strong> will receive <strong>Trailer {trailers?.find(t => t.id === recoveryTrailerId)?.trailer_number || recoveryTrailerId}</strong></div>
                    <div><strong>{useManualEntry ? manualTruckNumber : trucks?.find(t => t.id === recoveryTruckId)?.truck_number || "Transfer truck"}</strong> will receive <strong>Trailer {currentTrailer}</strong></div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
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
