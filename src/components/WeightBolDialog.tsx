import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface WeightBolDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (weight: number) => void;
  defaultValue?: number | null;
}

export const WeightBolDialog = ({ open, onCancel, onConfirm, defaultValue }: WeightBolDialogProps) => {
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    if (open) {
      setValue(defaultValue != null ? String(defaultValue) : "");
    }
  }, [open, defaultValue]);

  const handleConfirm = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    onConfirm(num);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter BOL Weight</DialogTitle>
          <DialogDescription>
            Enter the weight (lbs) from the Bill of Lading you are uploading.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="weight-bol-input">Weight (lbs)</Label>
          <Input
            id="weight-bol-input"
            type="number"
            min={0}
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            placeholder="e.g. 28000"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!value || isNaN(parseFloat(value))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Compare BOL weight to RC weight and return a warning message if the BOL weight
 * is more than 10% larger than the RC weight. Returns null if no warning is needed
 * (RC weight missing/zero, or BOL <= 110% of RC).
 */
export function getWeightDiscrepancyWarning(weightBol: number, weightRc: number | null | undefined): string | null {
  if (!weightRc || weightRc <= 0) return null;
  if (weightBol <= weightRc) return null;
  const diffPct = ((weightBol - weightRc) / weightRc) * 100;
  if (diffPct > 10) {
    return `BOL weight (${weightBol.toLocaleString()} lbs) is ${diffPct.toFixed(1)}% higher than RC weight (${weightRc.toLocaleString()} lbs). Please check the RC — the load might weigh more than listed.`;
  }
  return null;
}

export const SCALE_TICKET_THRESHOLD_LBS = 30000;

export function needsScaleTicket(weightBol: number | null | undefined, orderFiles: Array<{ file_category?: string }> | undefined): boolean {
  if (!weightBol || weightBol < SCALE_TICKET_THRESHOLD_LBS) return false;
  const hasAdditional = (orderFiles || []).some((f) => (f.file_category || "").toUpperCase() === "ADDITIONAL");
  return !hasAdditional;
}