import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a date string without timezone conversion.
 * Extracts the date part directly from ISO string and formats as MM/DD/YYYY.
 * This prevents dates like 2025-12-01T02:00:00Z from displaying as 11/30/2025 in different timezones.
 */
export function formatDateNoTimezone(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  
  // Normalize space-separated dates (from CSV) to ISO format
  let normalized = dateStr;
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    normalized = dateStr.replace(' ', 'T');
  }
  
  // Extract the date part (YYYY-MM-DD) directly from the string
  const datePart = normalized.split('T')[0];
  
  if (!datePart || !datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return "";
  }
  
  const [year, month, day] = datePart.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * Format a phone number to (XXX) XXX-XXXX format.
 * Strips all non-digit characters and formats if exactly 10 digits.
 */
export function formatPhoneNumber(value: string): string {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // If more than 10 digits, truncate
  const truncated = digits.slice(0, 10);
  
  // Format based on length
  if (truncated.length === 0) return '';
  if (truncated.length <= 3) return `(${truncated}`;
  if (truncated.length <= 6) return `(${truncated.slice(0, 3)}) ${truncated.slice(3)}`;
  return `(${truncated.slice(0, 3)}) ${truncated.slice(3, 6)}-${truncated.slice(6)}`;
}

/**
 * Format a ZIP code to add a dash after the 5th digit if more than 5 digits.
 * Examples: "12345" → "12345", "123456" → "12345-6", "123456789" → "12345-6789"
 */
/**
 * Returns a jittered polling interval to prevent thundering herd effects.
 * Adds 0 to maxJitterMs random milliseconds to the base interval.
 * Use with useMemo(() => jitteredInterval(baseMs), []) to keep stable across re-renders.
 */
export function jitteredInterval(baseMs: number, maxJitterMs = 15000): number {
  return baseMs + Math.floor(Math.random() * maxJitterMs);
}

export function formatZipCode(value: string): string {
  // Remove all non-alphanumeric characters (including existing dashes)
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '');
  
  // If 5 or fewer characters, return as-is
  if (cleaned.length <= 5) {
    return cleaned;
  }
  
  // Add dash after 5th character
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
}
