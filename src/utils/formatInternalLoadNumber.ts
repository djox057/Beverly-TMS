/**
 * Formats an internal load number with the appropriate company suffix
 * @param internalLoadNumber - The numeric internal load number
 * @param companyName - The company name to determine the suffix
 * @returns Formatted string like "123-BFP" or just the number if no matching company
 */
export function formatInternalLoadNumber(
  internalLoadNumber: number | string | null | undefined,
  companyName: string | null | undefined
): string {
  if (internalLoadNumber === null || internalLoadNumber === undefined) {
    return "—";
  }

  const numStr = internalLoadNumber.toString();
  
  if (!companyName) {
    return numStr;
  }

  const suffix = getCompanySuffix(companyName);
  return suffix ? `${numStr}-${suffix}` : numStr;
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
  
  // Extract just the numeric part (before any dash)
  const numericPart = formattedNumber.split("-")[0];
  const parsed = parseInt(numericPart, 10);
  
  // Guard against Postgres int4 overflow (max 2,147,483,647)
  if (isNaN(parsed) || parsed > 2147483647 || parsed < 0) return null;
  return parsed;
}
