// Typed client for App 2 (LoadMatch VPS) — fetches matched loads.
//
// Calls the `loadmatch-proxy` Supabase edge function which server-side fetches
// the plain-HTTP VPS at http://128.140.115.63:8080. This avoids the mixed-content
// block that fires when the HTTPS browser origin tries to hit HTTP directly.
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Fetch matched orders from App 2 via the `loadmatch-proxy` edge function.
 *
 * - Pass a `truckId` to scope to a single truck (small response, preferred).
 * - Omit it to get the full fleet result.
 *
 * Throws {@link LoadMatchError} on failure — callers can distinguish
 * "no matches" (empty array) from "request failed".
 */
export async function getMatchedOrders(
  truckId?: string,
  _signal?: AbortSignal,
): Promise<MatchedOrder[]> {
  const { data, error } = await supabase.functions.invoke("loadmatch-proxy", {
    body: truckId ? { truck_id: truckId } : {},
  });

  if (error) {
    throw new LoadMatchError(
      `LoadMatch proxy request failed: ${error.message}`,
      { cause: error },
    );
  }
  if (data && typeof data === "object" && "error" in (data as any)) {
    const errPayload = data as { error: string; status?: number };
    throw new LoadMatchError(errPayload.error, { status: errPayload.status });
  }
  if (!Array.isArray(data)) {
    throw new LoadMatchError("LoadMatch proxy returned a non-array payload");
  }
  return data as MatchedOrder[];
}