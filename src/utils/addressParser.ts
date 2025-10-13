/**
 * Address parsing utility with validation and geocoding-friendly cleaning
 * Prevents incorrect parsing of building/plant/gate identifiers as city names
 * Removes instructions and details that prevent geocoding services from working
 */

export interface ParsedAddress {
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/**
 * Patterns to remove from addresses (they prevent geocoding)
 * These are instructions/details, not actual address components
 */
const NOISE_PATTERNS = [
  // Dock/door instructions
  /\s*-\s*around\s+back\s+dock\s+doors?\s+[\d\s,&]+/gi,
  /\s*-\s*rear\s+dock\s+doors?\s+[\d\s,&]+/gi,
  /\s*-\s*dock\s+doors?\s+[\d\s,&]+/gi,
  /\s*-\s*doors?\s+[\d\s,&]+/gi,
  /\s*-\s*loading\s+dock\s+[\d\s,&]+/gi,
  /\s*-\s*receiving\s+dock\s+[\d\s,&]+/gi,
  /\s*around\s+back\s+dock\s+doors?\s+[\d\s,&]+/gi,
  /\s*rear\s+dock\s+doors?\s+[\d\s,&]+/gi,
  /\s*dock\s+doors?\s+[\d\s,&]+/gi,
  
  // Generic instructions after dash
  /\s*-\s*see\s+notes/gi,
  /\s*-\s*call\s+ahead/gi,
  /\s*-\s*appointment\s+required/gi,
  
  // Multiple consecutive spaces
  /\s{2,}/g,
];

/**
 * Keywords that indicate building/facility identifiers (NOT city names)
 */
const FACILITY_KEYWORDS = [
  'plant', 'building', 'gate', 'dock', 'suite', 'unit', 'bay',
  'warehouse', 'door', 'doors', 'ste', 'bldg', 'floor', 'fl',
  'around back', 'rear', 'side', 'loading', 'receiving'
];

/**
 * US state abbreviations for validation
 */
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR'
]);

/**
 * Cleans an address string by removing geocoding-incompatible instructions
 */
function cleanAddressForGeocoding(address: string): string {
  let cleaned = address;
  
  // Remove all noise patterns
  NOISE_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, ' ');
  });
  
  // Clean up extra spaces and commas
  cleaned = cleaned
    .replace(/\s*,\s*,\s*/g, ', ') // Multiple commas
    .replace(/,\s*$/g, '') // Trailing comma
    .replace(/\s{2,}/g, ' ') // Multiple spaces
    .trim();
  
  return cleaned;
}

/**
 * Checks if a string is likely a facility identifier, not a city
 */
function isFacilityIdentifier(text: string): boolean {
  const lowerText = text.toLowerCase();
  return FACILITY_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Validates if a string is a valid US state code
 */
function isValidState(state: string): boolean {
  return US_STATES.has(state.toUpperCase());
}

/**
 * Parses an address string into components with validation
 * Returns null values for city/state/zip if parsing fails or is ambiguous
 * Cleans address to be geocoding-friendly
 */
export function parseAddress(addressString: string): ParsedAddress {
  if (!addressString || typeof addressString !== 'string') {
    return { address: '', city: null, state: null, zipCode: null };
  }

  // First, clean the address to remove geocoding-incompatible details
  const cleanedInput = cleanAddressForGeocoding(addressString);
  let cleanAddress = cleanedInput.trim();
  let city: string | null = null;
  let state: string | null = null;
  let zipCode: string | null = null;

  // Strategy 1: Check for newline format "Street\nCity, State Zip"
  if (cleanAddress.includes('\n')) {
    const lines = cleanAddress.split('\n').filter(line => line.trim());
    
    if (lines.length >= 2) {
      cleanAddress = lines[0].trim();
      const cityStateZip = lines[1].trim();
      
      // Match: "City, ST 12345" or "City, ST 12345-6789"
      const match = cityStateZip.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (match) {
        const potentialCity = match[1].trim();
        const potentialState = match[2].trim();
        
        // Only accept if state is valid and city is not a facility identifier
        if (isValidState(potentialState) && !isFacilityIdentifier(potentialCity)) {
          city = potentialCity;
          state = potentialState;
          zipCode = match[3].trim();
        }
      }
    }
  } 
  // Strategy 2: Check for comma-separated format
  else if (cleanAddress.includes(',')) {
    const parts = cleanAddress.split(',').map(p => p.trim());
    
    if (parts.length >= 3) {
      // Format: "Street, City, State Zip" or "Street, City, State"
      const potentialAddress = parts[0];
      const potentialCity = parts[1];
      const stateZipPart = parts[2];
      
      // Match state and zip from last part
      const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
      
      if (stateZipMatch && isValidState(stateZipMatch[1])) {
        // Validate that the "city" field is actually a city, not a facility identifier
        if (!isFacilityIdentifier(potentialCity)) {
          cleanAddress = potentialAddress;
          city = potentialCity;
          state = stateZipMatch[1];
          zipCode = stateZipMatch[2] || null;
        }
      }
    } 
    else if (parts.length === 2) {
      // Format: "Street, City State Zip"
      cleanAddress = parts[0];
      const cityStatePart = parts[1];
      
      // Match: "City ST 12345" or "City ST"
      const cityStateMatch = cityStatePart.match(/^(.+?)\s+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
      
      if (cityStateMatch && isValidState(cityStateMatch[2])) {
        const potentialCity = cityStateMatch[1].trim();
        
        if (!isFacilityIdentifier(potentialCity)) {
          city = potentialCity;
          state = cityStateMatch[2];
          zipCode = cityStateMatch[3] || null;
        }
      }
    }
  }
  // Strategy 3: No commas - try to find city/state/zip at the end
  else {
    // Match pattern at end of string: "City ST 12345"
    const endMatch = cleanAddress.match(/^(.+?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    
    if (endMatch && isValidState(endMatch[3])) {
      const potentialCity = endMatch[2].trim();
      
      if (!isFacilityIdentifier(potentialCity)) {
        cleanAddress = endMatch[1].trim();
        city = potentialCity;
        state = endMatch[3];
        zipCode = endMatch[4];
      }
    }
  }

  return {
    address: cleanAddress,
    city,
    state,
    zipCode
  };
}

/**
 * Validates that a parsed address has required geocoding information
 */
export function isValidForGeocoding(parsed: ParsedAddress): boolean {
  // At minimum, we need either:
  // 1. A full address with city and state, OR
  // 2. Just city and state (for city-level geocoding)
  return !!(
    (parsed.city && parsed.state) || 
    (parsed.address && parsed.city && parsed.state)
  );
}

/**
 * Formats an address for display
 */
export function formatAddress(parsed: ParsedAddress): string {
  const parts = [parsed.address];
  
  if (parsed.city) parts.push(parsed.city);
  if (parsed.state) parts.push(parsed.state);
  if (parsed.zipCode) parts.push(parsed.zipCode);
  
  return parts.filter(Boolean).join(', ');
}
