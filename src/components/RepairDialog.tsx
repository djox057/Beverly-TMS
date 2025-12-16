import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Repair, RepairFormData } from "@/hooks/useRepairs";
import { toast } from "sonner";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

const CHICAGO_TZ = "America/Chicago";

// Get current date in Chicago timezone as YYYY-MM-DD
const getChicagoDateString = (): string => {
  return formatInTimeZone(new Date(), CHICAGO_TZ, "yyyy-MM-dd");
};

interface RepairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repair?: Repair | null;
  repairType: 'truck' | 'trailer';
  onSubmit: (data: RepairFormData) => void;
  onDelete?: (id: string) => void;
}

interface TruckOption {
  id: string;
  truck_number: string;
  driver1_id: string | null;
  trailer_id: string | null;
  driver_name: string | null;
  trailer_number: string | null;
}

interface TrailerOption {
  id: string;
  trailer_number: string;
  connected_truck?: TruckOption | null;
}

export function RepairDialog({
  open,
  onOpenChange,
  repair,
  repairType,
  onSubmit,
  onDelete,
}: RepairDialogProps) {
  const [truckNumber, setTruckNumber] = useState("");
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [repairDate, setRepairDate] = useState(getChicagoDateString());
  const [showTrailerConfirm, setShowTrailerConfirm] = useState(false);
  const [suggestedTrailerId, setSuggestedTrailerId] = useState<string | null>(null);
  const [suggestedTrailerNumber, setSuggestedTrailerNumber] = useState("");

  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [trailers, setTrailers] = useState<TrailerOption[]>([]);
  const [filteredTrucks, setFilteredTrucks] = useState<TruckOption[]>([]);
  const [filteredTrailers, setFilteredTrailers] = useState<TrailerOption[]>([]);

  // Load options on mount
  useEffect(() => {
    const loadOptions = async () => {
      const [trucksRes, trailersRes] = await Promise.all([
        supabase
          .from('trucks')
          .select(`
            id, truck_number, driver1_id, trailer_id,
            drivers:driver1_id(name),
            trailers:trailer_id(trailer_number)
          `)
          .order('truck_number'),
        supabase
          .from('trailers')
          .select('id, trailer_number')
          .order('trailer_number'),
      ]);

      const trucksList: TruckOption[] = trucksRes.data?.map((t: any) => ({
        id: t.id,
        truck_number: t.truck_number,
        driver1_id: t.driver1_id,
        trailer_id: t.trailer_id,
        driver_name: t.drivers?.name || null,
        trailer_number: t.trailers?.trailer_number || null,
      })) || [];
      
      setTrucks(trucksList);
      
      // Map trailers with their connected truck/driver info
      if (trailersRes.data) {
        setTrailers(trailersRes.data.map((trailer: any) => {
          const connectedTruck = trucksList.find(t => t.trailer_id === trailer.id);
          return {
            id: trailer.id,
            trailer_number: trailer.trailer_number,
            connected_truck: connectedTruck || null,
          };
        }));
      }
    };

    if (open) loadOptions();
  }, [open]);

  // Reset form when dialog opens/closes or repair changes
  useEffect(() => {
    if (open) {
      if (repair) {
        setTruckNumber(repair.truck_number || "");
        setSelectedTruckId(repair.truck_id);
        setSelectedTrailerId(repair.trailer_id);
        setSelectedDriverId(repair.driver_id);
        setDriverName(repair.driver_name || "");
        setTrailerNumber(repair.trailer_number || "");
        setReason(repair.reason);
        setAmount(repair.amount.toString());
        setIsPaid(repair.is_paid);
        setRepairDate(repair.repair_date || getChicagoDateString());
      } else {
        setTruckNumber("");
        setSelectedTruckId(null);
        setSelectedTrailerId(null);
        setSelectedDriverId(null);
        setDriverName("");
        setTrailerNumber("");
        setReason("");
        setAmount("");
        setIsPaid(false);
        setRepairDate(getChicagoDateString());
      }
      setShowTrailerConfirm(false);
      setSuggestedTrailerId(null);
      setSuggestedTrailerNumber("");
    }
  }, [open, repair]);

  // Filter trucks based on input (hide dropdown when exact match is unique)
  useEffect(() => {
    if (!truckNumber) {
      setFilteredTrucks([]);
      return;
    }

    const selectedTruck = selectedTruckId
      ? trucks.find((t) => t.id === selectedTruckId)
      : null;

    // If an item is already selected, never show the dropdown for the exact value
    if (
      selectedTruck &&
      selectedTruck.truck_number.toLowerCase() === truckNumber.toLowerCase()
    ) {
      setFilteredTrucks([]);
      return;
    }

    const exact = trucks.filter(
      (t) => t.truck_number.toLowerCase() === truckNumber.toLowerCase()
    );

    if (exact.length === 1) {
      if (selectedTruckId !== exact[0].id) {
        handleTruckSelect(exact[0]);
      }
      setFilteredTrucks([]);
      return;
    }

    setFilteredTrucks(
      trucks
        .filter((t) =>
          t.truck_number.toLowerCase().includes(truckNumber.toLowerCase())
        )
        .slice(0, 10)
    );
  }, [truckNumber, trucks, selectedTruckId]);

  // Filter trailers based on input (hide dropdown when exact match is unique)
  useEffect(() => {
    if (!trailerNumber) {
      setFilteredTrailers([]);
      return;
    }

    const selectedTrailer = selectedTrailerId
      ? trailers.find((t) => t.id === selectedTrailerId)
      : null;

    // If an item is already selected, never show the dropdown for the exact value
    if (
      selectedTrailer &&
      selectedTrailer.trailer_number.toLowerCase() === trailerNumber.toLowerCase()
    ) {
      setFilteredTrailers([]);
      return;
    }

    const exact = trailers.filter(
      (t) => t.trailer_number.toLowerCase() === trailerNumber.toLowerCase()
    );

    if (exact.length === 1) {
      if (selectedTrailerId !== exact[0].id) {
        handleTrailerSelect(exact[0]);
      }
      setFilteredTrailers([]);
      return;
    }

    setFilteredTrailers(
      trailers
        .filter((t) =>
          t.trailer_number.toLowerCase().includes(trailerNumber.toLowerCase())
        )
        .slice(0, 10)
    );
  }, [trailerNumber, trailers, selectedTrailerId]);

  const handleTruckSelect = (truck: TruckOption) => {
    // Driver is required, so only allow selecting trucks with an assigned driver
    if (!truck.driver1_id || !truck.driver_name) {
      toast.error("This truck has no driver assigned");
      return;
    }

    setTruckNumber(truck.truck_number);
    setSelectedTruckId(truck.id);
    setFilteredTrucks([]);

    // Auto-fill driver
    setSelectedDriverId(truck.driver1_id);
    setDriverName(truck.driver_name);

    // Ask to confirm trailer if truck has one (unless it's already selected)
    if (truck.trailer_id && truck.trailer_number) {
      if (selectedTrailerId === truck.trailer_id) {
        setSelectedTrailerId(truck.trailer_id);
        setTrailerNumber(truck.trailer_number);
        setShowTrailerConfirm(false);
        setSuggestedTrailerId(null);
        setSuggestedTrailerNumber("");
        return;
      }

      setSuggestedTrailerId(truck.trailer_id);
      setSuggestedTrailerNumber(truck.trailer_number);
      setShowTrailerConfirm(true);
    }
  };

  const handleTrailerConfirm = (confirm: boolean) => {
    if (confirm) {
      setSelectedTrailerId(suggestedTrailerId);
      setTrailerNumber(suggestedTrailerNumber);
    } else {
      setSelectedTrailerId(null);
      setTrailerNumber("");
    }
    setShowTrailerConfirm(false);
  };

  const handleTrailerSelect = (trailer: TrailerOption) => {
    setTrailerNumber(trailer.trailer_number);
    setSelectedTrailerId(trailer.id);
    setFilteredTrailers([]);

    // Auto-fill driver from connected truck
    if (trailer.connected_truck?.driver1_id && trailer.connected_truck?.driver_name) {
      setSelectedTruckId(trailer.connected_truck.id);
      setTruckNumber(trailer.connected_truck.truck_number);
      setSelectedDriverId(trailer.connected_truck.driver1_id);
      setDriverName(trailer.connected_truck.driver_name);
    }
  };

  const handleSubmit = () => {
    // Validation
    if (!selectedDriverId) {
      toast.error("Driver is required");
      return;
    }

    if (repairType === 'truck' && !selectedTruckId) {
      toast.error("Truck is required for truck repairs");
      return;
    }

    if (repairType === 'trailer' && !selectedTrailerId) {
      toast.error("Trailer is required for trailer repairs");
      return;
    }

    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Amount is required");
      return;
    }

    onSubmit({
      repair_type: repairType,
      truck_id: selectedTruckId,
      trailer_id: selectedTrailerId,
      driver_id: selectedDriverId,
      reason: reason.trim(),
      amount: parsedAmount,
      is_paid: isPaid,
      repair_date: repairDate,
    });

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (repair && onDelete) {
      onDelete(repair.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {repair ? "Edit Repair" : `Add ${repairType === 'truck' ? 'Truck' : 'Trailer'} Repair`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Repair Date */}
          <div className="space-y-2">
            <Label htmlFor="repair_date">Date *</Label>
            <Input
              id="repair_date"
              type="date"
              value={repairDate}
              onChange={(e) => setRepairDate(e.target.value)}
            />
          </div>

          {/* Truck Number */}
          <div className="space-y-2">
            <Label htmlFor="truck">Truck #</Label>
            <div className="relative">
              <Input
                id="truck"
                value={truckNumber}
                onChange={(e) => {
                  setTruckNumber(e.target.value);
                  setSelectedTruckId(null);
                }}
                placeholder="Search truck number..."
              />
              {filteredTrucks.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                  {filteredTrucks.map((truck) => (
                    <div
                      key={truck.id}
                      className="px-3 py-2 cursor-pointer hover:bg-accent"
                      onClick={() => handleTruckSelect(truck)}
                    >
                      <span className="font-medium">{truck.truck_number}</span>
                      {truck.driver_name && (
                        <span className="text-muted-foreground text-sm ml-2">
                          ({truck.driver_name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trailer Confirmation */}
          {showTrailerConfirm && (
            <div className="p-3 bg-muted rounded-md space-y-2">
              <p className="text-sm">
                This truck has trailer <strong>{suggestedTrailerNumber}</strong> assigned. Include it in this repair?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleTrailerConfirm(true)}>
                  Yes
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleTrailerConfirm(false)}>
                  No
                </Button>
              </div>
            </div>
          )}

          {/* Driver (read-only, auto-filled from truck) */}
          {driverName && (
            <div className="space-y-2">
              <Label>Driver</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {driverName}
              </div>
            </div>
          )}

          {/* Trailer Number */}
          <div className="space-y-2">
            <Label htmlFor="trailer">Trailer #</Label>
            <div className="relative">
              <Input
                id="trailer"
                value={trailerNumber}
                onChange={(e) => {
                  setTrailerNumber(e.target.value);
                  setSelectedTrailerId(null);
                }}
                placeholder="Search trailer number..."
              />
              {filteredTrailers.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                  {filteredTrailers.map((trailer) => (
                    <div
                      key={trailer.id}
                      className="px-3 py-2 cursor-pointer hover:bg-accent"
                      onClick={() => handleTrailerSelect(trailer)}
                    >
                      <span className="font-medium">{trailer.trailer_number}</span>
                      {trailer.connected_truck?.driver_name && (
                        <span className="text-muted-foreground text-sm ml-2">
                          ({trailer.connected_truck.driver_name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the repair reason..."
              rows={3}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Paid */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="paid"
              checked={isPaid}
              onCheckedChange={(checked) => setIsPaid(checked as boolean)}
            />
            <Label htmlFor="paid" className="cursor-pointer">
              Paid
            </Label>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {repair && onDelete && (
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {repair ? "Update" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
