// Minimal SOAP client for the EFS (Electronic Funds Source) card web service.
// One isolated session + cookie jar per carrier account. Credentials never leave the server.

import { buildXml, escapeXml, parseXml } from "./xml.ts";
import {
  backoffDelayMs,
  isInvalidClientId,
  isRetryableFault,
  maskForLog,
  type EfsCardConfiguration,
} from "./cardStatus.ts";

const NS = "http://com.tch.cards.service";

export interface CarrierAccount {
  id: string;
  name: string;
  credential_secret_name: string;
  environment: string;
}

interface Credentials {
  username: string;
  password: string;
}

interface Session {
  clientId: string;
  cookies: Record<string, string>;
  createdAt: number;
}

/** In-memory, per-carrier sessions. EFS invalidates sessions around 3:00 AM Central. */
const sessions = new Map<string, Session>();
/** Per-card mutex so two users cannot update the same EFS card concurrently. */
const cardLocks = new Map<string, Promise<unknown>>();


export function endpointFor(environment: string): string {
  const prod = Deno.env.get("EFS_SOAP_ENDPOINT_PRODUCTION");
  const qa = Deno.env.get("EFS_SOAP_ENDPOINT_QA");
  const endpoint = environment === "production" ? prod : qa;
  if (!endpoint) throw new Error(`Missing EFS SOAP endpoint configuration for environment "${environment}"`);
  return endpoint;
}

function credentialsFor(account: CarrierAccount): Credentials {
  const raw = Deno.env.get(account.credential_secret_name);
  if (!raw) throw new Error(`Missing EFS credentials secret "${account.credential_secret_name}"`);
  let parsed: Credentials;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`EFS credentials secret "${account.credential_secret_name}" is not valid JSON`);
  }
  if (!parsed.username || !parsed.password) {
    throw new Error(`EFS credentials secret "${account.credential_secret_name}" must contain username and password`);
  }
  return parsed;
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function captureCookies(res: Response, jar: Record<string, string>) {
  const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}

export interface SoapResult {
  body: Record<string, unknown>;
  faultCode: string | null;
  faultMessage: string | null;
  httpStatus: number;
}

async function postSoap(
  endpoint: string,
  operation: string,
  innerXml: string,
  cookies: Record<string, string>,
): Promise<SoapResult> {
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${NS}">` +
    `<soapenv:Header/><soapenv:Body>${innerXml}</soapenv:Body></soapenv:Envelope>`;

  const headers: Record<string, string> = {
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: `${NS}${operation}`,
  };
  const cookieHeader = serializeCookies(cookies);
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  const res = await fetch(endpoint, { method: "POST", headers, body: envelope });
  captureCookies(res, cookies);
  const text = await res.text();
  const parsed = parseXml(text) as Record<string, any>;
  const body = parsed?.Envelope?.Body ?? {};
  const fault = body?.Fault ?? null;

  if (fault) {
    const faultCode = String(fault.faultcode ?? fault.Code?.Value ?? "SoapFault");
    const faultMessage = String(fault.faultstring ?? fault.Reason?.Text ?? "SOAP fault");
    console.error(`EFS ${operation} fault:`, maskForLog(`${faultCode} ${faultMessage}`));
    return { body, faultCode, faultMessage, httpStatus: res.status };
  }
  if (!res.ok) {
    return { body, faultCode: "HttpError", faultMessage: `HTTP ${res.status}`, httpStatus: res.status };
  }
  return { body, faultCode: null, faultMessage: null, httpStatus: res.status };
}

function xmlField(name: string, value: unknown): string {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

async function login(account: CarrierAccount): Promise<Session> {
  const creds = credentialsFor(account);
  const cookies: Record<string, string> = {};
  const result = await postSoap(
    endpointFor(account.environment),
    "login",
    `<ws:login>${xmlField("user", creds.username)}${xmlField("password", creds.password)}</ws:login>`,
    cookies,
  );
  if (result.faultCode) {
    throw new Error(`EFS login failed for ${account.name}: ${result.faultMessage}`);
  }
  const loginBody = (result.body as any)?.loginResponse ?? (result.body as any)?.["login-response"] ?? result.body;
  const rawClientId = typeof loginBody === "object" && loginBody !== null
    ? (loginBody.return ?? loginBody.clientId ?? loginBody.loginReturn ?? Object.values(loginBody)[0])
    : loginBody;
  const clientId = rawClientId == null ? "" : String(rawClientId);
  if (!clientId) console.error("EFS login response shape:", JSON.stringify(result.body).slice(0, 400));
  if (!clientId) throw new Error(`EFS login for ${account.name} returned no clientId`);
  const session: Session = { clientId, cookies, createdAt: Date.now() };
  sessions.set(account.id, session);
  return session;
}

async function session(account: CarrierAccount): Promise<Session> {
  return sessions.get(account.id) ?? (await login(account));
}

/**
 * Calls an EFS operation with a cached session. On InvalidClientId it logs in
 * again and retries exactly once; other transient errors use bounded backoff.
 */
async function call(
  account: CarrierAccount,
  operation: string,
  buildInner: (clientId: string) => string,
): Promise<Record<string, unknown>> {
  let relogged = false;
  let attempt = 0;

  for (;;) {
    const current = await session(account);
    const result = await postSoap(
      endpointFor(account.environment),
      operation,
      buildInner(current.clientId),
      current.cookies,
    );

    if (!result.faultCode) return result.body;

    if (isInvalidClientId(result.faultCode, result.faultMessage) && !relogged) {
      relogged = true;
      sessions.delete(account.id);
      await login(account);
      continue;
    }

    if (isRetryableFault(result.faultCode, result.httpStatus)) {
      const delay = backoffDelayMs(attempt);
      if (delay !== null) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }

    throw new Error(`EFS ${operation} failed: ${result.faultMessage ?? result.faultCode}`);
  }
}

/** Reads one card's full configuration. */
export async function getCardV2(account: CarrierAccount, cardNumber: string): Promise<EfsCardConfiguration> {
  const body = await call(
    account,
    "getCardv2",
    (clientId) => `<ws:getCardv2>${xmlField("clientId", clientId)}${xmlField("cardNumber", cardNumber)}</ws:getCardv2>`,
  );
  const card = (body as any)?.getCardv2Response?.return ?? (body as any)?.getCardv2Response ?? null;
  if (!card || typeof card !== "object") throw new Error("EFS getCardv2 returned no card configuration");
  return card as EfsCardConfiguration;
}

/** Writes a COMPLETE card configuration back to EFS (read-modify-write, never a PATCH). */
export async function setCardV2(account: CarrierAccount, card: EfsCardConfiguration): Promise<void> {
  const inner = buildXml({ card } as unknown as Record<string, never>);
  await call(
    account,
    "setCardV2",
    (clientId) => `<ws:setCardV2>${xmlField("clientId", clientId)}${inner}</ws:setCardV2>`,
  );
}

export interface CardSummary {
  cardNumber: string | null;
  status: string | null;
  unit: string | null;
  driverId: string | null;
}

/** One bulk request per carrier — never a per-card loop. */
export async function getCardSummariesV2(account: CarrierAccount): Promise<CardSummary[]> {
  const body = await call(
    account,
    "getCardSummariesV2",
    (clientId) => `<ws:getCardSummariesV2>${xmlField("clientId", clientId)}</ws:getCardSummariesV2>`,
  );
  const raw = (body as any)?.getCardSummariesV2Response?.return ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((row: any) => row && typeof row === "object")
    .map((row: any) => ({
      cardNumber: row.cardNumber != null ? String(row.cardNumber) : null,
      status: row.status != null ? String(row.status) : null,
      unit: row.unit != null ? String(row.unit) : null,
      driverId: row.driverId != null ? String(row.driverId) : null,
    }));
}

/** Serializes work per EFS card so concurrent status changes cannot interleave. */
export function withCardLock<T>(cardKey: string, fn: () => Promise<T>): Promise<T> {
  const previous = cardLocks.get(cardKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  cardLocks.set(
    cardKey,
    run.catch(() => undefined),
  );
  return run;
}

export function resetSessionsForTests() {
  sessions.clear();
  cardLocks.clear();
}
