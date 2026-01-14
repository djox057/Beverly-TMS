import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Trash2, Check, ChevronsUpDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// Define the available additional types with their display names and database mapping
const ADDITIONAL_TYPES = [
  { value: "detention", label: "Detention", hasDriver: true },
  { value: "layover", label: "Layover", hasDriver: true },
  { value: "extra_stop", label: "Extra Stop", hasDriver: false },
  { value: "lumper", label: "Lumper", hasDriver: false },
  { value: "late_fee", label: "Late Fee", hasDriver: true },
  { value: "no_tracking_fee", label: "No Tracking Fee", hasDriver: true },
  { value: "wrong_address_fee", label: "Wrong Address Fee", hasDriver: true },
  { value: "tonu", label: "TONU", hasDriver: true },
  { value: "other_charges", label: "Other Charges", hasDriver: true },
  { value: "other_additionals", label: "Other Additionals", hasDriver: true },
] as const;

type AdditionalType = typeof ADDITIONAL_TYPES[number]["value"];

export interface AdditionalItem {
  id: string;
  type: AdditionalType;
  companyAmount: string;
  driverAmount: string;
  isEditing?: boolean;
}

interface OrderAdditionalsManagerProps {
  // Individual state values from parent
  detention: string;
  setDetention: (value: string) => void;
  detentionDriver: string;
  setDetentionDriver: (value: string) => void;
  layover: string;
  setLayover: (value: string) => void;
  layoverDriver: string;
  setLayoverDriver: (value: string) => void;
  extraStop: string;
  setExtraStop: (value: string) => void;
  lumper: string;
  setLumper: (value: string) => void;
  lateFee: string;
  setLateFee: (value: string) => void;
  lateFeeDriver: string;
  setLateFeeDriver: (value: string) => void;
  noTrackingFee: string;
  setNoTrackingFee: (value: string) => void;
  noTrackingFeeDriver: string;
  setNoTrackingFeeDriver: (value: string) => void;
  wrongAddressFee: string;
  setWrongAddressFee: (value: string) => void;
  wrongAddressFeeDriver: string;
  setWrongAddressFeeDriver: (value: string) => void;
  tonu: string;
  setTonu: (value: string) => void;
  tonuDriver: string;
  setTonuDriver: (value: string) => void;
  otherCharges: string;
  setOtherCharges: (value: string) => void;
  otherChargesDriver: string;
  setOtherChargesDriver: (value: string) => void;
  otherChargesReason: string;
  setOtherChargesReason: (value: string) => void;
  otherAdditionals: string;
  setOtherAdditionals: (value: string) => void;
  otherAdditionalsDriver: string;
  setOtherAdditionalsDriver: (value: string) => void;
  otherAdditionalsReason: string;
  setOtherAdditionalsReason: (value: string) => void;
  // Special handlers for TONU
  onTonuChange?: (value: string) => void;
  isLocked: boolean;
}

export const OrderAdditionalsManager = ({
  detention,
  setDetention,
  detentionDriver,
  setDetentionDriver,
  layover,
  setLayover,
  layoverDriver,
  setLayoverDriver,
  extraStop,
  setExtraStop,
  lumper,
  setLumper,
  lateFee,
  setLateFee,
  lateFeeDriver,
  setLateFeeDriver,
  noTrackingFee,
  setNoTrackingFee,
  noTrackingFeeDriver,
  setNoTrackingFeeDriver,
  wrongAddressFee,
  setWrongAddressFee,
  wrongAddressFeeDriver,
  setWrongAddressFeeDriver,
  tonu,
  setTonu,
  tonuDriver,
  setTonuDriver,
  otherCharges,
  setOtherCharges,
  otherChargesDriver,
  setOtherChargesDriver,
  otherChargesReason,
  setOtherChargesReason,
  otherAdditionals,
  setOtherAdditionals,
  otherAdditionalsDriver,
  setOtherAdditionalsDriver,
  otherAdditionalsReason,
  setOtherAdditionalsReason,
  onTonuChange,
  isLocked,
}: OrderAdditionalsManagerProps) => {
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AdditionalType | "">("");
  const [newCompanyAmount, setNewCompanyAmount] = useState("");
  const [newDriverAmount, setNewDriverAmount] = useState("");
  
  // Track which items are in edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompanyAmount, setEditCompanyAmount] = useState("");
  const [editDriverAmount, setEditDriverAmount] = useState("");

  // Helper to get value and setter for each type
  const getTypeHandlers = (type: AdditionalType) => {
    switch (type) {
      case "detention":
        return { company: detention, setCompany: setDetention, driver: detentionDriver, setDriver: setDetentionDriver };
      case "layover":
        return { company: layover, setCompany: setLayover, driver: layoverDriver, setDriver: setLayoverDriver };
      case "extra_stop":
        return { company: extraStop, setCompany: setExtraStop, driver: "", setDriver: () => {} };
      case "lumper":
        return { company: lumper, setCompany: setLumper, driver: "", setDriver: () => {} };
      case "late_fee":
        return { company: lateFee, setCompany: setLateFee, driver: lateFeeDriver, setDriver: setLateFeeDriver };
      case "no_tracking_fee":
        return { company: noTrackingFee, setCompany: setNoTrackingFee, driver: noTrackingFeeDriver, setDriver: setNoTrackingFeeDriver };
      case "wrong_address_fee":
        return { company: wrongAddressFee, setCompany: setWrongAddressFee, driver: wrongAddressFeeDriver, setDriver: setWrongAddressFeeDriver };
      case "tonu":
        return { 
          company: tonu, 
          setCompany: onTonuChange || setTonu, 
          driver: tonuDriver, 
          setDriver: setTonuDriver 
        };
      case "other_charges":
        return { company: otherCharges, setCompany: setOtherCharges, driver: otherChargesDriver, setDriver: setOtherChargesDriver };
      case "other_additionals":
        return { company: otherAdditionals, setCompany: setOtherAdditionals, driver: otherAdditionalsDriver, setDriver: setOtherAdditionalsDriver };
      default:
        return { company: "", setCompany: () => {}, driver: "", setDriver: () => {} };
    }
  };

  // Build list of active additionals from current state
  const activeAdditionals = useMemo(() => {
    const items: AdditionalItem[] = [];
    
    ADDITIONAL_TYPES.forEach((typeInfo) => {
      const handlers = getTypeHandlers(typeInfo.value);
      const companyVal = parseFloat(handlers.company) || 0;
      const driverVal = parseFloat(handlers.driver) || 0;
      
      if (companyVal > 0 || driverVal > 0) {
        items.push({
          id: typeInfo.value,
          type: typeInfo.value,
          companyAmount: handlers.company,
          driverAmount: handlers.driver,
        });
      }
    });
    
    return items;
  }, [detention, detentionDriver, layover, layoverDriver, extraStop, lumper, lateFee, lateFeeDriver, noTrackingFee, noTrackingFeeDriver, wrongAddressFee, wrongAddressFeeDriver, tonu, tonuDriver, otherCharges, otherChargesDriver, otherAdditionals, otherAdditionalsDriver]);

  // Get types that are already added (for filtering dropdown)
  const usedTypes = useMemo(() => {
    return activeAdditionals.map(a => a.type);
  }, [activeAdditionals]);

  // Available types for adding (not already used)
  const availableTypes = useMemo(() => {
    return ADDITIONAL_TYPES.filter(t => !usedTypes.includes(t.value));
  }, [usedTypes]);

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
      e.preventDefault();
    }
  };

  const handleAddAdditional = () => {
    if (!selectedType || isLocked) return;
    
    const handlers = getTypeHandlers(selectedType);
    handlers.setCompany(newCompanyAmount || "0");
    if (ADDITIONAL_TYPES.find(t => t.value === selectedType)?.hasDriver) {
      handlers.setDriver(newDriverAmount || "0");
    }
    
    // Reset form
    setSelectedType("");
    setNewCompanyAmount("");
    setNewDriverAmount("");
    setTypeOpen(false);
  };

  const handleRemoveAdditional = (type: AdditionalType) => {
    if (isLocked) return;
    
    const handlers = getTypeHandlers(type);
    handlers.setCompany("");
    handlers.setDriver("");
    
    // Clear reason for other charges and other additionals
    if (type === "other_charges") {
      setOtherChargesReason("");
    } else if (type === "other_additionals") {
      setOtherAdditionalsReason("");
    }
  };

  const handleStartEdit = (item: AdditionalItem) => {
    if (isLocked) return;
    setEditingId(item.id);
    setEditCompanyAmount(item.companyAmount);
    setEditDriverAmount(item.driverAmount);
  };

  const handleSaveEdit = (type: AdditionalType) => {
    const handlers = getTypeHandlers(type);
    handlers.setCompany(editCompanyAmount || "0");
    if (ADDITIONAL_TYPES.find(t => t.value === type)?.hasDriver) {
      handlers.setDriver(editDriverAmount || "0");
    }
    setEditingId(null);
    setEditCompanyAmount("");
    setEditDriverAmount("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditCompanyAmount("");
    setEditDriverAmount("");
  };

  const getTypeLabel = (type: AdditionalType) => {
    return ADDITIONAL_TYPES.find(t => t.value === type)?.label || type;
  };

  const typeHasDriver = (type: AdditionalType) => {
    return ADDITIONAL_TYPES.find(t => t.value === type)?.hasDriver ?? false;
  };

  const selectedTypeInfo = ADDITIONAL_TYPES.find(t => t.value === selectedType);

  return (
    <div className="space-y-4">
      {/* List of active additionals */}
      {activeAdditionals.length > 0 && (
        <div className="space-y-2">
          {activeAdditionals.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-green-50/50 dark:bg-green-950/20 rounded-lg border border-green-200/50 dark:border-green-800/30"
            >
              {editingId === item.id ? (
                // Edit mode
                <>
                  <Badge variant="secondary" className="shrink-0">
                    {getTypeLabel(item.type)}
                  </Badge>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Company:</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={editCompanyAmount}
                        onKeyDown={handleNumericKeyDown}
                        onChange={(e) => setEditCompanyAmount(e.target.value)}
                        className="h-8 w-24"
                        autoFocus
                      />
                    </div>
                    {typeHasDriver(item.type) && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Driver:</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editDriverAmount}
                          onKeyDown={handleNumericKeyDown}
                          onChange={(e) => setEditDriverAmount(e.target.value)}
                          className="h-8 w-24"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSaveEdit(item.type)}
                      className="h-8 px-2 text-green-600 hover:text-green-700"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                // View mode
                <>
                  <Badge variant="secondary" className="shrink-0">
                    {getTypeLabel(item.type)}
                  </Badge>
                  <div className="flex items-center gap-4 flex-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Company:</span>{" "}
                      <span className="font-medium">${parseFloat(item.companyAmount || "0").toFixed(2)}</span>
                    </span>
                    {typeHasDriver(item.type) && (
                      <span>
                        <span className="text-muted-foreground">Driver:</span>{" "}
                        <span className="font-medium">${parseFloat(item.driverAmount || "0").toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                  {!isLocked && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(item)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAdditional(item.type)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new additional form */}
      {!isLocked && availableTypes.length > 0 && (
        <div className="flex items-end gap-3 p-3 bg-muted/30 rounded-lg border border-dashed">
          <div className="space-y-1.5 flex-1 max-w-[200px]">
            <Label className="text-xs">Type</Label>
            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={typeOpen}
                  className="w-full justify-between h-9"
                >
                  {selectedType
                    ? getTypeLabel(selectedType)
                    : "Select type..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search type..." />
                  <CommandList>
                    <CommandEmpty>No type found.</CommandEmpty>
                    <CommandGroup>
                      {availableTypes.map((type) => (
                        <CommandItem
                          key={type.value}
                          value={type.value}
                          onSelect={(currentValue) => {
                            setSelectedType(currentValue as AdditionalType);
                            setTypeOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedType === type.value ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {type.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5 w-24">
            <Label className="text-xs">Company</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={newCompanyAmount}
              onKeyDown={handleNumericKeyDown}
              onChange={(e) => setNewCompanyAmount(e.target.value)}
              className="h-9"
              disabled={!selectedType}
            />
          </div>

          {selectedTypeInfo?.hasDriver && (
            <div className="space-y-1.5 w-24">
              <Label className="text-xs">Driver</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newDriverAmount}
                onKeyDown={handleNumericKeyDown}
                onChange={(e) => setNewDriverAmount(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddAdditional}
            disabled={!selectedType || (!newCompanyAmount && !newDriverAmount)}
            className="h-9"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      )}

      {activeAdditionals.length === 0 && !isLocked && availableTypes.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No additional charges added. Use the form above to add detention, layover, etc.
        </p>
      )}
    </div>
  );
};
