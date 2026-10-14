import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { decodeVin, isCompleteVin, normalizeVin, type VinSpecs } from "@/lib/vinDecoder";

type VehicleForm = { vin: string; make: string; model: string; year: string; engine?: string };

export function useVinAutofill<T extends VehicleForm>(form: T, setForm: Dispatch<SetStateAction<T>>, active: boolean, includeEngine: boolean) {
  const [status, setStatus] = useState("");
  const previous = useRef<{ vin: string; specs: VinSpecs } | null>(null);
  const vin = normalizeVin(form.vin);
  useEffect(() => {
    if (!active) { previous.current = null; setStatus(""); return; }
    const old = previous.current;
    if (old && old.vin !== vin) {
      setForm(current => {
        const next = { ...current };
        for (const key of Object.keys(old.specs) as (keyof VinSpecs)[]) {
          if (next[key] === old.specs[key]) Object.assign(next, { [key]: "" });
        }
        return next;
      });
      previous.current = null;
    }
    if (!isCompleteVin(vin)) { setStatus(vin.length === 17 ? "Check VIN: use 17 letters/numbers without I, O, or Q." : ""); return; }
    const controller = new AbortController();
    let cancelled = false;
    setStatus("Looking up VIN…");
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const specs = await decodeVin(vin, includeEngine, controller.signal);
        if (cancelled) return;
        setForm(current => {
          if (normalizeVin(current.vin) !== vin) return current;
          const next = { ...current };
          const filled: VinSpecs = { make: "", model: "", year: "" };
          for (const key of Object.keys(specs) as (keyof VinSpecs)[]) {
            if (!current[key] && specs[key]) { Object.assign(next, { [key]: specs[key] }); Object.assign(filled, { [key]: specs[key] }); }
          }
          previous.current = { vin, specs: filled };
          return next;
        });
        setStatus("VIN details found. Review the fields; any missing details can be entered manually.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error && error.name !== "AbortError" ? error.message : "VIN lookup timed out. Enter details manually.");
      } finally { clearTimeout(timeout); }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [vin, active, includeEngine, setForm]);
  return status;
}
