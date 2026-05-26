import { useRef, useState, useMemo, useImperativeHandle, forwardRef } from "react";
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
import { Plus, Trash2, Check, ChevronsUpDown, Pencil, Paperclip, Upload, Loader2 } from "lucide-react";
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

// Types that allow multiple entries (one per reason)
const MULTI_ENTRY_TYPES: AdditionalType[] = ["other_charges", "other_additionals", "lumper"];

export interface OtherItem {
  amount: number;
  driverAmount: number;
  reason: string;
}

export interface LumperItem {
  amount: number;
  reason: string;
  file_path: string | null;
  file_name: string | null;
}

export interface AdditionalItem {
  // Stable id used as React key. For single-value types it's the type slug,
  // for multi-entry types it's `${type}-${index}`.
  id: string;
  type: AdditionalType;
  // For multi-entry types, the index inside the items array. Undefined otherwise.
  index?: number;
  companyAmount: string;
  driverAmount: string;
  reason?: string;
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
  // Lumper is now multi-entry, each with its own amount, optional reason, and file
  lumperItems: LumperItem[];
  setLumperItems: (items: LumperItem[]) => void;
  onUploadLumperReceipt?: (index: number, file: File) => Promise<void>;
  onDeleteLumperReceipt?: (index: number) => Promise<void>;
  onViewLumperReceipt?: (item: LumperItem) => void;
  uploadingLumperIndex?: number | null;
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
  // Multi-entry: arrays of items each with its own reason
  otherChargesItems: OtherItem[];
  setOtherChargesItems: (items: OtherItem[]) => void;
  otherAdditionalsItems: OtherItem[];
  setOtherAdditionalsItems: (items: OtherItem[]) => void;
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
  lumperItems,
  setLumperItems,
  onUploadLumperReceipt,
  onDeleteLumperReceipt,
  onViewLumperReceipt,
  uploadingLumperIndex,
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
  otherChargesItems,
  setOtherChargesItems,
  otherAdditionalsItems,
  setOtherAdditionalsItems,
  onTonuChange,
  isLocked,
}, ref) => {
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AdditionalType | "">("");
  const [newCompanyAmount, setNewCompanyAmount] = useState("");
  const [newDriverAmount, setNewDriverAmount] = useState("");
  const [newReason, setNewReason] = useState("");
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Track which item is in edit mode (use AdditionalItem.id as key)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompanyAmount, setEditCompanyAmount] = useState("");
  const [editDriverAmount, setEditDriverAmount] = useState("");
  const [editReason, setEditReason] = useState("");

  // Helper to get value and setter for single-value types only
  const getSingleTypeHandlers = (type: AdditionalType) => {
    switch (type) {
      case "detention":
        return { company: detention, setCompany: setDetention, driver: detentionDriver, setDriver: setDetentionDriver };
      case "layover":
        return { company: layover, setCompany: setLayover, driver: layoverDriver, setDriver: setLayoverDriver };
      case "extra_stop":
        return { company: extraStop, setCompany: setExtraStop, driver: "", setDriver: () => {} };
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
          setDriver: setTonuDriver,
        };
      default:
        return { company: "", setCompany: () => {}, driver: "", setDriver: () => {} };
    }
  };

  // Build list of active additionals from current state
  const activeAdditionals = useMemo(() => {
    const items: AdditionalItem[] = [];

    ADDITIONAL_TYPES.forEach((typeInfo) => {
      if (MULTI_ENTRY_TYPES.includes(typeInfo.value)) {
        if (typeInfo.value === "lumper") {
          (lumperItems || []).forEach((it, idx) => {
            if ((it.amount || 0) > 0 || (it.reason || "").trim() || it.file_path) {
              items.push({
                id: `lumper-${idx}`,
                type: "lumper",
                index: idx,
                companyAmount: String(it.amount ?? ""),
                driverAmount: "",
                reason: it.reason || "",
              });
            }
          });
        } else {
          const list = typeInfo.value === "other_charges" ? otherChargesItems : otherAdditionalsItems;
          (list || []).forEach((it, idx) => {
            if ((it.amount || 0) > 0 || (it.driverAmount || 0) > 0 || (it.reason || "").trim()) {
              items.push({
                id: `${typeInfo.value}-${idx}`,
                type: typeInfo.value,
                index: idx,
                companyAmount: String(it.amount ?? ""),
                driverAmount: String(it.driverAmount ?? ""),
                reason: it.reason || "",
              });
            }
          });
        }
      } else {
        const handlers = getSingleTypeHandlers(typeInfo.value);
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
      }
    });

    return items;
  }, [
    detention, detentionDriver, layover, layoverDriver, extraStop, lumperItems,
    lateFee, lateFeeDriver, noTrackingFee, noTrackingFeeDriver,
    wrongAddressFee, wrongAddressFeeDriver, tonu, tonuDriver,
    otherChargesItems, otherAdditionalsItems,
  ]);

  // Get types that are already added (for filtering dropdown). Multi-entry
  // types are always available so users can add more.
  const usedSingleTypes = useMemo(() => {
    return activeAdditionals
      .filter((a) => !MULTI_ENTRY_TYPES.includes(a.type))
      .map((a) => a.type);
  }, [activeAdditionals]);

  // Available types for adding
  const availableTypes = useMemo(() => {
    return ADDITIONAL_TYPES.filter(
      (t) => MULTI_ENTRY_TYPES.includes(t.value) || !usedSingleTypes.includes(t.value),
    );
  }, [usedSingleTypes]);

  const handleAddAdditional = (): boolean => {
    if (!selectedType || isLocked) return false;

    const requiresReason =
      MULTI_ENTRY_TYPES.includes(selectedType) && selectedType !== "lumper";
    if (requiresReason && !newReason.trim()) {
      return false;
    }

    if (!newCompanyAmount && !newDriverAmount) return false;

    if (selectedType === "lumper") {
      const next: LumperItem[] = [
        ...(lumperItems || []),
        {
          amount: parseFloat(newCompanyAmount) || 0,
          reason: newReason.trim(),
          file_path: null,
          file_name: null,
        },
      ];
      setLumperItems(next);
    } else if (selectedType === "other_charges") {
      const next = [
        ...(otherChargesItems || []),
        {
          amount: parseFloat(newCompanyAmount) || 0,
          driverAmount: parseFloat(newDriverAmount) || 0,
          reason: newReason.trim(),
        },
      ];
      setOtherChargesItems(next);
    } else if (selectedType === "other_additionals") {
      const next = [
        ...(otherAdditionalsItems || []),
        {
          amount: parseFloat(newCompanyAmount) || 0,
          driverAmount: parseFloat(newDriverAmount) || 0,
          reason: newReason.trim(),
        },
      ];
      setOtherAdditionalsItems(next);
    } else {
      const handlers = getSingleTypeHandlers(selectedType);
      handlers.setCompany(newCompanyAmount || "0");
      if (ADDITIONAL_TYPES.find((t) => t.value === selectedType)?.hasDriver) {
        handlers.setDriver(newDriverAmount || "0");
      }
    }

    // Reset form
    setSelectedType("");
    setNewCompanyAmount("");
    setNewDriverAmount("");
    setNewReason("");
    setTypeOpen(false);

    return true;
  };

  // Expose commitPendingAdditional to parent via ref
  useImperativeHandle(ref, () => ({
    commitPendingAdditional: () => {
      if (!selectedType) return false;
      if (!newCompanyAmount && !newDriverAmount) return false;
      if (
        MULTI_ENTRY_TYPES.includes(selectedType) &&
        selectedType !== "lumper" &&
        !newReason.trim()
      ) {
        return false;
      }

      let didAdd = false;
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

  const handleRemoveAdditional = (item: AdditionalItem) => {
    if (isLocked) return;

    if (item.type === "lumper" && item.index !== undefined) {
      // Best-effort delete of attached receipt
      if ((lumperItems[item.index]?.file_path) && onDeleteLumperReceipt) {
        void onDeleteLumperReceipt(item.index);
      }
      setLumperItems((lumperItems || []).filter((_, i) => i !== item.index));
      return;
    }
    if (item.type === "other_charges" && item.index !== undefined) {
      setOtherChargesItems((otherChargesItems || []).filter((_, i) => i !== item.index));
      return;
    }
    if (item.type === "other_additionals" && item.index !== undefined) {
      setOtherAdditionalsItems((otherAdditionalsItems || []).filter((_, i) => i !== item.index));
      return;
    }

    const handlers = getSingleTypeHandlers(item.type);
    handlers.setCompany("");
    handlers.setDriver("");
  };

  const handleStartEdit = (item: AdditionalItem) => {
    if (isLocked) return;
    setEditingId(item.id);
    setEditCompanyAmount(item.companyAmount);
    setEditDriverAmount(item.driverAmount);
    setEditReason(item.reason || "");
  };

  const handleSaveEdit = (item: AdditionalItem) => {
    const requiresReason = MULTI_ENTRY_TYPES.includes(item.type) && item.type !== "lumper";
    if (requiresReason && !editReason.trim()) {
      return;
    }

    if (item.type === "lumper" && item.index !== undefined) {
      const next = (lumperItems || []).map((it, i) =>
        i === item.index
          ? {
              ...it,
              amount: parseFloat(editCompanyAmount) || 0,
              reason: editReason.trim(),
            }
          : it,
      );
      setLumperItems(next);
    } else if (item.type === "other_charges" && item.index !== undefined) {
      const next = (otherChargesItems || []).map((it, i) =>
        i === item.index
          ? {
              amount: parseFloat(editCompanyAmount) || 0,
              driverAmount: parseFloat(editDriverAmount) || 0,
              reason: editReason.trim(),
            }
          : it,
      );
      setOtherChargesItems(next);
    } else if (item.type === "other_additionals" && item.index !== undefined) {
      const next = (otherAdditionalsItems || []).map((it, i) =>
        i === item.index
          ? {
              amount: parseFloat(editCompanyAmount) || 0,
              driverAmount: parseFloat(editDriverAmount) || 0,
              reason: editReason.trim(),
            }
          : it,
      );
      setOtherAdditionalsItems(next);
    } else {
      const handlers = getSingleTypeHandlers(item.type);
      handlers.setCompany(editCompanyAmount || "0");
      if (ADDITIONAL_TYPES.find((t) => t.value === item.type)?.hasDriver) {
        handlers.setDriver(editDriverAmount || "0");
      }
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

  const getTypeLabel = (type: AdditionalType) => {
    return ADDITIONAL_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getDisplayLabel = (item: AdditionalItem) => {
    if (item.type === "lumper") {
      const ordinal = (item.index ?? 0) + 1;
      const base = `Lumper ${ordinal}`;
      return item.reason?.trim() ? `${base} — ${item.reason.trim()}` : base;
    }
    if (MULTI_ENTRY_TYPES.includes(item.type) && item.reason?.trim()) {
      return item.reason.trim();
    }
    return getTypeLabel(item.type);
  };

  const typeRequiresReason = (type: AdditionalType) => {
    return MULTI_ENTRY_TYPES.includes(type) && type !== "lumper";
  };

  const typeHasDriver = (type: AdditionalType) => {
    return ADDITIONAL_TYPES.find((t) => t.value === type)?.hasDriver ?? false;
  };

  const selectedTypeInfo = ADDITIONAL_TYPES.find((t) => t.value === selectedType);

  // Types where the charge is a deduction (carrier pays out instead of receiving)
  const DEDUCTION_TYPES: AdditionalType[] = [
    "late_fee",
    "no_tracking_fee",
    "wrong_address_fee",
    "other_charges",
  ];
  const isDeductionType = (type: AdditionalType) => DEDUCTION_TYPES.includes(type);
  const companyLabel = (type: AdditionalType | "") =>
    type && isDeductionType(type as AdditionalType) ? "Carrier pays" : "Broker paid";
  const driverLabel = (type: AdditionalType | "") =>
    type && isDeductionType(type as AdditionalType) ? "Driver pays" : "Driver";

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
                  {selectedType ? getTypeLabel(selectedType) : "Select type..."}
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
                              selectedType === type.value ? "opacity-100" : "opacity-0",
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
            <Label className="text-xs">{companyLabel(selectedType)}</Label>
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
              <Label className="text-xs">{driverLabel(selectedType)}</Label>
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
              <Label className="text-xs">
                Reason <span className="text-destructive">*</span>
              </Label>
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
                    {getTypeLabel(item.type)}
                  </Badge>
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{companyLabel(item.type)}:</span>
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
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{driverLabel(item.type)}:</span>
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
                      onClick={() => handleSaveEdit(item)}
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
                    {getDisplayLabel(item)}
                  </Badge>
                  <div className="flex items-center gap-4 flex-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">{companyLabel(item.type)}:</span>{" "}
                      <span className="font-medium">${parseFloat(item.companyAmount || "0").toFixed(2)}</span>
                    </span>
                    {typeHasDriver(item.type) && (
                      <span>
                        <span className="text-muted-foreground">{driverLabel(item.type)}:</span>{" "}
                        <span className="font-medium">${parseFloat(item.driverAmount || "0").toFixed(2)}</span>
                      </span>
                    )}
                    {item.type === "lumper" && item.index !== undefined && (() => {
                      const idx = item.index;
                      const li = lumperItems[idx];
                      const isUploading = uploadingLumperIndex === idx;
                      if (li?.file_path) {
                        return (
                          <span className="flex items-center gap-1">
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                            <button
                              type="button"
                              onClick={() => onViewLumperReceipt?.(li)}
                              className="text-xs underline text-foreground hover:text-primary truncate max-w-[160px]"
                              title={li.file_name || "Receipt"}
                            >
                              {li.file_name || "Receipt"}
                            </button>
                            {!isLocked && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onDeleteLumperReceipt?.(idx)}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                disabled={isUploading}
                                title="Remove receipt"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </span>
                        );
                      }
                      if (isLocked) {
                        return (
                          <span className="text-xs text-muted-foreground italic">No receipt</span>
                        );
                      }
                      return (
                        <>
                          <input
                            ref={(el) => { fileInputRefs.current[idx] = el; }}
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f && onUploadLumperReceipt) {
                                await onUploadLumperReceipt(idx, f);
                              }
                              if (e.target) e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRefs.current[idx]?.click()}
                            className="h-7 px-2 text-xs"
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <Upload className="h-3.5 w-3.5 mr-1" />
                            )}
                            Upload receipt
                          </Button>
                        </>
                      );
                    })()}
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
                        onClick={() => handleRemoveAdditional(item)}
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
