// Thin RingCentral REST client: per-request timeout, bounded retries with
// exponential backoff on 429/5xx, and a hard pagination cap.

import { getAccessToken, type RingCentralConfig } from "./auth.ts";

export type ErrorCategory =
  | "auth"
  | "permission"
  | "rate_limit"
  | "provider_4xx"
  | "provider_5xx"
  | "timeout"
  | "network"
  | "unknown";

export class RingCentralApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public category: ErrorCategory,
    public missingPermission?: string,
  ) {
    super(message);
    this.name = "RingCentralApiError";
  }
}

export function categorize(status: number, body: string): ErrorCategory {
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_5xx";
  if (status >= 400) {
    // RingCentral reports missing app permissions as CMN-408 / "not allowed"
    if (/CMN-408|permission|not allowed/i.test(body)) return "permission";
    return "provider_4xx";
  }
  return "unknown";
}

/** Which RingCentral permission a 403 on a given path implies. */
export function permissionForPath(path: string): string | undefined {
  if (path.includes("/call-log") || path.includes("/analytics/calls")) return "ReadCallLog";
  if (path.includes("/message-store")) return "ReadMessages";
  return undefined;
}

export interface ClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 3;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RingCentralClient {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private maxRetries: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(private config: RingCentralConfig, opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.config.serverUrl}${path}`;
    let attempt = 0;

    for (;;) {
      const token = await getAccessToken(this.config, this.fetchImpl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
          headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${token.accessToken}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
          },
        });
      } catch (err) {
        clearTimeout(timer);
        const aborted = (err as Error)?.name === "AbortError";
        const category: ErrorCategory = aborted ? "timeout" : "network";
        if (attempt < this.maxRetries) {
          await this.sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        throw new RingCentralApiError(
          aborted ? `RingCentral request timed out after ${this.timeoutMs}ms` : "RingCentral request failed",
          0,
          category,
        );
      }
      clearTimeout(timer);

      if (res.ok) return (await res.json()) as T;

      const body = await res.text();
      const category = categorize(res.status, body);

      const retryable = category === "rate_limit" || category === "provider_5xx";
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        attempt++;
        continue;
      }

      throw new RingCentralApiError(
        `RingCentral ${res.status} on ${redactPath(path)}: ${body.slice(0, 300)}`,
        res.status,
        category,
        category === "permission" ? permissionForPath(path) : undefined,
      );
    }
  }
}

export function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}

function redactPath(path: string): string {
  return path.replace(/(\+?\d{6,15})/g, "***");
}

/** Hard cap so a bad cursor can never cause unbounded requests. */
export const MAX_PAGES = 50;