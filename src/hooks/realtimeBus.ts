import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Shared realtime bus.
 *
 * Why: Supabase bills one realtime message per delivery per channel. The app
 * used to open several channels listening to the SAME table (trucks: list +
 * OOS + sales; orders: global reports watcher + orders hook + reports date
 * window), so a single row change was billed 3x per signed-in user.
 *
 * Here every table gets at most ONE shared channel with ONE `*` binding,
 * ref-counted across subscribers, and the payload is fanned out in JS.
 *
 * It also pauses subscriptions when the browser tab has been hidden for a
 * while (many users leave the app open in a background tab all day) and calls
 * each subscriber's `onResume` on return so caches refresh.
 */

export type BusPayload = RealtimePostgresChangesPayload<{ [key: string]: any }> & {
  table?: string;
};

type Handler = (payload: BusPayload) => void;

interface Subscriber {
  handler: Handler;
  onResume?: () => void;
}

interface TableEntry {
  subscribers: Set<Subscriber>;
  channel: ReturnType<typeof supabase.channel> | null;
}

const tables = new Map<string, TableEntry>();
let paused = false;

const openChannel = (table: string, entry: TableEntry) => {
  if (entry.channel) return;
  entry.channel = supabase
    .channel(`bus:${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const withTable = { ...payload, table } as BusPayload;
        for (const sub of [...entry.subscribers]) {
          try {
            sub.handler(withTable);
          } catch (err) {
            console.error(`[realtimeBus] handler error for ${table}:`, err);
          }
        }
      }
    )
    .subscribe();
};

const closeChannel = (entry: TableEntry) => {
  if (!entry.channel) return;
  supabase.removeChannel(entry.channel);
  entry.channel = null;
};

/**
 * Subscribe to changes on a published table. Returns an unsubscribe function.
 */
export const subscribeTable = (
  table: string,
  handler: Handler,
  onResume?: () => void
): (() => void) => {
  let entry = tables.get(table);
  if (!entry) {
    entry = { subscribers: new Set(), channel: null };
    tables.set(table, entry);
  }
  const sub: Subscriber = { handler, onResume };
  entry.subscribers.add(sub);
  if (!paused) openChannel(table, entry);

  return () => {
    const current = tables.get(table);
    if (!current) return;
    current.subscribers.delete(sub);
    if (current.subscribers.size === 0) {
      closeChannel(current);
      tables.delete(table);
    }
  };
};

/** Subscribe to several tables at once. */
export const subscribeTables = (
  tableNames: string[],
  handler: Handler,
  onResume?: () => void
): (() => void) => {
  const unsubs = tableNames.map((t) => subscribeTable(t, handler, onResume));
  return () => unsubs.forEach((u) => u());
};

// ─── Pause while the tab is hidden ───
const HIDDEN_GRACE_MS = 2 * 60 * 1000;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

const pauseAll = () => {
  if (paused) return;
  paused = true;
  for (const entry of tables.values()) closeChannel(entry);
};

const resumeAll = () => {
  if (!paused) return;
  paused = false;
  const resumeCallbacks: Array<() => void> = [];
  for (const [table, entry] of tables) {
    openChannel(table, entry);
    for (const sub of entry.subscribers) {
      if (sub.onResume) resumeCallbacks.push(sub.onResume);
    }
  }
  for (const cb of new Set(resumeCallbacks)) {
    try {
      cb();
    } catch (err) {
      console.error("[realtimeBus] resume error:", err);
    }
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(pauseAll, HIDDEN_GRACE_MS);
    } else {
      if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
      resumeAll();
    }
  });
}

/**
 * Drop-in replacement for `supabase.channel(...)` for postgres_changes-only
 * usage. Keeps the fluent `.on(...).subscribe()` shape used across the app but
 * routes every binding through the shared per-table channels above, so N
 * subscribers to the same table cost one delivery instead of N.
 *
 * Cleanup: call `.unsubscribe()` (or pass it to `removeBusChannel`).
 */
export interface BusChannel {
  on: (
    event: "postgres_changes",
    cfg: { event?: string; schema?: string; table: string; filter?: string },
    handler: Handler
  ) => BusChannel;
  subscribe: (cb?: (status: string) => void) => BusChannel;
  unsubscribe: () => void;
}

const matchesFilter = (payload: BusPayload, filter?: string): boolean => {
  if (!filter) return true;
  // Supported form: `column=eq.value` (the only one used in this app).
  const m = /^([\w.]+)=eq\.(.*)$/.exec(filter);
  if (!m) return true;
  const [, column, value] = m;
  const rec = (payload.new as any) ?? {};
  const oldRec = (payload.old as any) ?? {};
  const a = rec[column];
  const b = oldRec[column];
  if (a === undefined && b === undefined) return true; // can't tell — fail open
  return String(a ?? "") === value || String(b ?? "") === value;
};

export const busChannel = (): BusChannel => {
  const unsubs: Array<() => void> = [];
  const api: BusChannel = {
    on: (_event, cfg, handler) => {
      unsubs.push(
        subscribeTable(cfg.table, (payload) => {
          if (cfg.event && cfg.event !== "*" && payload.eventType !== cfg.event) return;
          if (!matchesFilter(payload, cfg.filter)) return;
          handler(payload);
        })
      );
      return api;
    },
    subscribe: (cb) => {
      cb?.("SUBSCRIBED");
      return api;
    },
    unsubscribe: () => {
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
  return api;
};
