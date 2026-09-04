// Pure, dependency-free EFS fuel-card status logic.
// Mirrored for the Deno runtime at supabase/functions/_shared/efs/cardStatus.ts
// Keep both copies in sync.

export type ControllableStatus = "Active" | "Hold";

export const CONTROLLABLE_STATUSES: ControllableStatus[] = ["Active", "Hold"];

/** Maps a raw EFS status string to the two statuses TMS is allowed to control. */
export function normalizeControllableStatus(rawStatus: string | null | undefined): ControllableStatus | null {
  if (!rawStatus) return null;
  const value = rawStatus.trim().toLowerCase();
  if (value === "active") return "Active";
  if (value === "hold") return "Hold";
  return null;
}

export function canControl(rawStatus: string | null | undefined): boolean {
  return normalizeControllableStatus(rawStatus) !== null;
}

export const UNCONTROLLABLE_MESSAGE = "This card cannot be controlled from TMS";

/** Validates a status requested by a client. Anything but Active/Hold is rejected. */
export function isValidRequestedStatus(value: unknown): value is ControllableStatus {
  return value === "Active" || value === "Hold";
}

/** Never returns more than the last four digits. */
export function maskCardNumber(cardNumber: string | null | undefined): string | null {
  if (!cardNumber) return null;
  const digits = String(cardNumber).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `****${digits.slice(-4)}`;
}

export function lastFour(cardNumber: string | null | undefined): string | null {
  const masked = maskCardNumber(cardNumber);
  return masked ? masked.slice(-4) : null;
}

/** Replaces card numbers and credential-ish values in log output. */
export function maskForLog(input: string): string {
  return input
    .replace(/\d{9,}/g, (m) => `****${m.slice(-4)}`)
    .replace(/(<(?:\w+:)?password>)[^<]*(<\/)/gi, "$1***$2")
    .replace(/(<(?:\w+:)?clientId>)[^<]*(<\/)/gi, "$1***$2");
}

export interface EfsCardConfiguration {
  /** Everything EFS returned for this card. Must be echoed back untouched. */
  [key: string]: unknown;
}

/**
 * Builds a complete setCardV2 payload: every field returned by getCardv2 is
 * preserved and only `status` is replaced. Never produces a partial payload.
 */
export function buildSetCardPayload(
  current: EfsCardConfiguration,
  requestedStatus: ControllableStatus,
): EfsCardConfiguration {
  if (!current || typeof current !== "object") {
    throw new Error("Cannot build setCardV2 payload without the current card configuration");
  }
  if (!isValidRequestedStatus(requestedStatus)) {
    throw new Error(`Refusing to set unsupported status: ${String(requestedStatus)}`);
  }
  const currentRaw = typeof current.status === "string" ? current.status : null;
  if (!canControl(currentRaw)) {
    throw new Error(`${UNCONTROLLABLE_MESSAGE} (current status: ${currentRaw ?? "unknown"})`);
  }
  return { ...structuredCloneSafe(current), status: requestedStatus };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface CardMappingCandidate {
  id: string;
  cardNumber?: string | null;
  cardLastFour?: string | null;
  carrierAccountId?: string | null;
}

export type CardResolution =
  | { ok: true; card: CardMappingCandidate }
  | { ok: false; reason: "missing" | "ambiguous"; message: string };

/** Resolves exactly one card for a truck; never silently picks one of several. */
export function resolveTruckCard(candidates: CardMappingCandidate[]): CardResolution {
  if (!candidates || candidates.length === 0) {
    return {
      ok: false,
      reason: "missing",
      message: "No EFS card is mapped to this truck. Add the card mapping before using this feature.",
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `Configuration error: ${candidates.length} EFS cards match this truck. Correct the mapping so exactly one card is linked.`,
    };
  }
  return { ok: true, card: candidates[0] };
}

/** Only rows whose raw status actually changed should be written by the bulk sync. */
export function selectChangedCards<T extends { truckId: string; rawStatus: string | null }>(
  incoming: T[],
  storedByTruckId: Record<string, string | null | undefined>,
): T[] {
  return incoming.filter((row) => {
    const stored = storedByTruckId[row.truckId];
    const a = (stored ?? "").trim().toLowerCase();
    const b = (row.rawStatus ?? "").trim().toLowerCase();
    return a !== b;
  });
}

/** Bounded exponential backoff with jitter. Returns ms, or null when exhausted. */
export function backoffDelayMs(attempt: number, maxAttempts = 3, baseMs = 400): number | null {
  if (attempt >= maxAttempts) return null;
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, 5000);
}

/** Transient errors may be retried; validation/business faults must not be. */
export function isRetryableFault(faultCode: string | null | undefined, httpStatus?: number): boolean {
  if (httpStatus && httpStatus >= 500) return true;
  if (!faultCode) return false;
  const code = faultCode.toLowerCase();
  if (code.includes("invalidclientid")) return true;
  if (code.includes("timeout") || code.includes("unavailable") || code.includes("throttl")) return true;
  return false;
}

export function isInvalidClientId(faultCode: string | null | undefined, message?: string | null): boolean {
  const haystack = `${faultCode ?? ""} ${message ?? ""}`.toLowerCase();
  return haystack.includes("invalidclientid");
}
