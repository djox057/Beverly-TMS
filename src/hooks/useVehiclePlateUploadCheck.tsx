import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VehiclePlateReviewDialog } from "@/components/VehiclePlateReviewDialog";
import { compareVehicleDocument, needsPlateReview, normalizePlate, type VehiclePlateResult } from "../../supabase/functions/_shared/vehiclePlateCheck";

export interface FilePlateCheck extends VehiclePlateResult {
  fileName: string;
}

export function useVehiclePlateUploadCheck(vehicleType: "truck" | "trailer", vehicleId: string, vehicleNumber?: string) {
  const [checks, setChecks] = useState<FilePlateCheck[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resolveReview = useRef<((approved: boolean) => void) | null>(null);
  const version = useRef(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const table = vehicleType === "truck" ? "trucks" : "trailers";

  useEffect(() => {
    version.current += 1;
    setChecks(null);
    setProgress(null);
    setIsSaving(false);
    setSaveError(null);
    return () => {
      version.current += 1;
      resolveReview.current?.(false);
      resolveReview.current = null;
    };
  }, [vehicleId, vehicleType]);

  const finish = (approved: boolean) => {
    resolveReview.current?.(approved);
    resolveReview.current = null;
    setChecks(null);
  };

  const reviewFiles = async (files: File[]): Promise<boolean> => {
    const requestVersion = version.current;
    setSaveError(null);
    setProgress(`Checking plates (0/${files.length})...`);
    try {
      const { data: vehicle, error } = await supabase.from(table).select("plate,vin").eq("id", vehicleId).single();
      if (error || !vehicle) throw new Error("Could not read the vehicle's plate number");
      const results: FilePlateCheck[] = [];
      // Bound concurrent OCR calls so multi-file uploads do not overwhelm the provider.
      for (let i = 0; i < files.length; i += 2) {
        const batch = await Promise.all(files.slice(i, i + 2).map(async (file): Promise<FilePlateCheck> => {
          const body = new FormData();
          body.append("file", file);
          body.append("vehicleType", vehicleType);
          body.append("vehicleId", vehicleId);
          try {
            const { data, error: invokeError } = await supabase.functions.invoke("check-vehicle-document", { body, timeout: 60000 });
            if (invokeError || !data?.data || !Array.isArray(data.data.detectedPlates)) throw new Error("Plate check failed");
            return { ...data.data, fileName: file.name };
          } catch {
            return { fileName: file.name, status: "error", currentPlate: vehicle.plate, currentVin: vehicle.vin,
              detectedPlate: null, detectedPlates: [], documentVin: null, vinMatches: null, canUpdatePlate: false };
          }
        }));
        if (version.current !== requestVersion) return false;
        results.push(...batch);
        setProgress(`Checking plates (${results.length}/${files.length})...`);
      }
      if (!results.some(needsPlateReview)) {
        toast({ title: "Plate check passed", description: "The document plate numbers match this vehicle." });
        return true;
      }
      setProgress("Waiting for plate review...");
      setChecks(results);
      return await new Promise<boolean>((resolve) => { resolveReview.current = resolve; });
    } finally {
      if (version.current === requestVersion) setProgress(null);
    }
  };

  const savePlate = async (value: string) => {
    const plate = value.trim().toUpperCase();
    if (!checks || !normalizePlate(plate) || plate.length > 24 || !/^[A-Z0-9 -]+$/.test(plate)) {
      setSaveError("Enter a valid plate number (letters, numbers, spaces or hyphens, up to 24 characters).");
      return;
    }
    const requestVersion = version.current;
    const previous = checks[0].currentPlate;
    setIsSaving(true);
    setSaveError(null);
    try {
      // Caller-scoped update preserves existing RLS. Compare-and-set protects another user's edit.
      let update = supabase.from(table).update({ plate }).eq("id", vehicleId);
      update = previous === null ? update.is("plate", null) : update.eq("plate", previous);
      const { data, error } = await update.select("id,plate").single();
      if (error || !data) throw new Error("Could not update the plate. Check your edit permissions; the plate may have changed. Cancel and retry to refresh it.");
      if (version.current !== requestVersion) return;
      setChecks((rows) => rows?.map((row) => {
        if (row.status === "error" || row.status === "unsupported" || row.status === "wrong_vehicle") return { ...row, currentPlate: plate };
        const compared = compareVehicleDocument({ vehicles: row.detectedPlates.map((p) => ({ plate: p, vin: row.documentVin, confidence: 1 })) }, plate, row.currentVin);
        return { ...row, ...compared, currentPlate: plate, canUpdatePlate: row.canUpdatePlate };
      }) || null);
      await queryClient.invalidateQueries({ queryKey: [table] });
      toast({ title: "Plate updated", description: `${vehicleType === "truck" ? "Truck" : "Trailer"} ${vehicleNumber || ""}: ${plate}` });
    } catch (error) {
      if (version.current === requestVersion) setSaveError(error instanceof Error ? error.message : "Failed to update plate");
    } finally {
      if (version.current === requestVersion) setIsSaving(false);
    }
  };

  return {
    reviewFiles,
    progress,
    dialog: <VehiclePlateReviewDialog checks={checks} vehicleType={vehicleType} vehicleNumber={vehicleNumber}
      isSaving={isSaving} saveError={saveError} onSavePlate={savePlate} onCancel={() => finish(false)} onContinue={() => finish(true)} />,
  };
}
