// Call-leg deduplication. Transfers, forwards and ring groups produce several
// call-log records that share one sessionId; they must count as ONE call.

import { isAnswered, normalizeDirection, toE164 } from "./normalize.ts";

export interface RawCallRecord {
  id?: string;
  sessionId?: string;
  direction?: string;
  result?: string;
  action?: string;
  duration?: number;
  startTime?: string;
  from?: { phoneNumber?: string; extensionNumber?: string };
  to?: { phoneNumber?: string; extensionNumber?: string };
  extension?: { id?: string | number };
  legs?: RawCallRecord[];
}

export interface NormalizedCall {
  recordId: string;
  sessionId: string | null;
  extensionId: string | null;
  direction: "Inbound" | "Outbound" | null;
  result: string | null;
  action: string | null;
  answered: boolean;
  durationSeconds: number;
  liveTalkSeconds: number;
  ringSeconds: number;
  holdSeconds: number;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;
}

export function normalizeCall(raw: RawCallRecord): NormalizedCall {
  const duration = Number(raw.duration) || 0;
  const answered = isAnswered(raw.result);
  // Total duration includes ringing for unanswered calls; live talk time only
  // exists for connected calls. Duration is NOT assumed to be talk time.
  const liveTalk = answered ? duration : 0;
  const ring = answered ? 0 : duration;

  return {
    recordId: String(raw.id ?? ""),
    sessionId: raw.sessionId ? String(raw.sessionId) : null,
    extensionId: raw.extension?.id != null ? String(raw.extension.id) : null,
    direction: normalizeDirection(raw.direction),
    result: raw.result ?? null,
    action: raw.action ?? null,
    answered,
    durationSeconds: duration,
    liveTalkSeconds: liveTalk,
    ringSeconds: ring,
    holdSeconds: 0,
    fromNumber: toE164(raw.from?.phoneNumber),
    toNumber: toE164(raw.to?.phoneNumber),
    startedAt: raw.startTime ?? null,
  };
}

/**
 * Collapse call legs into unique calls.
 * - Records sharing a sessionId collapse into one, keeping the longest leg and
 *   treating the call as answered if ANY leg was answered.
 * - Records without a sessionId fall back to their record id.
 * - Duplicate record ids from replayed pages are dropped.
 */
export function dedupeCalls(records: RawCallRecord[]): NormalizedCall[] {
  const seenRecordIds = new Set<string>();
  const bySession = new Map<string, NormalizedCall>();
  const out: NormalizedCall[] = [];

  for (const raw of records) {
    const call = normalizeCall(raw);
    if (!call.recordId) continue;
    if (seenRecordIds.has(call.recordId)) continue;
    seenRecordIds.add(call.recordId);

    const key = call.sessionId;
    if (!key) {
      out.push(call);
      continue;
    }

    const existing = bySession.get(key);
    if (!existing) {
      bySession.set(key, { ...call });
      continue;
    }

    // Merge: longest leg wins on duration, any answered leg answers the call.
    const answered = existing.answered || call.answered;
    const durationSeconds = Math.max(existing.durationSeconds, call.durationSeconds);
    const liveTalkSeconds = Math.max(existing.liveTalkSeconds, call.liveTalkSeconds);
    bySession.set(key, {
      ...existing,
      answered,
      durationSeconds,
      liveTalkSeconds,
      ringSeconds: answered ? 0 : Math.max(existing.ringSeconds, call.ringSeconds),
      // Prefer the leg that carries real phone numbers.
      fromNumber: existing.fromNumber ?? call.fromNumber,
      toNumber: existing.toNumber ?? call.toNumber,
      startedAt: earliest(existing.startedAt, call.startedAt),
      extensionId: existing.extensionId ?? call.extensionId,
      direction: existing.direction ?? call.direction,
      result: answered && !existing.answered ? call.result : existing.result,
    });
  }

  return [...out, ...bySession.values()];
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}