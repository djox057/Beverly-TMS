import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvailableTrucks } from "@/hooks/useAvailableTrucks";
import { useDrivers } from "@/hooks/useDrivers";
import { Combobox } from "@/components/ui/combobox";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AssignTransferDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: TransferDriverData) => Promise<boolean | void> | boolean | void;
  // Original driver info (read-only display)
  originalDriverName: string | null;
  originalTruckNumber: string | null;
  originalTrailerNumber: string | null;
  originalMiles: number;
  originalDriverPrice: number;
  // Pre-filled recovery miles
  recoveryMiles: number;
  // Yard load's trailer (to swap with assigned truck)
  yardLoadTrailerId?: string | null;
  yardLoadTrailerNumber?: string | null;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  assignedDriverPrice?: number | null;
}

export interface TransferDriverData {
  transferTruckId: string | null;
  transferTrailerId: string;
  transferDriverId: string;
  recoveryMiles: number;
  recoveryDriverPrice: number;
  // Transfer location fields
  transferCity: string;
  transferState: string;
  transferAddress?: string;
  transferDatetime: string;
}

export function AssignTransferDriverDialog({
  open,
  onOpenChange,
  onSave,
  originalDriverName,
  originalTruckNumber,
  originalTrailerNumber,
  originalMiles,
  originalDriverPrice,
  recoveryMiles: initialRecoveryMiles,
  yardLoadTrailerId,
  yardLoadTrailerNumber,
  assignedDriverId,
  assignedDriverName,
  assignedDriverPrice,
}: AssignTransferDriverDialogProps) {
  const { data: trucks } = useAvailableTrucks(true);
  const { data: drivers } = useDrivers();
  const isTruckAssignment = !!assignedDriverId;

  const [transferTruckId, setTransferTruckId] = useState<string>("");
  const [transferTrailerId, setTransferTrailerId] = useState<string>("");
  const [transferDriverId, setTransferDriverId] = useState<string>("");
  const [recoveryMiles, setRecoveryMiles] = useState<string>("");
  const [recoveryDriverPrice, setRecoveryDriverPrice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Transfer location fields - default to Lynwood, IL for yard transfers
  const [transferCity, setTransferCity] = useState<string>("Lynwood");
  const [transferState, setTransferState] = useState<string>("IL");
  const [transferAddress, setTransferAddress] = useState<string>("");
  const [transferDatetime, setTransferDatetime] = useState<string>("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTransferTruckId("");
      setTransferTrailerId(yardLoadTrailerId || "");
      setTransferDriverId(assignedDriverId || "");
      setRecoveryMiles(initialRecoveryMiles?.toString() || "");
      setRecoveryDriverPrice(assignedDriverPrice?.toString() || "");
      setError("");
      // Default location to Lynwood terminal for yard transfers
      setTransferCity("Lynwood");
      setTransferState("IL");
      setTransferAddress("");
      // Default to current time
      setTransferDatetime(new Date().toISOString().slice(0, 16));
    }
  }, [open, initialRecoveryMiles, yardLoadTrailerId, assignedDriverId, assignedDriverPrice]);

  // Auto-calculate driver rate when driver or miles change
  useEffect(() => {
    if (isTruckAssignment) return;
    const selectedDriver = drivers?.find(d => d.id === transferDriverId);
    if (!selectedDriver?.is_company_driver || !selectedDriver?.cents_per_mile) return;
    
    const miles = parseFloat(recoveryMiles) || 0;
    if (miles <= 0) return;
    
    const calculatedPrice = miles * (selectedDriver.cents_per_mile / 100);
    setRecoveryDriverPrice(calculatedPrice.toFixed(2));
  }, [transferDriverId, recoveryMiles, drivers, isTruckAssignment]);

  const handleTruckChange = (truckId: string) => {
    setTransferTruckId(truckId);
    
    const selectedTruck = trucks?.find((t) => t.id === truckId);
    if (selectedTruck && !isTruckAssignment) {
      // Keep yard load's trailer instead of truck's trailer
      // Only auto-fill driver from truck
      const driverId = selectedTruck.driver1_id || "";
      setTransferDriverId(driverId);
      // Keep the yard load's trailer (already set in useEffect)
    }
  };

  const selectedDriver = drivers?.find(d => d.id === transferDriverId);
  const truckOptional = !isTruckAssignment && selectedDriver?.is_recovery === true;

  const handleSave = async () => {
    setError("");

    if (!transferDriverId) {
      setError("Please select a transfer driver");
      return;
    }

    if (!transferTruckId && !truckOptional) {
      setError(isTruckAssignment ? "Please select a truck" : "Please select a truck. Only recovery drivers can be assigned without a truck.");
      return;
    }

    if (!isTruckAssignment && (!recoveryDriverPrice || parseFloat(recoveryDriverPrice) <= 0)) {
      setError("Please enter a driver rate");
      return;
    }

    if (!transferCity || !transferState) {
      setError("Please enter transfer location (city and state)");
      return;
    }

    if (!transferDatetime) {
      setError("Please select transfer date and time");
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave({
        transferTruckId: transferTruckId || null,
        transferTrailerId,
        transferDriverId,
        recoveryMiles: parseFloat(recoveryMiles) || 0,
        recoveryDriverPrice: parseFloat(recoveryDriverPrice) || 0,
        transferCity,
        transferState,
        transferAddress: transferAddress || undefined,
        transferDatetime: new Date(transferDatetime).toISOString(),
      });

      if (saved !== false) onOpenChange(false);
    } catch {
      setError("Failed to save assignment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isTruckAssignment ? "Assign Truck" : "Assign Transfer Driver"}</DialogTitle>
          <DialogDescription>
            {isTruckAssignment ? "Select a truck for the assigned recovery driver." : "Assign a driver and equipment to this yard load."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Original Driver Section (Read-only) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Original Driver</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Driver</Label>
                <Input value={originalDriverName || "N/A"} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Truck</Label>
                <Input value={originalTruckNumber || "N/A"} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Trailer</Label>
                <Input value={originalTrailerNumber || "N/A"} disabled className="bg-muted" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Miles Driven</Label>
                <Input value={originalMiles?.toLocaleString() || "0"} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Driver Rate</Label>
                <Input 
                  value={originalDriverPrice ? `$${originalDriverPrice.toFixed(2)}` : "$0.00"} 
                  disabled 
                  className="bg-muted" 
                />
              </div>
            </div>
          </div>

          {/* Transfer Location Section */}
          {!isTruckAssignment && <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-lg">Transfer Location & Time</h3>
            <p className="text-sm text-muted-foreground">
              Where and when was the load picked up from the yard?
            </p>
            <div className="grid grid-cols-3 gap-4">
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
                  placeholder="e.g. IL"
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
          </div>}

          {/* Transfer Driver Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-lg">Transfer Driver</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{truckOptional ? "Truck (optional)" : "Truck *"}</Label>
                <Combobox
                  options={trucks?.map((truck) => ({
                    value: truck.id,
                    label: truck.truck_number,
                  })) || []}
                  value={transferTruckId}
                  onValueChange={handleTruckChange}
                  placeholder="Select truck"
                  searchPlaceholder="Search trucks..."
                  emptyText="No truck found."
                  disabled={saving}
                />
              </div>
              <div>
                <Label>Trailer (from yard load)</Label>
                <Input
                  value={yardLoadTrailerNumber || "N/A"}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div>
                <Label>Driver *</Label>
                <Combobox
                  options={drivers?.map((driver) => ({
                    value: driver.id,
                    label: driver.name,
                  })) || []}
                  value={transferDriverId}
                  onValueChange={setTransferDriverId}
                  placeholder="Select driver"
                  searchPlaceholder="Search drivers..."
                  emptyText="No driver found."
                  selectedLabel={assignedDriverName || undefined}
                  disabled={isTruckAssignment || saving}
                />
              </div>
            </div>
            {!isTruckAssignment && <p className="text-sm text-muted-foreground">
              Recovery drivers can be assigned without a truck. Assign the truck later from Loads at the Yard.
            </p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Miles to Complete *</Label>
                <Input
                  type="number"
                  disabled={isTruckAssignment || saving}
                  value={recoveryMiles}
                  onChange={(e) => setRecoveryMiles(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Driver Rate *</Label>
                <Input
                  type="number"
                  disabled={isTruckAssignment || saving}
                  value={recoveryDriverPrice}
                  onChange={(e) => setRecoveryDriverPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Saving..." : isTruckAssignment ? "Assign Truck" : "Assign Transfer Driver"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
