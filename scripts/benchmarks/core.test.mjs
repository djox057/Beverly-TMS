import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { allowRequest, allowFrame, fingerprint, validateRecipe, NetworkMeter, measure, installReadOnlyGuard } from './core.mjs';

const app = 'https://app.example';
const data = 'https://data.example';
const recipe = () => ({ version: 1, applicationRevision: 'a'.repeat(40), reviewed: true, roleMarkers: { manager: 'text=/^manager$/' }, baseURL: app, dataOrigin: data, timezone: 'America/Chicago', datasetLabel: 'fixture-week-2026-10-05', scenarios: [{ id: 'analytics', path: '/analytics', roles: ['manager'], ready: 'h1', rows: 'tbody tr', checkpoints: ['tfoot'], stableMs: 0 }] });

test('writes, RPCs, Edge Functions, storage and unrelated origins fail closed', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(allowRequest(method, `${data}/rest/v1/orders`, app, data), false);
    assert.equal(allowRequest(method, `${app}/analytics`, app, data), false);
  }
  for (const path of ['/rest/v1/rpc/get_totals', '/functions/v1/send-final-update', '/storage/v1/object/docs/file', '/auth/v1/token']) {
    assert.equal(allowRequest('GET', data + path, app, data), false);
  }
  assert.equal(allowRequest('GET', 'https://other.example/pixel', app, data), false);
});

test('ordinary reads, assets and preflight requests can pass', () => {
  assert.equal(allowRequest('GET', data + '/rest/v1/orders?select=*&id=eq.private', app, data), true);
  assert.equal(allowRequest('GET', data + '/auth/v1/user', app, data), true);
  assert.equal(allowRequest('OPTIONS', data + '/rest/v1/orders', app, data), true);
  assert.equal(allowRequest('GET', app + '/assets/index.js', app, data), true);
  assert.equal(allowRequest('GET', app + '/', app, app), true);
  assert.equal(allowRequest('GET', app + '/functions/v1/send-final-update', app, app), false);
});

test('realtime subscriptions pass while broadcast/presence/custom messages cannot write', () => {
  for (const event of ['heartbeat', 'phx_join', 'phx_leave']) assert.equal(allowFrame(JSON.stringify({ event })), true);
  for (const event of ['broadcast', 'presence', 'postgres_changes', 'INSERT']) assert.equal(allowFrame(JSON.stringify({ event })), false);
  assert.equal(allowFrame('not json'), false);
});

test('digests detect changed values and row order without exposing known financial values', () => {
  const values = ['Private Person', '$12,345.67'];
  const digest = fingerprint(values, 'private-key');
  assert.equal(digest, fingerprint(values, 'private-key'));
  assert.notEqual(digest, fingerprint(values.reverse(), 'private-key'));
  assert.notEqual(digest, fingerprint(values, 'different-key'));
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test('recipes reject hidden and external workflows and require counts/totals', () => {
  assert.doesNotThrow(() => validateRecipe(recipe()));
  for (const path of ['/repairs', '/fuel-reports', '/stuff/123', 'https://external.example/analytics']) {
    const input = recipe(); input.scenarios[0].path = path;
    assert.throws(() => validateRecipe(input));
  }
  const incomplete = recipe(); incomplete.scenarios[0].checkpoints = [];
  assert.throws(() => validateRecipe(incomplete));
  const unsafe = recipe(); unsafe.scenarios[0].filters = [{ kind: 'click', selector: 'button' }];
  assert.throws(() => validateRecipe(unsafe));
  const noRole = recipe(); noRole.roleMarkers = {};
  assert.throws(() => validateRecipe(noRole));
  const unreviewed = recipe(); unreviewed.reviewed = false;
  assert.throws(() => validateRecipe(unreviewed));
});

class CDP extends EventEmitter {
  async send(method) { return method === 'Performance.getMetrics' ? { metrics: [{ name: 'JSHeapUsedSize', value: 1024 }] } : {}; }
}

test('network samples attribute failures, bytes, heap, HTTP errors and in-flight work', async () => {
  const cdp = new CDP(); const meter = new NetworkMeter(cdp); await meter.start(); meter.begin();
  cdp.emit('Network.requestWillBeSent', { requestId: '1', request: { method: 'GET', url: 'private-url' } });
  cdp.emit('Network.responseReceived', { requestId: '1', response: { status: 500 } });
  cdp.emit('Network.loadingFinished', { requestId: '1', encodedDataLength: 123 });
  cdp.emit('Network.requestWillBeSent', { requestId: '2', request: { method: 'OPTIONS' } });
  cdp.emit('Network.loadingFailed', { requestId: '2' });
  cdp.emit('Network.requestWillBeSent', { requestId: '3', request: { method: 'GET' } });
  cdp.emit('Network.webSocketFrameReceived', { response: { payloadData: 'private-record' } });
  assert.deepEqual(await meter.end(), { requests: 3, preflights: 1, finished: 1, failed: 1, httpErrors: 1, transferBytes: 123, realtimeFrames: 1, inFlightAtEnd: 1, heapBytes: 1024 });
});

test('late completions cannot inflate bytes in a later sample', async () => {
  const cdp = new CDP(); const meter = new NetworkMeter(cdp); meter.begin();
  cdp.emit('Network.requestWillBeSent', { requestId: 'old', request: { method: 'GET' } });
  await meter.end(); meter.begin();
  cdp.emit('Network.loadingFinished', { requestId: 'old', encodedDataLength: 999 });
  assert.equal((await meter.end()).transferBytes, 0);
});

function fakePage({ fail = false, signedOut = false } = {}) {
  return { url: () => app + (signedOut ? '/login' : '/analytics'), waitForTimeout: async () => {}, locator: () => ({ waitFor: async () => { if (fail) throw new Error('private-token-and-record'); }, allTextContents: async () => ['person and financial row'], innerText: async () => '$99.00' }) };
}

test('successful measurements persist counts and digests rather than row/total text', async () => {
  const meter = new NetworkMeter(new CDP());
  const output = await measure(fakePage(), meter, recipe().scenarios[0], 'cold', 'key', { http: 0, websocket: 0 }, async () => {});
  assert.equal(output.status, 'measured'); assert.equal(output.rowCount, 1);
  assert.ok(!JSON.stringify(output).includes('person')); assert.ok(!JSON.stringify(output).includes('$99'));
});

test('expired sessions and readiness errors are failures without raw exception text', async () => {
  for (const options of [{ fail: true }, { signedOut: true }]) {
    const output = await measure(fakePage(options), new NetworkMeter(new CDP()), recipe().scenarios[0], 'cold', 'key', { http: 0, websocket: 0 }, async () => {});
    assert.equal(output.status, 'failed-readiness-or-session');
    assert.ok(!JSON.stringify(output).includes('private-token'));
  }
});

test('blocked side effects invalidate a seemingly usable page', async () => {
  const violations = { http: 0, websocket: 0 };
  const output = await measure(fakePage(), new NetworkMeter(new CDP()), recipe().scenarios[0], 'cold', 'key', violations, async () => { violations.http++; });
  assert.equal(output.status, 'invalid-blocked-request'); assert.equal(output.blockedHttp, 1);
});

test('HTTP errors invalidate a stable page rather than producing accepted timings', async () => {
  const cdp = new CDP(); const meter = new NetworkMeter(cdp);
  const output = await measure(fakePage(), meter, recipe().scenarios[0], 'cold', 'key', { http: 0, websocket: 0 }, async () => {
    cdp.emit('Network.requestWillBeSent', { requestId: 'error', request: { method: 'GET' } });
    cdp.emit('Network.responseReceived', { requestId: 'error', response: { status: 401 } });
    cdp.emit('Network.loadingFinished', { requestId: 'error', encodedDataLength: 12 });
  });
  assert.equal(output.status, 'invalid-network-errors');
});

test('guard actually aborts denied requests instead of merely logging them', async () => {
  let callback; let continued = 0; let aborted = 0;
  const violations = { http: 0, websocket: 0 };
  await installReadOnlyGuard({ route: async (_, fn) => { callback = fn; }, routeWebSocket: async () => {} }, recipe(), violations);
  for (const method of ['GET', 'POST']) await callback({ request: () => ({ method: () => method, url: () => data + '/rest/v1/orders' }), continue: async () => { continued++; }, abort: async () => { aborted++; } });
  assert.deepEqual({ continued, aborted, violations }, { continued: 1, aborted: 1, violations: { http: 1, websocket: 0 } });
});
