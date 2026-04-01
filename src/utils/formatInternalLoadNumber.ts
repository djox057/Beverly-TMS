/**
 * Formats an internal load number for display.
 * Since the suffix is now stored directly in the database, this is a passthrough.
 */
export function formatInternalLoadNumber(
  internalLoadNumber: number | string | null | undefined,
  _companyName?: string | null | undefined
): string {
  if (internalLoadNumber === null || internalLoadNumber === undefined) {
    return "—";
  }
  return internalLoadNumber.toString();
}

/**
 * Gets the company suffix based on company name
 */
export function getCompanySuffix(companyName: string | null | undefined): string {
  if (!companyName) return "";
  
  const normalizedName = companyName.toLowerCase().trim();
  
  if (normalizedName.includes("bf prime united") || normalizedName === "bf prime united llc") {
    return "BFU";
  }
  if (normalizedName.includes("bf prime") || normalizedName === "bf prime llc") {
    return "BFP";
  }
  if (normalizedName.includes("beverly freight") || normalizedName === "beverly freight inc") {
    return "BF";
  }
  if (normalizedName.includes("united enterprise") || normalizedName === "united enterprise solutions inc") {
    return "UE";
  }
  if (normalizedName.includes("bg prime") || normalizedName === "bg prime inc") {
    return "BG";
  }
  if (normalizedName.includes("ap silver") || normalizedName === "ap silver trans llc") {
    return "AP";
  }
  
  return "";
}

/**
 * Parses an internal load number string that may contain a suffix
 * @param formattedNumber - String like "123-BFP" or "123"
 * @returns The numeric portion as a number, or null if invalid
 */
export function parseInternalLoadNumber(formattedNumber: string | null | undefined): number | null {
  if (!formattedNumber) return null;
  
  const numericPart = formattedNumber.split("-")[0];
  const parsed = parseInt(numericPart, 10);
  
  if (isNaN(parsed) || parsed > 2147483647 || parsed < 0) return null;
  return parsed;
}
