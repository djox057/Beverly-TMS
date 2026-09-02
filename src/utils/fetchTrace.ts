/**
 * Development-only fetch/mount tracer used to find the source of repeated
 * order fetches (observed ~every 20s, unexplained by the 18 order updates and
 * 21 pickup-drop updates seen in the same hour).
 *
 * Enable in a signed-in session:
 *   localStorage.setItem('debugFetchTrace', '1'); location.reload();
 * Disable:
 *   localStorage.removeItem('debugFetchTrace');
 * Dump a summary at any time:
 *   window.__fetchTraceDump()
 *
 * Never log tokens, PII, or record contents — only hook name, trigger,
 * query key, route, counts and ID counts.
 */

export interface TraceEvent {
  ts: string;
  hook: string;
  trigger: string;
  queryKey?: string;
  route?: string;
  idCount?: number;
}

const events: TraceEvent[] = [];
const MAX_EVENTS = 500;

export const isFetchTraceEnabled = (): boolean => {
  try {
    return typeof window !== "undefined" && localStorage.getItem("debugFetchTrace") === "1";
  } catch {
    return false;
  }
};

export const traceFetch = (
  hook: string,
  trigger: string,
  meta?: { queryKey?: unknown; idCount?: number }
) => {
  if (!isFetchTraceEnabled()) return;

  const event: TraceEvent = {
    ts: new Date().toISOString(),
    hook,
    trigger,
    queryKey: meta?.queryKey ? JSON.stringify(meta.queryKey) : undefined,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    idCount: meta?.idCount,
  };

  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();

  console.log(
    `[trace] ${event.hook} ← ${event.trigger}` +
      (event.queryKey ? ` key=${event.queryKey}` : "") +
      (event.idCount !== undefined ? ` ids=${event.idCount}` : "") +
      ` route=${event.route}`
  );
};

if (typeof window !== "undefined") {
  (window as any).__fetchTraceDump = () => {
    const byHookTrigger = new Map<string, number>();
    for (const e of events) {
      const k = `${e.hook} ← ${e.trigger} @ ${e.route}`;
      byHookTrigger.set(k, (byHookTrigger.get(k) || 0) + 1);
    }
    const summary = [...byHookTrigger.entries()].sort((a, b) => b[1] - a[1]);
    console.table(summary.map(([k, count]) => ({ source: k, count })));
    return { events: [...events], summary };
  };
}
