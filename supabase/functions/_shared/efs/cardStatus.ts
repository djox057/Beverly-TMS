// Deno mirror of src/lib/efs/cardStatus.ts — keep both copies in sync.

export type ControllableStatus = "Active" | "Hold";

export const CONTROLLABLE_STATUSES: ControllableStatus[] = ["Active", "Hold"];

export function normalizeControllableStatus(rawStatus: string | null | undefined): ControllableStatus | null {
  if (!rawStatus) return null;
  const value = String(rawStatus).trim().toLowerCase();
  if (value === "active") return "Active";
  if (value === "hold") return "Hold";
  return null;
}

export function canControl(rawStatus: string | null | undefined): boolean {
  return normalizeControllableStatus(rawStatus) !== null;
}

export const UNCONTROLLABLE_MESSAGE = "This card cannot be controlled from TMS";

export function isValidRequestedStatus(value: unknown): value is ControllableStatus {
  return value === "Active" || value === "Hold";
}

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

export function maskForLog(input: string): string {
  return input
    .replace(/\d{9,}/g, (m) => `****${m.slice(-4)}`)
    .replace(/(<(?:\w+:)?password>)[^<]*(<\/)/gi, "$1***$2")
    .replace(/(<(?:\w+:)?clientId>)[^<]*(<\/)/gi, "$1***$2");
}

export interface EfsCardConfiguration {
  [key: string]: unknown;
}

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
  return { ...JSON.parse(JSON.stringify(current)), status: requestedStatus };
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

export function backoffDelayMs(attempt: number, maxAttempts = 3, baseMs = 400): number | null {
  if (attempt >= maxAttempts) return null;
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, 5000);
}

export function isRetryableFault(faultCode: string | null | undefined, httpStatus?: number): boolean {
  if (httpStatus && httpStatus >= 500) return true;
  if (!faultCode) return false;
  const code = String(faultCode).toLowerCase();
  if (code.includes("invalidclientid")) return true;
  if (code.includes("timeout") || code.includes("unavailable") || code.includes("throttl")) return true;
  return false;
}

export function isInvalidClientId(faultCode: string | null | undefined, message?: string | null): boolean {
  const haystack = `${faultCode ?? ""} ${message ?? ""}`.toLowerCase();
  return haystack.includes("invalidclientid");
}
