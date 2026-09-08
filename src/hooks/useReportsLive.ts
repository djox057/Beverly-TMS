import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createReportsLiveQueue, type LiveChanges } from "@/utils/reportsLiveQueue";

export type ReportsLiveStatus = "connecting" | "live" | "catching-up" | "offline" | "error" | "paused";
export const REPORTS_LIVE_SOURCES = [
  "orders", "pickup_drops", "order_transfers", "drivers", "driver_hos", "trucks", "trailers",
  "truck_telemetry", "order_files", "truck_notes", "lost_day_notes", "profiles", "user_roles",
  "companies", "brokers", "dispatcher_status", "driver_problems", "driver_complaints",
  "driver_drug_tests", "efs_other_requests", "company_coi_vins", "afterhours_schedule",
  "afterhours_assignments", "daily_report_permissions", "final_update_sends",
  "user_extensions", "temporary_plates",
];

/** One page-owned subscription. The heartbeat reads only source/version pairs. */
export function useReportsLive(enabled: boolean,
  refresh: (changes: LiveChanges, isCurrent: () => boolean) => Promise<void>,
) {
  const { user } = useAuthContext();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const [status, setStatus] = useState<ReportsLiveStatus>("connecting");
  useEffect(() => {
    if (!enabled || !user?.id) return;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let connected = false;
    let initialized = false;
    let checking = false;
    let generation = 0;
    const versions = new Map<string, number>();
    const current = () => !disposed && !document.hidden;
    const queue = createReportsLiveQueue(
      async changes => {
        if (!current()) throw new Error("Reports paused");
        const before = generation;
        setStatus("catching-up");
        await refreshRef.current(changes, () => current() && before === generation);
        if (!current() || before !== generation) throw new Error("Reports refresh interrupted");
      },
      error => { if (current()) { console.error("[ReportsLive] refresh failed", error); setStatus("error"); } },
      () => setStatus(connected ? "live" : navigator.onLine ? "connecting" : "offline"),
    );
    const checkVersions = async () => {
      if (!current() || checking) return;
      checking = true;
      const before = generation;
      try {
        const { data, error } = await supabase.from("reports_live_versions" as any).select("source, revision");
        if (!current() || before !== generation) return;
        if (error) throw error;
        if (!data || data.length < REPORTS_LIVE_SOURCES.length) throw new Error("Reports live migration or access is incomplete");
        for (const row of data as any[]) {
          const version = Number(row.revision);
          if (!initialized || version > (versions.get(row.source) ?? -1)) {
            // A snapshot cannot replay intermediate identifiers: reconcile this source.
            queue.add(row.source, null);
          }
          versions.set(row.source, Math.max(version, versions.get(row.source) ?? -1));
        }
        initialized = true;
        if (connected && queue.isIdle()) setStatus("live");
      } catch (error) {
        if (current()) { console.error("[ReportsLive] version check failed", error); setStatus(navigator.onLine ? "error" : "offline"); }
      } finally { checking = false; }
    };
    const close = () => {
      generation++;
      connected = false;
      if (channel) { void supabase.removeChannel(channel); channel = undefined; }
    };
    const connect = () => {
      if (!current() || channel) return;
      setStatus("connecting");
      const ch = supabase.channel(`reports-live:${user.id}`);
      channel = ch;
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports_live_versions" }, event => {
        if (!current() || channel !== ch) return;
        const row = event.new as { source: string; revision: number; keys: string[] | null };
        if (!REPORTS_LIVE_SOURCES.includes(row.source)) return;
        const version = Number(row.revision);
        const previous = versions.get(row.source);
        if (previous !== undefined && version <= previous) return;
        versions.set(row.source, version);
        // Also catches a dropped message while the socket still appears healthy.
        queue.add(row.source, previous === undefined || version !== previous + 1 ? null : row.keys);
      }).subscribe(state => {
        if (disposed || channel !== ch) return;
        connected = state === "SUBSCRIBED";
        if (connected) {
          // Reconcile only versions that changed while disconnected; initial mount reconciles all.
          void checkVersions();
        } else {
          setStatus(navigator.onLine ? "connecting" : "offline");
        }
      });
      // Detect a missing migration even if the server doesn't establish the binding.
      void checkVersions();
    };
    const visibility = () => {
      if (document.hidden) { close(); setStatus("paused"); }
      else connect();
    };
    const online = () => { close(); connect(); };
    const offline = () => { close(); setStatus("offline"); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = setInterval(() => { if (current()) { connect(); void checkVersions(); } }, 60000);
    connect();
    return () => {
      disposed = true;
      queue.stop(); close(); clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [enabled, user?.id]);
  return status;
}
