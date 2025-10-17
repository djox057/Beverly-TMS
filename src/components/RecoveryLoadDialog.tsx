import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useAvailableTrailers } from "@/hooks/useAvailableTrailers";
import { useDrivers } from "@/hooks/useDrivers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { data: trucks } = useAvailableTrucks();
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
      setRecoveryTrailerId(selectedTruck.trailer_id || "");
      setRecoveryDriverId(selectedTruck.driver1_id || "");
    }
  };

  const handleSave = () => {
    setError("");

    const origMiles = parseFloat(originalMiles) || 0;
    const recMiles = parseFloat(recoveryMiles) || 0;
    const origFreight = parseFloat(originalFreight) || 0;
    const recFreight = parseFloat(recoveryFreight) || 0;

    if (origMiles + recMiles > totalMiles) {
      setError(`Total miles (${origMiles + recMiles}) cannot exceed load miles (${totalMiles})`);
      return;
    }

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
                <Input value={currentDriver} disabled />
              </div>
              <div>
                <Label>Truck</Label>
                <Input value={currentTruck} disabled />
              </div>
              <div>
                <Label>Trailer</Label>
                <Input value={currentTrailer} disabled />
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
                <Select value={recoveryTruckId} onValueChange={handleTruckChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck" />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks?.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        {truck.truck_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trailer</Label>
                <Select value={recoveryTrailerId} onValueChange={setRecoveryTrailerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trailer" />
                  </SelectTrigger>
                  <SelectContent>
                    {trailers?.map((trailer) => (
                      <SelectItem key={trailer.id} value={trailer.id}>
                        {trailer.trailer_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Driver *</Label>
                <Select value={recoveryDriverId} onValueChange={setRecoveryDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers?.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
