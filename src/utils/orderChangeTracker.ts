/**
 * Utility to track and format order changes for audit logging
 */

// Delimiter to separate user notes from system notes
export const SYSTEM_NOTES_DELIMITER = "\n\n---SYSTEM NOTES---\n";

export interface OrderSnapshot {
  freightAmount?: number | null;
  driverPrice?: number | null;
  detention?: number | null;
  detentionDriver?: number | null;
  layover?: number | null;
  layoverDriver?: number | null;
  extraStop?: number | null;
  lateFee?: number | null;
  lateFeeDriver?: number | null;
  tonu?: number | null;
  tonuDriver?: number | null;
  lumper?: number | null;
  otherCharges?: number | null;
  otherChargesDriver?: number | null;
  noTrackingFee?: number | null;
  noTrackingFeeDriver?: number | null;
  wrongAddressFee?: number | null;
  wrongAddressFeeDriver?: number | null;
  escortFee?: number | null;
  loadedMiles?: number | null;
  dhMiles?: number | null;
  brokerLoadNumber?: string | null;
  truckId?: string | null;
  driver1Id?: string | null;
  driver2Id?: string | null;
  trailerId?: string | null;
  brokerId?: string | null;
  bookedByCompanyId?: string | null;
  commodity?: string | null;
  weight?: number | null;
  referenceNumber?: string | null;
  poNumber?: string | null;
  puNumber?: string | null;
  // Pickup/Delivery addresses from stops
  pickupAddress?: string | null;
  pickupCity?: string | null;
  pickupState?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  pickupDatetime?: string | null;
  deliveryDatetime?: string | null;
}

interface LookupMaps {
  trucks?: Map<string, string>; // id -> truck_number
  drivers?: Map<string, string>; // id -> name
  trailers?: Map<string, string>; // id -> trailer_number
  brokers?: Map<string, string>; // id -> name
  companies?: Map<string, string>; // id -> name
}

export interface ParsedNotes {
  userNotes: string;
  systemNotes: string;
}

/**
 * Parse notes string into user notes and system notes sections
 */
export function parseNotes(notes: string | null | undefined): ParsedNotes {
  if (!notes) {
    return { userNotes: "", systemNotes: "" };
  }
  
  const delimiterIndex = notes.indexOf(SYSTEM_NOTES_DELIMITER);
  
  if (delimiterIndex === -1) {
    // No delimiter found - check if entire content looks like system notes
    if (hasUpdateTracking(notes)) {
      // All content appears to be system-generated
      return { userNotes: "", systemNotes: notes };
    }
    // All content is user notes
    return { userNotes: notes, systemNotes: "" };
  }
  
  const userNotes = notes.substring(0, delimiterIndex).trim();
  const systemNotes = notes.substring(delimiterIndex + SYSTEM_NOTES_DELIMITER.length).trim();
  
  return { userNotes, systemNotes };
}

/**
 * Combine user notes and system notes back into a single string
 */
export function combineNotes(userNotes: string, systemNotes: string): string {
  const trimmedUser = userNotes.trim();
  const trimmedSystem = systemNotes.trim();
  
  if (!trimmedUser && !trimmedSystem) {
    return "";
  }
  
  if (!trimmedSystem) {
    return trimmedUser;
  }
  
  if (!trimmedUser) {
    return SYSTEM_NOTES_DELIMITER.trim() + "\n" + trimmedSystem;
  }
  
  return trimmedUser + SYSTEM_NOTES_DELIMITER + trimmedSystem;
}

/**
 * Append a user note with timestamp to the user notes section
 */
export function appendUserNote(
  existingUserNotes: string,
  userNote: string,
  userName: string
): string {
  if (!userNote.trim()) return existingUserNotes;
  
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const formattedNote = `[${timestamp} by ${userName}]\n${userNote.trim()}`;
  
  if (existingUserNotes.trim()) {
    return existingUserNotes.trim() + "\n\n" + formattedNote;
  }
  
  return formattedNote;
}

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "$0";
  return `$${value.toLocaleString()}`;
};

const formatMiles = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "0";
  return value.toLocaleString();
};

const formatDate = (datetime: string | null | undefined): string => {
  if (!datetime) return "N/A";
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
  } catch {
    return datetime;
  }
};

const formatLocation = (address?: string | null, city?: string | null, state?: string | null): string => {
  const parts = [city, state].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  if (address) return address.substring(0, 30) + (address.length > 30 ? '...' : '');
  return 'N/A';
};

export function generateChangeMessages(
  original: OrderSnapshot,
  updated: OrderSnapshot,
  lookups: LookupMaps,
  userName: string
): string[] {
  const changes: string[] = [];
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Financial field changes
  if (original.freightAmount !== updated.freightAmount) {
    changes.push(`Rate changed from ${formatCurrency(original.freightAmount)} to ${formatCurrency(updated.freightAmount)}`);
  }
  if (original.driverPrice !== updated.driverPrice) {
    changes.push(`Driver rate changed from ${formatCurrency(original.driverPrice)} to ${formatCurrency(updated.driverPrice)}`);
  }
  if (original.detention !== updated.detention) {
    changes.push(`Detention changed from ${formatCurrency(original.detention)} to ${formatCurrency(updated.detention)}`);
  }
  if (original.layover !== updated.layover) {
    changes.push(`Layover changed from ${formatCurrency(original.layover)} to ${formatCurrency(updated.layover)}`);
  }
  if (original.extraStop !== updated.extraStop) {
    changes.push(`Extra stop fee changed from ${formatCurrency(original.extraStop)} to ${formatCurrency(updated.extraStop)}`);
  }
  if (original.lateFee !== updated.lateFee) {
    changes.push(`Late fee changed from ${formatCurrency(original.lateFee)} to ${formatCurrency(updated.lateFee)}`);
  }
  if (original.tonu !== updated.tonu) {
    changes.push(`TONU changed from ${formatCurrency(original.tonu)} to ${formatCurrency(updated.tonu)}`);
  }
  if (original.lumper !== updated.lumper) {
    changes.push(`Lumper changed from ${formatCurrency(original.lumper)} to ${formatCurrency(updated.lumper)}`);
  }
  if (original.escortFee !== updated.escortFee) {
    changes.push(`Escort fee changed from ${formatCurrency(original.escortFee)} to ${formatCurrency(updated.escortFee)}`);
  }
  if (original.otherCharges !== updated.otherCharges) {
    changes.push(`Other charges changed from ${formatCurrency(original.otherCharges)} to ${formatCurrency(updated.otherCharges)}`);
  }

  // Miles changes
  if (original.loadedMiles !== updated.loadedMiles) {
    changes.push(`Loaded miles changed from ${formatMiles(original.loadedMiles)} to ${formatMiles(updated.loadedMiles)}`);
  }
  if (original.dhMiles !== updated.dhMiles) {
    changes.push(`DH miles changed from ${formatMiles(original.dhMiles)} to ${formatMiles(updated.dhMiles)}`);
  }

  // Assignment changes
  if (original.truckId !== updated.truckId) {
    const oldTruck = lookups.trucks?.get(original.truckId || '') || 'None';
    const newTruck = lookups.trucks?.get(updated.truckId || '') || 'None';
    changes.push(`Truck changed from ${oldTruck} to ${newTruck}`);
  }
  if (original.driver1Id !== updated.driver1Id) {
    const oldDriver = lookups.drivers?.get(original.driver1Id || '') || 'None';
    const newDriver = lookups.drivers?.get(updated.driver1Id || '') || 'None';
    changes.push(`Driver changed from ${oldDriver} to ${newDriver}`);
  }
  if (original.driver2Id !== updated.driver2Id) {
    const oldDriver2 = lookups.drivers?.get(original.driver2Id || '') || 'None';
    const newDriver2 = lookups.drivers?.get(updated.driver2Id || '') || 'None';
    changes.push(`Driver 2 changed from ${oldDriver2} to ${newDriver2}`);
  }
  if (original.trailerId !== updated.trailerId) {
    const oldTrailer = lookups.trailers?.get(original.trailerId || '') || 'None';
    const newTrailer = lookups.trailers?.get(updated.trailerId || '') || 'None';
    changes.push(`Trailer changed from ${oldTrailer} to ${newTrailer}`);
  }
  if (original.brokerId !== updated.brokerId) {
    const oldBroker = lookups.brokers?.get(original.brokerId || '') || 'None';
    const newBroker = lookups.brokers?.get(updated.brokerId || '') || 'None';
    changes.push(`Broker changed from ${oldBroker} to ${newBroker}`);
  }

  // Location changes
  const oldPickupLocation = formatLocation(original.pickupAddress, original.pickupCity, original.pickupState);
  const newPickupLocation = formatLocation(updated.pickupAddress, updated.pickupCity, updated.pickupState);
  if (oldPickupLocation !== newPickupLocation && oldPickupLocation !== 'N/A') {
    changes.push(`Pickup location changed from ${oldPickupLocation} to ${newPickupLocation}`);
  }

  const oldDeliveryLocation = formatLocation(original.deliveryAddress, original.deliveryCity, original.deliveryState);
  const newDeliveryLocation = formatLocation(updated.deliveryAddress, updated.deliveryCity, updated.deliveryState);
  if (oldDeliveryLocation !== newDeliveryLocation && oldDeliveryLocation !== 'N/A') {
    changes.push(`Delivery location changed from ${oldDeliveryLocation} to ${newDeliveryLocation}`);
  }

  // Date changes (only if dates actually changed)
  if (original.pickupDatetime && updated.pickupDatetime) {
    const oldPickupDate = formatDate(original.pickupDatetime);
    const newPickupDate = formatDate(updated.pickupDatetime);
    if (oldPickupDate !== newPickupDate) {
      changes.push(`Pickup date changed from ${oldPickupDate} to ${newPickupDate}`);
    }
  }
  if (original.deliveryDatetime && updated.deliveryDatetime) {
    const oldDeliveryDate = formatDate(original.deliveryDatetime);
    const newDeliveryDate = formatDate(updated.deliveryDatetime);
    if (oldDeliveryDate !== newDeliveryDate) {
      changes.push(`Delivery date changed from ${oldDeliveryDate} to ${newDeliveryDate}`);
    }
  }

  // Broker load number change
  if (original.brokerLoadNumber !== updated.brokerLoadNumber) {
    changes.push(`Broker load # changed from "${original.brokerLoadNumber || 'N/A'}" to "${updated.brokerLoadNumber || 'N/A'}"`);
  }

  // Only return changes if there are any
  if (changes.length > 0) {
    return [`[${timestamp} by ${userName}]`, ...changes.map(c => `• ${c}`)];
  }
  return [];
}

/**
 * Append system-generated changes to the system notes section
 */
export function appendChangesToNotes(
  existingSystemNotes: string,
  changeMessages: string[]
): string {
  if (changeMessages.length === 0) return existingSystemNotes;
  
  const changeBlock = changeMessages.join('\n');
  
  if (existingSystemNotes.trim()) {
    return existingSystemNotes.trim() + '\n\n' + changeBlock;
  }
  return changeBlock;
}

/**
 * Check if notes contain any update tracking messages
 */
export function hasUpdateTracking(notes: string | null | undefined): boolean {
  if (!notes) return false;
  // Look for the pattern of our change tracking format
  return /\[\d{2}\/\d{2}\/\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M\s+by\s+.+\]/.test(notes);
}
