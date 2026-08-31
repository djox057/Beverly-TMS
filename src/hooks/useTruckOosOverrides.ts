import { useEffect, useState } from "react";

/**
 * Lightweight global store for optimistic OOS (out of service) truck flags.
 * Lets OOS toggles + realtime events reflect immediately in any view that
 * renders truck data from a cached query, without waiting for a refetch.
 */
const overrides = new Map<string, boolean>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export const setTruckOosOverride = (truckId: string, oos: boolean) => {
  overrides.set(truckId, oos);
  notify();
};

export const clearTruckOosOverride = (truckId: string) => {
  if (overrides.delete(truckId)) notify();
};

export const getTruckOosOverride = (truckId?: string | null): boolean | undefined =>
  truckId ? overrides.get(truckId) : undefined;

/** Subscribe to override changes; returns a resolver for a truck's OOS value. */
export const useTruckOosOverrides = () => {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (truckId: string | null | undefined, fallback: boolean) => {
    const override = getTruckOosOverride(truckId);
    return override === undefined ? fallback : override;
  };
};
