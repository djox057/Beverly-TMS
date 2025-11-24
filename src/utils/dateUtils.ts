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
 * Formats a Date object to a string in the specified format WITHOUT timezone conversion.
 * This uses the Date's local year/month/day values directly.
 * 
 * @param date - The Date object to format
 * @param formatStr - Format string (e.g., "yyyy-MM-dd", "MM/dd/yyyy")
 * @returns Formatted date string
 */
export const formatDateLocal = (date: Date, formatStr: string): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Handle different format strings
  if (formatStr === "yyyy-MM-dd") {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (formatStr === "MM/dd/yyyy") {
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  }
  
  // Add more format strings as needed
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Combines a Date and time string into a simple datetime string.
 * NO timezone conversion - returns "YYYY-MM-DD HH:MM:SS"
 * 
 * @param date - The Date object (only date part is used)
 * @param time - Time string in format "HH:MM"
 * @returns Simple datetime string "YYYY-MM-DD HH:MM:SS" or null if inputs are invalid
 */
export const combineDateAndTime = (date: Date, time: string): string | null => {
  // Validate inputs
  if (!date || !time || typeof time !== 'string' || time.trim() === '') {
    return null;
  }
  
  // Validate time format (should be HH:MM)
  const timeParts = time.split(':');
  if (timeParts.length !== 2) {
    return null;
  }
  
  const [hours, minutes] = timeParts;
  
  // Validate hours and minutes are valid numbers
  const hoursNum = parseInt(hours, 10);
  const minutesNum = parseInt(minutes, 10);
  
  if (isNaN(hoursNum) || isNaN(minutesNum) || hoursNum < 0 || hoursNum > 23 || minutesNum < 0 || minutesNum > 59) {
    return null;
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
};
