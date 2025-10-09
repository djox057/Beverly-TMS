/**
 * Converts a Date to simple datetime string without any timezone handling.
 * Returns format: "YYYY-MM-DD HH:MM:SS"
 * 
 * @param date - The Date object to convert
 * @returns Simple datetime string
 */
export const toSimpleDateTimeString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Parses a datetime string and extracts date/time components.
 * Handles both "YYYY-MM-DD HH:MM:SS" and "YYYY-MM-DDTHH:MM:SS" formats.
 * NO timezone conversion - parses the string as-is.
 * 
 * @param datetimeString - Datetime string
 * @returns Object with date and time components
 */
export const parseSimpleDateTime = (datetimeString: string) => {
  // Handle both space and T separator
  const cleanStr = datetimeString.replace(/Z$|[+-]\d{2}:\d{2}$/, '').trim();
  
  // Parse the datetime parts directly from the string
  const [datePart, timePart] = cleanStr.includes('T') 
    ? cleanStr.split('T') 
    : cleanStr.split(' ');
    
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
 * Combines a Date and time string into a simple datetime string.
 * NO timezone conversion - returns "YYYY-MM-DD HH:MM:SS"
 * 
 * @param date - The Date object (only date part is used)
 * @param time - Time string in format "HH:MM"
 * @returns Simple datetime string "YYYY-MM-DD HH:MM:SS"
 */
export const combineDateAndTime = (date: Date, time: string): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const [hours, minutes] = time.split(':');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
};
