import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FilePlateCheck } from "@/hooks/useVehiclePlateUploadCheck";

const messages = {
  match: "Plate matches this vehicle.",
  mismatch: "The document plate does not match the vehicle's plate in TMS.",
  missing_plate: "This vehicle has no plate number in TMS.",
  unreadable: "No plate number could be read with confidence. Check this file manually.",
  ambiguous: "Several different plates were found. Check which vehicle this document belongs to.",
  wrong_vehicle: "The document VIN does not match this vehicle. This file may belong to another truck or trailer.",
  unsupported: "AI checking supports PDF, JPEG, PNG, WebP, HEIC and HEIF files. Check this file manually.",
  error: "AI checking was unavailable or this file could not be processed (12 MB maximum). Check it manually.",
};

interface Props {
  checks: FilePlateCheck[] | null;
  vehicleType: "truck" | "trailer";
  vehicleNumber?: string;
  isSaving: boolean;
  saveError: string | null;
  onSavePlate: (plate: string) => Promise<void>;
  onCancel: () => void;
  onContinue: () => void;
}

export function VehiclePlateReviewDialog({ checks, vehicleType, vehicleNumber, isSaving, saveError, onSavePlate, onCancel, onContinue }: Props) {
  const [plate, setPlate] = useState("");
  const isOpen = checks !== null;
  const currentPlate = checks?.[0]?.currentPlate;
  useEffect(() => { setPlate(currentPlate || ""); }, [isOpen, currentPlate]);
  const canEdit = checks?.some((row) => row.canUpdatePlate) && checks.some((row) => row.status !== "match");
  const warnings = checks?.some((row) => row.status !== "match");
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { if (isSaving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Review vehicle plate</DialogTitle>
          <DialogDescription>
            {vehicleType === "truck" ? "Truck" : "Trailer"} {vehicleNumber || ""} · TMS plate: <strong>{currentPlate || "Not set"}</strong>.
            {" "}Review the file before uploading. AI readings can be incorrect.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {checks?.map((row, index) => (
            <div key={index} className={`rounded-md border p-3 space-y-1 ${row.status === "match" ? "border-green-200 bg-green-50/50" : "border-amber-300 bg-amber-50/50"}`}>
              <div className="flex items-start gap-2">
                {row.status === "match" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />}
                <p className="font-medium text-sm break-all">{row.fileName}</p>
              </div>
              <p className="text-sm">{messages[row.status]}</p>
              <p className="text-sm">Document plate: <strong>{row.detectedPlates.join(", ") || "Not readable"}</strong></p>
              {row.vinMatches === false && <p className="text-sm text-destructive">Document VIN: {row.documentVin || "Multiple different VINs"}<br />TMS VIN: {row.currentVin}</p>}
              {row.detectedPlate && row.canUpdatePlate && row.status !== "match" && row.status !== "wrong_vehicle" && (
                <Button size="sm" variant="outline" disabled={isSaving} onClick={() => setPlate(row.detectedPlate!)}>Use {row.detectedPlate}</Button>
              )}
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="rounded-md border p-3 space-y-2">
            <Label htmlFor="vehicle-plate-correction">Change this vehicle's plate number in TMS</Label>
            <div className="flex gap-2">
              <Input id="vehicle-plate-correction" value={plate} maxLength={24} disabled={isSaving} onChange={(e) => setPlate(e.target.value)} placeholder="Correct plate number" />
              <Button disabled={isSaving || !plate.trim()} onClick={() => onSavePlate(plate)}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save plate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Only save after verifying that the document belongs to this vehicle. Saving changes the vehicle record immediately.</p>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          </div>
        ) : warnings ? <p className="text-sm text-muted-foreground">A user with vehicle edit permission can correct the plate number.</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={onCancel}>Cancel upload</Button>
          <Button disabled={isSaving} onClick={onContinue}>{warnings ? "Upload anyway — keep current plate" : "Continue upload"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
