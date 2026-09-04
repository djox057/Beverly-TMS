import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Shared realtime bus.
 *
 * Cost model: Supabase bills one realtime message per delivery per channel.
 * Two things used to multiply the bill:
 *   1. the `trucks` table was in the realtime publication while background jobs
 *      rewrite all ~490 rows every few minutes (added 2026-08-31 for the OOS
 *      checkbox, removed again) — millions of deliveries per day, and
 *   2. several channels listening to the SAME table per user.
 *
 * Now:
 *   - only the tables in PUBLISHED_TABLES actually broadcast; everything else
 *     falls back to a cheap refresh (window focus + 60s interval),
 *   - all published tables are multiplexed onto ONE channel with one binding
 *     per table, ref-counted across subscribers and fanned out in JS,
 *   - joins are debounced so briefly mounted pages never join,
 *   - subscriptions pause when the tab has been hidden for a while.
 */

/** Tables that are members of the `supabase_realtime` publication. */
export const PUBLISHED_TABLES = new Set([
  "orders",
  "pickup_drops",
  "order_transfers",
  "truck_notes",
]);

export type BusPayload = RealtimePostgresChangesPayload<{ [key: string]: any }> & {
  table?: string;
};

type Handler = (payload: BusPayload) => void;

interface Subscriber {
  handler: Handler;
  onResume?: () => void;
}

const tables = new Map<string, Set<Subscriber>>();
const fallbackSubs = new Set<Subscriber>();

let channel: ReturnType<typeof supabase.channel> | null = null;
let paused = false;
let joinTimer: ReturnType<typeof setTimeout> | null = null;
const JOIN_DEBOUNCE_MS = 500;

const dispatch = (table: string, payload: any) => {
  const subs = tables.get(table);
  if (!subs) return;
  const withTable = { ...payload, table } as BusPayload;
  for (const sub of [...subs]) {
    try {
      sub.handler(withTable);
    } catch (err) {
      console.error(`[realtimeBus] handler error for ${table}:`, err);
    }
  }
};

const teardownChannel = () => {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
};

const buildChannel = () => {
  teardownChannel();
  const active = [...tables.keys()].filter((t) => PUBLISHED_TABLES.has(t));
  if (paused || active.length === 0) return;

  let ch = supabase.channel("bus");
  for (const table of active) {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => dispatch(table, payload)
    );
  }
  channel = ch.subscribe();
};

const scheduleJoin = () => {
  if (joinTimer) clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    joinTimer = null;
    buildChannel();
  }, JOIN_DEBOUNCE_MS);
};

/**
 * Subscribe to changes on a table. Returns an unsubscribe function.
 *
 * Tables outside PUBLISHED_TABLES never open a socket binding — their
 * `onResume` callback is invoked on window focus and every 60s instead.
 */
export const subscribeTable = (
  table: string,
  handler: Handler,
  onResume?: () => void
): (() => void) => {
  const sub: Subscriber = { handler, onResume };

  if (!PUBLISHED_TABLES.has(table)) {
    fallbackSubs.add(sub);
    ensureFallbackTimer();
    return () => {
      fallbackSubs.delete(sub);
      ensureFallbackTimer();
    };
  }

  let subs = tables.get(table);
  const isNewTable = !subs;
  if (!subs) {
    subs = new Set();
    tables.set(table, subs);
  }
  subs.add(sub);
  if (isNewTable) scheduleJoin();

  return () => {
    const current = tables.get(table);
    if (!current) return;
    current.delete(sub);
    if (current.size === 0) {
      tables.delete(table);
      scheduleJoin();
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

// ─── Fallback refresh for tables that no longer broadcast ───
const FALLBACK_INTERVAL_MS = 60 * 1000;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

const runFallback = () => {
  if (typeof document !== "undefined" && document.hidden) return;
  for (const sub of [...fallbackSubs]) {
    if (!sub.onResume) continue;
    try {
      sub.onResume();
    } catch (err) {
      console.error("[realtimeBus] fallback refresh error:", err);
    }
  }
};

const ensureFallbackTimer = () => {
  if (fallbackSubs.size > 0 && !fallbackTimer) {
    fallbackTimer = setInterval(runFallback, FALLBACK_INTERVAL_MS);
  } else if (fallbackSubs.size === 0 && fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("focus", runFallback);
}

// ─── Pause while the tab is hidden ───
const HIDDEN_GRACE_MS = 2 * 60 * 1000;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

const pauseAll = () => {
  if (paused) return;
  paused = true;
  teardownChannel();
};

const resumeAll = () => {
  if (!paused) return;
  paused = false;
  buildChannel();
  const resumeCallbacks: Array<() => void> = [];
  for (const subs of tables.values()) {
    for (const sub of subs) if (sub.onResume) resumeCallbacks.push(sub.onResume);
  }
  for (const cb of new Set(resumeCallbacks)) {
    try {
      cb();
    } catch (err) {
      console.error("[realtimeBus] resume error:", err);
    }
  }
  runFallback();
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
 * usage. Routes every binding through the shared multiplexed channel above.
 *
 * `refresh` is used for bindings on tables that no longer broadcast: it is
 * called on window focus and every 60s instead of receiving live rows.
 *
 * Cleanup: call `.unsubscribe()`.
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

export const busChannel = (refresh?: () => void): BusChannel => {
  const unsubs: Array<() => void> = [];
  const api: BusChannel = {
    on: (_event, cfg, handler) => {
      unsubs.push(
        subscribeTable(
          cfg.table,
          (payload) => {
            if (cfg.event && cfg.event !== "*" && payload.eventType !== cfg.event) return;
            if (!matchesFilter(payload, cfg.filter)) return;
            handler(payload);
          },
          refresh
        )
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
