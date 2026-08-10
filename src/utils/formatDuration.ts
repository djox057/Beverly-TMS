/**
 * Format a duration in seconds for display (e.g. "12h 24m", "5m 30s", "0m").
 * Seconds are always preserved in the database and API; this is display only.
 */
export const formatDuration = (totalSeconds: number | null | undefined): string => {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
};

/** Compact variant for badges: "12h", "24m", "30s". */
export const formatDurationShort = (totalSeconds: number | null | undefined): string => {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
};