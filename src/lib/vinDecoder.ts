export const normalizeVin = (vin: string) => vin.trim().toUpperCase();
export const isCompleteVin = (vin: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin));

export interface VinSpecs { make: string; model: string; year: string; engine?: string }

export function mapVinSpecs(row: Record<string, unknown>, includeEngine: boolean): VinSpecs {
  const value = (key: string) => typeof row[key] === "string" ? row[key].trim() : "";
  const errors = value("ErrorCode").split(",").map(code => code.trim());
  if (errors.some(code => code && code !== "0")) throw new Error("VIN could not be decoded reliably. Check the VIN or enter details manually.");
  const vehicleType = value("VehicleType").toUpperCase();
  const bodyClass = value("BodyClass").toUpperCase();
  const isTrailer = vehicleType === "TRAILER" || bodyClass === "TRAILER";
  const isTruck = vehicleType === "TRUCK" || bodyClass === "TRUCK-TRACTOR";
  if (includeEngine && isTrailer) throw new Error("Warning: this VIN belongs to a trailer. You are adding a truck. Check the VIN or use Add Trailer.");
  if (!includeEngine && isTruck) throw new Error("Warning: this VIN belongs to a truck. You are adding a trailer. Check the VIN or use Add Truck.");
  const specs: VinSpecs = { make: value("Make"), model: value("Model"), year: /^\d{4}$/.test(value("ModelYear")) ? value("ModelYear") : "" };
  if (includeEngine) specs.engine = value("EngineModel");
  if (!specs.make && !specs.model && !specs.year) throw new Error("No vehicle details found. Enter them manually.");
  return specs;
}

export async function decodeVin(vin: string, includeEngine: boolean, signal: AbortSignal): Promise<VinSpecs> {
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(normalizeVin(vin))}?format=json`, { signal });
  if (!response.ok) throw new Error("VIN lookup unavailable. You can enter details manually.");
  const data = await response.json();
  if (!data?.Results?.[0]) throw new Error("No vehicle details found. Enter them manually.");
  return mapVinSpecs(data.Results[0], includeEngine);
}
