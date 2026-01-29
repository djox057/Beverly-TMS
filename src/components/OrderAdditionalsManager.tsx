import { useState, useMemo, useImperativeHandle, forwardRef } from "react";
import { flushSync } from "react-dom";
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

export interface OrderAdditionalsManagerRef {
  /**
   * Attempts to add the currently-entered (but not yet added) additional.
   * Returns true if an additional was actually added.
   */
  commitPendingAdditional: () => boolean;
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

export const OrderAdditionalsManager = forwardRef<OrderAdditionalsManagerRef, OrderAdditionalsManagerProps>(({
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
}, ref) => {
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AdditionalType | "">("");
  const [newCompanyAmount, setNewCompanyAmount] = useState("");
  const [newDriverAmount, setNewDriverAmount] = useState("");
  const [newReason, setNewReason] = useState("");
  
  // Track which items are in edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompanyAmount, setEditCompanyAmount] = useState("");
  const [editDriverAmount, setEditDriverAmount] = useState("");
  const [editReason, setEditReason] = useState("");

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

  // Expose commitPendingAdditional to parent via ref
  useImperativeHandle(ref, () => ({
    commitPendingAdditional: () => {
      // Mirror the Add button behavior: do nothing if not enough info.
      if (!selectedType) return false;
      if (!newCompanyAmount && !newDriverAmount) return false;
      if ((selectedType === "other_charges" || selectedType === "other_additionals") && !newReason.trim()) {
        return false;
      }

      let didAdd = false;
      // Force React to apply the parent state updates immediately so the submit handler
      // can read the new values.
      flushSync(() => {
        didAdd = handleAddAdditional();
      });
      return didAdd;
    },
  }));

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
      e.preventDefault();
    }
  };

  const handleAddAdditional = (): boolean => {
    if (!selectedType || isLocked) return false;
    
    // Require reason for other_charges and other_additionals
    if ((selectedType === "other_charges" || selectedType === "other_additionals") && !newReason.trim()) {
      return false;
    }
    
    const handlers = getTypeHandlers(selectedType);
    handlers.setCompany(newCompanyAmount || "0");
    if (ADDITIONAL_TYPES.find(t => t.value === selectedType)?.hasDriver) {
      handlers.setDriver(newDriverAmount || "0");
    }
    
    // Set reason for other charges and other additionals
    if (selectedType === "other_charges") {
      setOtherChargesReason(newReason.trim());
    } else if (selectedType === "other_additionals") {
      setOtherAdditionalsReason(newReason.trim());
    }
    
    // Reset form
    setSelectedType("");
    setNewCompanyAmount("");
    setNewDriverAmount("");
    setNewReason("");
    setTypeOpen(false);

    return true;
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
    // Set current reason for other charges/additionals
    if (item.type === "other_charges") {
      setEditReason(otherChargesReason);
    } else if (item.type === "other_additionals") {
      setEditReason(otherAdditionalsReason);
    } else {
      setEditReason("");
    }
  };

  const handleSaveEdit = (type: AdditionalType) => {
    // Require reason for other_charges and other_additionals
    if ((type === "other_charges" || type === "other_additionals") && !editReason.trim()) {
      return;
    }
    
    const handlers = getTypeHandlers(type);
    handlers.setCompany(editCompanyAmount || "0");
    if (ADDITIONAL_TYPES.find(t => t.value === type)?.hasDriver) {
      handlers.setDriver(editDriverAmount || "0");
    }
    
    // Update reason for other charges and other additionals
    if (type === "other_charges") {
      setOtherChargesReason(editReason.trim());
    } else if (type === "other_additionals") {
      setOtherAdditionalsReason(editReason.trim());
    }
    
    setEditingId(null);
    setEditCompanyAmount("");
    setEditDriverAmount("");
    setEditReason("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditCompanyAmount("");
    setEditDriverAmount("");
    setEditReason("");
  };

  const getTypeLabel = (type: AdditionalType, useReason: boolean = false) => {
    // For other_charges and other_additionals, show the reason if available
    if (useReason) {
      if (type === "other_charges" && otherChargesReason.trim()) {
        return otherChargesReason.trim();
      }
      if (type === "other_additionals" && otherAdditionalsReason.trim()) {
        return otherAdditionalsReason.trim();
      }
    }
    return ADDITIONAL_TYPES.find(t => t.value === type)?.label || type;
  };
  
  const typeRequiresReason = (type: AdditionalType) => {
    return type === "other_charges" || type === "other_additionals";
  };

  const typeHasDriver = (type: AdditionalType) => {
    return ADDITIONAL_TYPES.find(t => t.value === type)?.hasDriver ?? false;
  };

  const selectedTypeInfo = ADDITIONAL_TYPES.find(t => t.value === selectedType);

  return (
    <div className="space-y-4">
      {/* Add new additional form - now ABOVE the list */}
      {!isLocked && availableTypes.length > 0 && (
        <div className="flex items-end gap-3 p-3 bg-muted/30 rounded-lg border border-dashed">
          <div className="space-y-1.5 flex-1 min-w-[200px] max-w-[280px]">
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
              <PopoverContent className="w-[280px] p-0 bg-popover z-50" align="start">
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

          <div className="space-y-1.5 w-28">
            <Label className="text-xs">Broker paid</Label>
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
            <div className="space-y-1.5 w-28">
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
                disabled={!newCompanyAmount || parseFloat(newCompanyAmount) <= 0}
              />
            </div>
          )}

          {selectedType && typeRequiresReason(selectedType) && (
            <div className="space-y-1.5 flex-1 min-w-[150px]">
              <Label className="text-xs">Reason <span className="text-destructive">*</span></Label>
              <Input
                type="text"
                placeholder="Enter reason..."
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddAdditional}
            disabled={!selectedType || (typeRequiresReason(selectedType) && !newReason.trim())}
            className="h-9 px-3"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      )}

      {/* List of active additionals - now BELOW the form */}
      {activeAdditionals.length > 0 ? (
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
                    {typeRequiresReason(item.type) ? (item.type === "other_charges" ? "Other Charges" : "Other Additionals") : getTypeLabel(item.type)}
                  </Badge>
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Broker paid:</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={editCompanyAmount}
                        onKeyDown={handleNumericKeyDown}
                        onChange={(e) => setEditCompanyAmount(e.target.value)}
                        className="h-8 w-28"
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
                          className="h-8 w-28"
                          disabled={!editCompanyAmount || parseFloat(editCompanyAmount) <= 0}
                        />
                      </div>
                    )}
                    {typeRequiresReason(item.type) && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Reason:</span>
                        <Input
                          type="text"
                          placeholder="Enter reason..."
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="h-8 w-40"
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
                      disabled={typeRequiresReason(item.type) && !editReason.trim()}
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
                    {getTypeLabel(item.type, true)}
                  </Badge>
                  <div className="flex items-center gap-4 flex-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Broker paid:</span>{" "}
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
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          No additional charges added. Use the form above to add detention, layover, etc.
        </p>
      )}
    </div>
  );
});
