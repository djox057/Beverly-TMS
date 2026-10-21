export interface MoneyCodeDetails {
  purposeDetail: string;
  isTrailerRepair: boolean;
  trailerNumber: string;
  locationName: string;
  locationAddress: string;
}
export interface MoneyCodeRequest extends MoneyCodeDetails {
  truckNumber: string;
  driverName: string;
  amount: number;
  purpose: string;
}
const genericPurposes = /^(cash\s*advance|advance|cash|repairs?|fuel|other|custom|tow|toll|scale(?:\s*ticket)?|truck\s*wash|escort|straps?)\s*[.!]?$/i;
export function isDetailedEfsPurpose(value: string): boolean {
  return value.trim().length >= 8 && !genericPurposes.test(value.trim()) && /[a-z]/i.test(value) && !/[\u0400-\u04ff]/.test(value);
}
export function requiresEfsLocation(purpose: string, isTrailerRepair = false): boolean {
  return isTrailerRepair || /fuel|repair|alignment/i.test(purpose);
}
export function getMoneyCodeDetailsError(details: MoneyCodeDetails, purpose: string): string | null {
  if (!isDetailedEfsPurpose(details.purposeDetail)) return "Enter a detailed purpose in English, for example: Trailer alignment. A category alone is not enough.";
  if (details.purposeDetail.length > 1000) return "Keep the purpose under 1,000 characters.";
  if (!details.isTrailerRepair && /\btrailer\b/i.test(details.purposeDetail)
    && /repair|alignment|brake|tire|wheel|axle|suspension/i.test(`${purpose} ${details.purposeDetail}`))
    return "Mark this as a trailer repair and enter its trailer number.";
  if (details.isTrailerRepair && !details.trailerNumber.trim()) return "Trailer number is required for a trailer repair.";
  if (requiresEfsLocation(`${purpose} ${details.purposeDetail}`, details.isTrailerRepair)) {
    if (!details.locationName.trim()) return "Enter the business name where the code will be used.";
    if (details.locationAddress.trim().length < 10 || !/\d/.test(details.locationAddress)) return "Enter the full address where the code will be used.";
  }
  return null;
}
export function formatEfsMoneyCode(request: MoneyCodeRequest): string {
  const error = getMoneyCodeDetailsError(request, request.purpose);
  if (error) throw new Error(error);
  if (!Number.isFinite(request.amount) || request.amount <= 0) throw new Error("Amount must be greater than zero.");
  const line = (value: string) => value.trim().replace(/\s+/g, " ");
  const unit = [line(request.truckNumber) || "N/A", ...(request.isTrailerRepair ? [line(request.trailerNumber)] : [])].join(" / ");
  const location = [line(request.locationName), line(request.locationAddress)].filter(Boolean).join(" ") || "N/A";
  return `EFS Money Code\n\nUnit: ${unit}\nDriver: ${line(request.driverName)}\nPurpose: ${line(request.purposeDetail)}\nAmount: $${request.amount.toFixed(2)}\nLocation: ${location}`;
}
export function readMoneyCodeDetails(body: Record<string, unknown>): MoneyCodeDetails {
  const string = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  return { purposeDetail: string("purposeDetail"), isTrailerRepair: body.isTrailerRepair === true,
    trailerNumber: string("trailerNumber"), locationName: string("locationName"), locationAddress: string("locationAddress") };
}
