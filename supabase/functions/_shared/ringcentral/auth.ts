// RingCentral authentication. Credentials never leave the server, and tokens
// are never logged or returned to clients.

export interface RingCentralConfig {
  clientId: string;
  clientSecret: string;
  jwtToken: string;
  serverUrl: string;
}

export class RingCentralConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Missing RingCentral credentials: ${missing.join(", ")}`);
    this.name = "RingCentralConfigError";
  }
}

export class RingCentralAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "RingCentralAuthError";
  }
}

export function readConfig(env = Deno.env): RingCentralConfig {
  const clientId = env.get("RINGCENTRAL_CLIENT_ID") ?? "";
  const clientSecret = env.get("RINGCENTRAL_CLIENT_SECRET") ?? "";
  const jwtToken = env.get("RINGCENTRAL_JWT_TOKEN") ?? "";
  const serverUrl = env.get("RINGCENTRAL_SERVER_URL") || "https://platform.ringcentral.com";

  const missing: string[] = [];
  if (!clientId) missing.push("RINGCENTRAL_CLIENT_ID");
  if (!clientSecret) missing.push("RINGCENTRAL_CLIENT_SECRET");
  if (!jwtToken) missing.push("RINGCENTRAL_JWT_TOKEN");
  if (missing.length) throw new RingCentralConfigError(missing);

  return { clientId, clientSecret, jwtToken, serverUrl };
}

export interface RingCentralToken {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  ownerId?: string;
}

let cached: RingCentralToken | null = null;

export function clearTokenCache() {
  cached = null;
}

export async function getAccessToken(
  config: RingCentralConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RingCentralToken> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const res = await fetchImpl(`${config.serverUrl}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
    },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(config.jwtToken)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    // Never echo the token/assertion back; only the provider error code.
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error_description || parsed.errors?.[0]?.message || parsed.error || detail;
    } catch { /* keep truncated text */ }
    throw new RingCentralAuthError(detail, res.status);
  }

  const json = await res.json();
  const scopes: string[] = typeof json.scope === "string" ? json.scope.split(/\s+/).filter(Boolean) : [];
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    scopes,
    ownerId: json.owner_id,
  };
  return cached;
}

export const REQUIRED_SCOPES = ["ReadCallLog", "ReadMessages"] as const;

/**
 * Returns the required scopes the app token is missing. RingCentral does not
 * always echo every granted permission, so an empty scope list is treated as
 * "unknown" rather than "everything is missing".
 */
export function missingScopes(token: RingCentralToken): string[] {
  if (!token.scopes.length) return [];
  const granted = new Set(token.scopes);
  return REQUIRED_SCOPES.filter((s) => !granted.has(s));
}