// Typed client for App 2 (LoadMatch VPS) — fetches matched loads.
// See docs: GET /api/matched-orders?truck_id=<uuid>
//
// NOTE: App 2 currently has no authentication and CORS is wide open (*).
// If the environment ever requires stricter access control, that decision
// needs to be made explicitly — this client does not add auth headers.

export interface MatchedOrder {
  source_load_id: string;
  /** Number of near-identical postings collapsed into this entry (>= 1). */
  count: number;
  truck_id: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  /** App 2 filters to van only server-side. */
  equipment: "van";
  rate: number | null;
  deadhead_miles: number | null;
  /** 0..1, higher is better. */
  score: number | null;
  /** ISO 8601. */
  pickup_start: string | null;
  pickup_end: string | null;
}

export class LoadMatchError extends Error {
  status?: number;
  cause?: unknown;
  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "LoadMatchError";
    this.status = opts?.status;
    this.cause = opts?.cause;
  }
}

const DEFAULT_BASE_URL = "http://128.140.115.63:8080";
const DEFAULT_TIMEOUT_MS = 15_000;

function baseUrl(): string {
  const fromEnv = (import.meta as any).env?.VITE_LOADMATCH_URL as string | undefined;
  return (fromEnv && fromEnv.trim()) || DEFAULT_BASE_URL;
}

/**
 * Fetch matched orders from App 2.
 *
 * - Pass a `truckId` to scope to a single truck (small response, preferred).
 * - Omit it to get the full fleet result (can be tens of thousands of entries).
 *
 * Throws {@link LoadMatchError} on non-2xx, timeout, or network failure —
 * callers can distinguish "no matches" (empty array) from "request failed".
 */
export async function getMatchedOrders(
  truckId?: string,
  signal?: AbortSignal,
): Promise<MatchedOrder[]> {
  const url = new URL("/api/matched-orders", baseUrl());
  if (truckId) url.searchParams.set("truck_id", truckId);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    DEFAULT_TIMEOUT_MS,
  );
  const onExternalAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as any)?.name === "AbortError" || (err as any)?.name === "TimeoutError") {
      throw new LoadMatchError(
        `LoadMatch request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        { cause: err },
      );
    }
    throw new LoadMatchError("LoadMatch network request failed", { cause: err });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    throw new LoadMatchError(
      `LoadMatch responded ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      { status: response.status },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new LoadMatchError("LoadMatch returned invalid JSON", { cause: err });
  }

  if (!Array.isArray(data)) {
    throw new LoadMatchError("LoadMatch returned a non-array payload");
  }
  return data as MatchedOrder[];
}