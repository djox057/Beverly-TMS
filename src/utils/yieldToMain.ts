/**
 * Yields control back to the main thread to keep UI responsive during heavy processing.
 * Uses requestIdleCallback when available, otherwise falls back to setTimeout.
 */
export const yieldToMain = (): Promise<void> => {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
};

/**
 * Checks if the browser is indicating pending user input.
 * Returns true if we should yield to handle user interactions.
 */
export const shouldYield = (): boolean => {
  if ('scheduling' in navigator && (navigator as any).scheduling?.isInputPending) {
    return (navigator as any).scheduling.isInputPending();
  }
  return false;
};

/**
 * Process an array in chunks, yielding to main thread periodically.
 * This keeps the UI responsive during heavy array processing.
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T, index: number) => R,
  chunkSize: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i++) {
    results.push(processor(items[i], i));
    
    // Yield every chunkSize items or when input is pending
    if ((i + 1) % chunkSize === 0 || shouldYield()) {
      await yieldToMain();
    }
  }
  
  return results;
}

/**
 * Build an index map from an array, yielding periodically to keep UI responsive.
 */
export async function buildIndexMapAsync<T>(
  items: T[],
  keyExtractor: (item: T) => string | null | undefined,
  chunkSize: number = 500
): Promise<Map<string, T[]>> {
  const map = new Map<string, T[]>();
  
  for (let i = 0; i < items.length; i++) {
    const key = keyExtractor(items[i]);
    if (key) {
      const existing = map.get(key);
      if (existing) {
        existing.push(items[i]);
      } else {
        map.set(key, [items[i]]);
      }
    }
    
    // Yield periodically
    if ((i + 1) % chunkSize === 0) {
      await yieldToMain();
    }
  }
  
  return map;
}
