import { useEffect, useState } from "react";

/** Browser-local report preferences; invalid or unavailable storage keeps defaults. */
export function useOilChangeFilterState<T>(
  name: string,
  initial: T | (() => T),
  valid: (value: unknown) => boolean = value => typeof value === typeof (typeof initial === "function" ? (initial as () => T)() : initial),
) {
  const key = `live-oil-change:filters:v1:${name}`;
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const saved: unknown = JSON.parse(raw);
        if (valid(saved)) return saved as T;
      }
    } catch { /* Preferences must never prevent opening the report. */ }
    return fallback;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Storage may be disabled or full. */ }
  }, [key, value]);
  return [value, setValue] as const;
}
