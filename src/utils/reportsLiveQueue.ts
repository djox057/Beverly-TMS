/** NULL keys request full reconciliation; otherwise union identifiers across a burst. */
export type LiveChanges = Map<string, Set<string> | null>;
export function mergeLiveChange(pending: LiveChanges, source: string, keys: string[] | null) {
  if (pending.get(source) === null) return;
  if (keys === null) { pending.set(source, null); return; }
  const ids = pending.get(source) || new Set<string>();
  keys.forEach(id => ids.add(id));
  pending.set(source, ids.size > 500 ? null : ids);
}

/** Serial, bounded-delay refreshes. Failed work survives; events during reads run afterward. */
export function createReportsLiveQueue(
  refresh: (changes: LiveChanges) => Promise<void>,
  onError: (error: unknown) => void,
  onSuccess: () => void,
) {
  const pending: LiveChanges = new Map();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  const schedule = (delay = 500) => {
    if (stopped || running || timer || !pending.size) return;
    timer = setTimeout(flush, delay);
  };
  const flush = async () => {
    timer = undefined;
    if (stopped || running) return;
    running = true;
    const batch = new Map(pending);
    pending.clear();
    let failed = false;
    try {
      await refresh(batch);
      if (!stopped) onSuccess();
    } catch (error) {
      failed = true;
      for (const [source, ids] of batch) mergeLiveChange(pending, source, ids ? [...ids] : null);
      if (!stopped) onError(error);
    } finally {
      running = false;
      schedule(failed ? 5000 : 500);
    }
  };
  return {
    add(source: string, keys: string[] | null) { mergeLiveChange(pending, source, keys); schedule(); },
    isIdle() { return !running && !pending.size && !timer; },
    stop() { stopped = true; pending.clear(); if (timer) clearTimeout(timer); },
  };
}
