import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Repair, RepairFormData } from "@/hooks/useRepairs";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface TrailerOption {
  id: string;
  trailer_number: string;
}

interface DriverOption {
  id: string;
  name: string;
  is_active: boolean;
}

export function RepairDialog({
  open,
  onOpenChange,
  repair,
  repairType,
  onSubmit,
  onDelete,
}: RepairDialogProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [truckNumber, setTruckNumber] = useState("");
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [trailerNumber, setTrailerNumber] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [repairDate, setRepairDate] = useState(getChicagoDateString());
  const [accountingNote, setAccountingNote] = useState("");

  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [trailers, setTrailers] = useState<TrailerOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [filteredTrucks, setFilteredTrucks] = useState<TruckOption[]>([]);
  const [filteredTrailers, setFilteredTrailers] = useState<TrailerOption[]>([]);
  
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [showInactiveDrivers, setShowInactiveDrivers] = useState(false);

  // Load options on mount
  useEffect(() => {
    const loadOptions = async () => {
      const [trucksRes, trailersRes, driversRes] = await Promise.all([
        supabase
          .from('trucks')
          .select('id, truck_number')
          .order('truck_number'),
        supabase
          .from('trailers')
          .select('id, trailer_number')
          .order('trailer_number'),
        supabase
          .from('drivers')
          .select('id, name, is_active')
          .order('name'),
      ]);

      setTrucks(trucksRes.data || []);
      setTrailers(trailersRes.data || []);
      setDrivers(driversRes.data || []);
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
        setTrailerNumber(repair.trailer_number || "");
        setReason(repair.reason);
        setAmount(repair.amount.toString());
        setIsPaid(repair.is_paid);
        setRepairDate(repair.repair_date || getChicagoDateString());
        setAccountingNote(repair.accounting_note || "");
        // Show inactive drivers if editing a repair with an inactive driver
        const driver = drivers.find(d => d.id === repair.driver_id);
        if (driver && !driver.is_active) {
          setShowInactiveDrivers(true);
        }
      } else {
        setTruckNumber("");
        setSelectedTruckId(null);
        setSelectedTrailerId(null);
        setSelectedDriverId(null);
        setTrailerNumber("");
        setReason("");
        setAmount("");
        setIsPaid(false);
        setRepairDate(getChicagoDateString());
        setAccountingNote("");
        setShowInactiveDrivers(false);
      }
      setDriverSearch("");
    }
  }, [open, repair, drivers]);

  // Filter trucks based on input
  useEffect(() => {
    if (!truckNumber) {
      setFilteredTrucks([]);
      return;
    }

    const selectedTruck = selectedTruckId
      ? trucks.find((t) => t.id === selectedTruckId)
      : null;

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
        setSelectedTruckId(exact[0].id);
        setTruckNumber(exact[0].truck_number);
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

  // Filter trailers based on input
  useEffect(() => {
    if (!trailerNumber) {
      setFilteredTrailers([]);
      return;
    }

    const selectedTrailer = selectedTrailerId
      ? trailers.find((t) => t.id === selectedTrailerId)
      : null;

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
        setSelectedTrailerId(exact[0].id);
        setTrailerNumber(exact[0].trailer_number);
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

  // Filtered drivers based on search and active/inactive toggle
  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const matchesSearch = !driverSearch || 
        driver.name?.toLowerCase().includes(driverSearch.toLowerCase());
      const matchesActiveFilter = showInactiveDrivers || driver.is_active;
      return matchesSearch && matchesActiveFilter;
    });
  }, [drivers, driverSearch, showInactiveDrivers]);

  const selectedDriverName = useMemo(() => {
    const driver = drivers.find(d => d.id === selectedDriverId);
    return driver?.name || "";
  }, [drivers, selectedDriverId]);

  const handleTruckSelect = (truck: TruckOption) => {
    setTruckNumber(truck.truck_number);
    setSelectedTruckId(truck.id);
    setFilteredTrucks([]);
  };

  const handleTrailerSelect = (trailer: TrailerOption) => {
    setTrailerNumber(trailer.trailer_number);
    setSelectedTrailerId(trailer.id);
    setFilteredTrailers([]);
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
      accounting_note: accountingNote.trim() || null,
    });

    onOpenChange(false);
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (repair && onDelete) {
      onDelete(repair.id);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>
            {repair ? "Edit Repair" : `Add ${repairType === 'truck' ? 'Truck' : 'Trailer'} Repair`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
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
            <Label htmlFor="truck">Truck # {repairType === 'truck' && '*'}</Label>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trailer Number */}
          <div className="space-y-2">
            <Label htmlFor="trailer">Trailer # {repairType === 'trailer' && '*'}</Label>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Driver Selector */}
          <div className="space-y-2">
            <Label>Driver *</Label>
            <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={driverPopoverOpen}
                  className="w-full justify-between"
                >
                  {selectedDriverName || "Select driver..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search driver..." 
                    value={driverSearch}
                    onValueChange={setDriverSearch}
                  />
                  <div className="flex items-center gap-2 px-3 py-2 border-b">
                    <Checkbox
                      id="show-inactive"
                      checked={showInactiveDrivers}
                      onCheckedChange={(checked) => setShowInactiveDrivers(checked as boolean)}
                    />
                    <Label htmlFor="show-inactive" className="text-sm cursor-pointer">
                      Show inactive drivers
                    </Label>
                  </div>
                  <CommandList>
                    <CommandEmpty>No driver found.</CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-auto">
                      {filteredDrivers.map((driver) => (
                        <CommandItem
                          key={driver.id}
                          value={driver.id}
                          onSelect={() => {
                            setSelectedDriverId(driver.id);
                            setDriverPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDriverId === driver.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {driver.name}
                          {!driver.is_active && (
                            <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
            <Label htmlFor="amount">Amount *</Label>
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

          {/* Accounting Note */}
          <div className="space-y-2">
            <Label htmlFor="accounting_note">Accounting Note</Label>
            <Textarea
              id="accounting_note"
              value={accountingNote}
              onChange={(e) => setAccountingNote(e.target.value)}
              placeholder="Note for accounting..."
              rows={2}
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
            <Button variant="destructive" onClick={handleDeleteClick}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {repair ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repair?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this repair record and its linked expense in driver profiles.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}