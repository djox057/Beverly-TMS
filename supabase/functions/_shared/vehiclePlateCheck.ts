export type PlateCheckStatus = "match" | "mismatch" | "missing_plate" | "unreadable" | "ambiguous" | "wrong_vehicle" | "unsupported" | "error";

export interface VehiclePlateResult {
  status: PlateCheckStatus;
  currentPlate: string | null;
  currentVin: string | null;
  detectedPlate: string | null;
  detectedPlates: string[];
  documentVin: string | null;
  vinMatches: boolean | null;
  canUpdatePlate: boolean;
}

export const normalizePlate = (value: string | null | undefined) =>
  (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const cleanPlate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const plate = value.trim();
  return plate.length <= 24 && /^[a-zA-Z0-9 -]+$/.test(plate) && normalizePlate(plate).length >= 2 ? plate : null;
};

const cleanVin = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const vin = normalizePlate(value);
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
};

// Compare identifiers in code; never trust a model's claimed match or infer a plate from a filename.
export function compareVehicleDocument(raw: unknown, currentPlate: string | null, currentVin: string | null): VehiclePlateResult {
  const result: VehiclePlateResult = {
    status: "unreadable", currentPlate, currentVin, detectedPlate: null,
    detectedPlates: [], documentVin: null, vinMatches: null, canUpdatePlate: false,
  };
  const records = raw && typeof raw === "object" && "vehicles" in raw ? (raw as { vehicles: unknown }).vehicles : null;
  if (!Array.isArray(records)) throw new Error("Invalid AI response");
  const readings = records.slice(0, 100).flatMap((record) => {
    if (!record || typeof record !== "object" || typeof record.confidence !== "number" || record.confidence < 0.85 || record.confidence > 1) return [];
    const plate = cleanPlate(record.plate);
    const vin = cleanVin(record.vin);
    return plate || vin ? [{ plate, vin }] : [];
  });
  const expectedVin = cleanVin(currentVin);
  const matchingVin = expectedVin ? readings.filter((r) => r.vin === expectedVin) : [];
  // Prefer the VIN's row in schedules containing several vehicles; never mix plates between rows.
  const relevant = matchingVin.length ? matchingVin : readings;
  result.detectedPlates = [...new Map(relevant.filter((r) => r.plate).map((r) => [normalizePlate(r.plate), r.plate!])).values()];
  const vins = [...new Set(relevant.map((r) => r.vin).filter((v): v is string => !!v))];
  result.documentVin = vins.length === 1 ? vins[0] : null;
  result.vinMatches = expectedVin && vins.length ? vins.includes(expectedVin) : null;
  if (result.vinMatches === false) {
    result.status = "wrong_vehicle";
    result.detectedPlate = result.detectedPlates.length === 1 ? result.detectedPlates[0] : null;
    return result;
  }
  if (!result.detectedPlates.length) return result;
  const match = normalizePlate(currentPlate) ? result.detectedPlates.find((p) => normalizePlate(p) === normalizePlate(currentPlate)) : null;
  if (match) {
    result.detectedPlate = match;
    result.status = "match";
  } else if (result.detectedPlates.length > 1) {
    result.status = "ambiguous";
  } else {
    result.detectedPlate = result.detectedPlates[0];
    result.status = normalizePlate(currentPlate) ? "mismatch" : "missing_plate";
  }
  return result;
}

export function needsPlateReview(result: VehiclePlateResult) {
  return result.status !== "match";
}
