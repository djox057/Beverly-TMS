import { createHmac } from 'node:crypto';

export const ROLES = ['dispatcher', 'supervisor', 'manager', 'admin'];
const hidden = /^\/(trucks-map|upcoming-drivers|driver-expenses|stuff|transfer-list|roadside-inspection|truck-sales|repairs|fuel-reports)(\/|$)/;
const apiRead = /^\/rest\/v1\/[a-z_]+$/;

// No RPC or Edge Function is assumed read-only, including calls made with GET.
export function allowRequest(method, address, appOrigin, dataOrigin) {
  const url = new URL(address);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (url.origin === dataOrigin) {
    if (apiRead.test(url.pathname) || url.pathname === '/auth/v1/user') return true;
    if (url.origin !== appOrigin) return false;
  }
  if (url.origin !== appOrigin) return false;
  return !/^\/(rest|auth|functions|storage)\//.test(url.pathname);
}

export function allowFrame(message) {
  try {
    const parsed = JSON.parse(String(message));
    return ['heartbeat', 'phx_join', 'phx_leave'].includes(parsed.event);
  } catch { return false; }
}

export function fingerprint(values, secret) {
  return createHmac('sha256', secret).update(JSON.stringify(values)).digest('hex');
}

export function validateRecipe(recipe) {
  if (!recipe || recipe.version !== 1) throw new Error('Recipe version must be 1');
  for (const key of ['baseURL', 'dataOrigin']) {
    const url = new URL(recipe[key]);
    if (url.username || url.password || url.search || url.hash) throw new Error('Origins cannot contain credentials or queries');
  }
  if (new URL(recipe.dataOrigin).origin !== recipe.dataOrigin) throw new Error('dataOrigin must be an origin');
  if (!/^[a-z0-9.-]+$/.test(recipe.datasetLabel) || recipe.timezone !== 'America/Chicago') throw new Error('Non-sensitive dataset label and Chicago timezone required');
  if (recipe.reviewed !== true) throw new Error('Review private selectors, role markers and fixed filters first');
  if (!/^[a-f0-9]{40}$/.test(recipe.applicationRevision)) throw new Error('Verified measured application revision required');
  if (!Array.isArray(recipe.scenarios) || !recipe.scenarios.length) throw new Error('Scenarios required');
  const ids = new Set();
  for (const scenario of recipe.scenarios) {
    if (!/^[a-z0-9-]+$/.test(scenario.id) || ids.has(scenario.id)) throw new Error('Unique non-sensitive scenario ids required');
    ids.add(scenario.id);
    const url = new URL(scenario.path, recipe.baseURL);
    if (url.origin !== new URL(recipe.baseURL).origin || hidden.test(url.pathname)) throw new Error('Only visible same-origin scenarios allowed');
    if (!scenario.ready || !scenario.rows || !Array.isArray(scenario.checkpoints) || !scenario.checkpoints.length) throw new Error('Readiness, rows and total checkpoints required');
    if (!Array.isArray(scenario.roles) || scenario.roles.some(role => !ROLES.includes(role))) throw new Error('Explicit permitted roles required');
    if (scenario.roles.some(role => !recipe.roleMarkers?.[role])) throw new Error('Visible role markers required');
    for (const action of scenario.filters ?? []) {
      if (!['select', 'fill'].includes(action.kind) || !action.selector) throw new Error('Only explicit filter input actions allowed');
    }
  }
  return recipe;
}

// Store aggregates only. Never store URLs, request bodies, headers, or CDP events.
export class NetworkMeter {
  constructor(cdp) {
    this.cdp = cdp;
    this.active = null;
    this.requests = new Map();
    cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
      if (!this.active) return;
      this.active.requests++;
      if (request.method === 'OPTIONS') this.active.preflights++;
      this.requests.set(requestId, this.active);
    });
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const sample = this.requests.get(requestId);
      if (!sample) return;
      if (response.status >= 400) sample.httpErrors++;
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const sample = this.requests.get(requestId);
      if (!sample) return;
      sample.finished++;
      sample.transferBytes += encodedDataLength;
      this.requests.delete(requestId);
    });
    cdp.on('Network.loadingFailed', ({ requestId }) => {
      const sample = this.requests.get(requestId);
      if (!sample) return;
      sample.failed++;
      this.requests.delete(requestId);
    });
    cdp.on('Network.webSocketFrameReceived', () => {
      if (this.active) this.active.realtimeFrames++;
    });
  }
  async start() {
    await this.cdp.send('Network.enable');
    await this.cdp.send('Performance.enable');
  }
  begin() {
    if (this.active) throw new Error('Overlapping measurements');
    this.active = { requests: 0, preflights: 0, finished: 0, failed: 0, httpErrors: 0, transferBytes: 0, realtimeFrames: 0 };
  }
  async end() {
    if (!this.active) throw new Error('No active measurement');
    const sample = this.active;
    this.active = null;
    const { metrics } = await this.cdp.send('Performance.getMetrics');
    const heapBytes = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null;
    // Late completions belong to the old interval and must not contaminate the next.
    const inFlightAtEnd = [...this.requests.values()].filter(value => value === sample).length;
    const result = { ...sample, inFlightAtEnd, heapBytes };
    for (const [id, owner] of this.requests) if (owner === sample) this.requests.delete(id);
    return result;
  }
}

export async function installReadOnlyGuard(context, recipe, violations) {
  await context.route('**/*', async route => {
    const request = route.request();
    if (allowRequest(request.method(), request.url(), new URL(recipe.baseURL).origin, recipe.dataOrigin)) {
      await route.continue();
    } else {
      violations.http++;
      await route.abort('blockedbyclient');
    }
  });
  await context.routeWebSocket('**/*', socket => {
    const address = new URL(socket.url());
    if (address.host !== new URL(recipe.dataOrigin).host || address.pathname !== '/realtime/v1/websocket') {
      violations.websocket++;
      socket.close();
      return;
    }
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (allowFrame(message)) server.send(message);
      else violations.websocket++;
    });
    server.onMessage(message => socket.send(message));
  });
}

export async function measure(page, meter, scenario, phase, secret, violations, navigate) {
  const before = { ...violations };
  meter.begin();
  const start = performance.now();
  let result;
  try {
    await navigate();
    for (const filter of scenario.filters ?? []) {
      const locator = page.locator(filter.selector);
      if (filter.kind === 'fill') await locator.fill(filter.value);
      else await locator.selectOption(filter.value);
    }
    await page.locator(scenario.ready).waitFor({ state: 'visible' });
    for (const selector of scenario.busy ?? []) await page.locator(selector).waitFor({ state: 'hidden' });
    // Readiness is recipe-specific; require stable row/total values over a fixed window.
    const deadline = performance.now() + (scenario.stableTimeoutMs ?? 30000);
    let previous;
    let stableSince = performance.now();
    let snapshot;
    do {
      const rows = await page.locator(scenario.rows).allTextContents();
      const totals = [];
      for (const selector of scenario.checkpoints) {
        const locator = page.locator(selector);
        await locator.waitFor({ state: 'visible' });
        totals.push(await locator.innerText());
      }
      snapshot = { rowCount: rows.length, rowsDigest: fingerprint(rows, secret), totalsDigest: fingerprint(totals, secret) };
      const current = JSON.stringify(snapshot);
      if (current !== previous) { stableSince = performance.now(); previous = current; }
      if (performance.now() - stableSince >= (scenario.stableMs ?? 1000)) break;
      if (performance.now() >= deadline) throw new Error('unstable');
      await page.waitForTimeout(100);
    } while (true);
    // Authentication/role checks are prerequisites, never infer success from timing.
    if (new URL(page.url()).pathname === '/login') throw new Error('signed-out');
    result = { scenario: scenario.id, phase, status: 'measured', usableMs: Math.round(performance.now() - start), ...snapshot };
  } catch {
    // Playwright error messages can include locators with financial/person details.
    result = { scenario: scenario.id, phase, status: 'failed-readiness-or-session' };
  }
  const metrics = await meter.end();
  const blockedHttp = violations.http - before.http;
  const blockedWebsocket = violations.websocket - before.websocket;
  if (metrics.httpErrors || metrics.failed) result.status = 'invalid-network-errors';
  if (blockedHttp || blockedWebsocket) result.status = 'invalid-blocked-request';
  return { ...result, ...metrics, blockedHttp, blockedWebsocket };
}
