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
