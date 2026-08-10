// Metrics calculation: normalized calls + messages -> daily aggregates.

import type { NormalizedCall } from "./dedupe.ts";
import { localDate, toE164 } from "./normalize.ts";

export interface RawMessageRecord {
  id?: string | number;
  conversationId?: string | number;
  type?: string;
  direction?: string;
  messageStatus?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  from?: { phoneNumber?: string };
  to?: Array<{ phoneNumber?: string }>;
}

export interface NormalizedMessage {
  messageId: string;
  conversationId: string | null;
  extensionId: string;
  messageType: string | null;
  direction: "Inbound" | "Outbound" | null;
  messageStatus: string | null;
  fromNumber: string | null;
  toNumbers: string[];
  creationTime: string | null;
}

const FAILED_STATUSES = new Set(["SendingFailed", "DeliveryFailed", "Failed"]);

export function normalizeMessage(raw: RawMessageRecord, extensionId: string): NormalizedMessage {
  return {
    messageId: String(raw.id ?? ""),
    conversationId: raw.conversationId != null ? String(raw.conversationId) : null,
    extensionId,
    messageType: raw.type ?? null,
    direction: raw.direction === "Inbound" || raw.direction === "Outbound" ? raw.direction : null,
    messageStatus: raw.messageStatus ?? null,
    fromNumber: toE164(raw.from?.phoneNumber),
    toNumbers: (raw.to ?? []).map((t) => toE164(t?.phoneNumber)).filter((v): v is string => !!v),
    creationTime: raw.creationTime ?? null,
  };
}

/** Drop duplicate provider records (replayed pages / overlapping windows). */
export function dedupeMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  const seen = new Set<string>();
  const out: NormalizedMessage[] = [];
  for (const m of messages) {
    if (!m.messageId || seen.has(m.messageId)) continue;
    seen.add(m.messageId);
    out.push(m);
  }
  return out;
}

export interface DailyMetrics {
  rc_extension_id: string;
  ringcentral_phone_number: string;
  metric_date: string;
  timezone: string;
  inbound_calls: number;
  outbound_calls: number;
  answered_calls: number;
  missed_calls: number;
  total_call_seconds: number;
  live_talk_seconds: number;
  average_answered_call_seconds: number;
  inbound_sms: number;
  outbound_sms: number;
  failed_sms: number;
}

function emptyMetrics(
  extensionId: string,
  phoneNumber: string,
  date: string,
  timezone: string,
): DailyMetrics {
  return {
    rc_extension_id: extensionId,
    ringcentral_phone_number: phoneNumber,
    metric_date: date,
    timezone,
    inbound_calls: 0,
    outbound_calls: 0,
    answered_calls: 0,
    missed_calls: 0,
    total_call_seconds: 0,
    live_talk_seconds: 0,
    average_answered_call_seconds: 0,
    inbound_sms: 0,
    outbound_sms: 0,
    failed_sms: 0,
  };
}

/**
 * Build daily aggregates keyed by extension + phone number + local date.
 * Calls must already be deduped by sessionId.
 */
export function buildDailyMetrics(
  calls: NormalizedCall[],
  messages: NormalizedMessage[],
  phoneByExtension: Map<string, string>,
  timezone: string,
): DailyMetrics[] {
  const map = new Map<string, DailyMetrics>();
  const answeredTotals = new Map<string, { seconds: number; count: number }>();

  const keyFor = (extId: string, date: string) => {
    const phone = phoneByExtension.get(extId) ?? "";
    const key = `${extId}|${phone}|${date}`;
    if (!map.has(key)) map.set(key, emptyMetrics(extId, phone, date, timezone));
    return key;
  };

  for (const call of calls) {
    const extId = call.extensionId;
    const date = localDate(call.startedAt, timezone);
    if (!extId || !date) continue;
    const key = keyFor(extId, date);
    const m = map.get(key)!;

    if (call.direction === "Inbound") m.inbound_calls += 1;
    else if (call.direction === "Outbound") m.outbound_calls += 1;

    if (call.answered) {
      m.answered_calls += 1;
      const t = answeredTotals.get(key) ?? { seconds: 0, count: 0 };
      t.seconds += call.liveTalkSeconds;
      t.count += 1;
      answeredTotals.set(key, t);
    } else {
      m.missed_calls += 1;
    }

    m.total_call_seconds += call.durationSeconds;
    m.live_talk_seconds += call.liveTalkSeconds;
  }

  for (const msg of messages) {
    const date = localDate(msg.creationTime, timezone);
    if (!msg.extensionId || !date) continue;
    const key = keyFor(msg.extensionId, date);
    const m = map.get(key)!;

    if (msg.direction === "Inbound") m.inbound_sms += 1;
    else if (msg.direction === "Outbound") m.outbound_sms += 1;

    if (msg.messageStatus && FAILED_STATUSES.has(msg.messageStatus)) m.failed_sms += 1;
  }

  for (const [key, m] of map) {
    const t = answeredTotals.get(key);
    m.average_answered_call_seconds = t && t.count > 0 ? Math.round(t.seconds / t.count) : 0;
  }

  return [...map.values()];
}