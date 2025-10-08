/**
 * Converts a Date to ISO string format without timezone conversion.
 * Treats the date as timezone-agnostic (uses local date/time components).
 * 
 * @param date - The Date object to convert
 * @returns ISO 8601 formatted string (e.g., "2024-01-15T14:30:00")
 */
export const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

/**
 * Parses an ISO datetime string and extracts date/time components without timezone conversion.
 * 
 * @param isoString - ISO 8601 formatted datetime string
 * @returns Object with date and time components
 */
export const parseLocalDateTime = (isoString: string) => {
  // Remove timezone suffix if present (Z or +/-HH:MM)
  const cleanStr = isoString.replace(/Z$|[+-]\d{2}:\d{2}$/, '');
  
  // Parse the datetime parts directly from the string
  const [datePart, timePart] = cleanStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart ? timePart.split(':').map(Number) : [0, 0];
  
  return {
    year,
    month,
    day,
    hours,
    minutes,
    dateString: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
    timeString: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  };
};

/**
 * Combines a Date and time string into an ISO string without timezone conversion.
 * 
 * @param date - The Date object (only date part is used)
 * @param time - Time string in format "HH:MM"
 * @returns ISO formatted datetime string
 */
export const combineDateAndTime = (date: Date, time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return toLocalISOString(combined);
};
