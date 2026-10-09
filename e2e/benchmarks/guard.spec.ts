import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installReadOnlyGuard, NetworkMeter, measure } from '../../scripts/benchmarks/core.mjs';

test('synthetic browser measurement preserves rows/totals and prevents a real HTTP write', async ({ browser }) => {
  let writes = 0;
  const server = createServer((request, response) => {
    if (request.method === 'POST') writes++;
    response.setHeader('Content-Type', 'text/html');
    response.end('<h1>Analytics</h1><table><tbody><tr><td>Fixture driver</td><td>$100</td></tr></tbody><tfoot><tr><td>$100</td></tr></tfoot></table>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const violations = { http: 0, websocket: 0 };
    await installReadOnlyGuard(context, { baseURL: origin, dataOrigin: origin }, violations);
    const page = await context.newPage();
    const meter = new NetworkMeter(await context.newCDPSession(page)); await meter.start();
    const scenario = { id: 'analytics', ready: 'h1', rows: 'tbody tr', checkpoints: ['tfoot'], stableMs: 0 };
    const cold = await measure(page, meter, scenario, 'cold', 'fixture-key', violations, () => page.goto(origin));
    const reload = await measure(page, meter, scenario, 'reload', 'fixture-key', violations, () => page.reload());
    expect(cold.status).toBe('measured'); expect(cold.rowCount).toBe(1);
    expect(cold.rowsDigest).toBe(reload.rowsDigest); expect(cold.totalsDigest).toBe(reload.totalsDigest);
    expect(cold.requests).toBeGreaterThan(0); expect(cold.heapBytes).toBeGreaterThan(0);
    await page.evaluate(async address => { try { await fetch(address + '/rest/v1/orders', { method: 'POST', body: 'fixture' }); } catch { /* expected guard */ } }, origin);
    expect(writes).toBe(0); expect(violations.http).toBe(1);
  } finally { await context.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('complete runner captures cold/warm/reload/reconnect and isolated sessions without raw values', async () => {
  test.setTimeout(60000);
  let writes = 0;
  const server = createServer((request, response) => {
    if (request.method !== 'GET') writes++;
    const account = request.headers.cookie?.includes('fixture_account=2') ? 'second' : 'first';
    response.setHeader('Content-Type', 'text/html');
    response.end(`<span>manager</span><a href="/analytics">Analytics</a><a href="/reports">Reports</a><h1>Ready</h1><table><tbody><tr><td>Fixture ${account} person</td><td>$100</td></tr></tbody><tfoot><tr><td>$100</td></tr></tfoot></table>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  const directory = await mkdtemp(join(tmpdir(), 'tms02-fixture-'));
  try {
    const recipe = { version: 1, reviewed: true, applicationRevision: 'a'.repeat(40), baseURL: origin, dataOrigin: origin, timezone: 'America/Chicago', datasetLabel: 'synthetic-fixed-week', roleMarkers: { manager: 'text=/^manager$/' }, scenarios: ['analytics', 'reports'].map(id => ({ id, path: `/${id}`, roles: ['manager'], ready: 'h1', rows: 'tbody tr', checkpoints: ['tfoot'], stableMs: 0 })) };
    await writeFile(join(directory, 'recipe.json'), JSON.stringify(recipe));
    for (const account of [1, 2]) await writeFile(join(directory, `state${account}.json`), JSON.stringify({ cookies: [{ name: 'fixture_account', value: String(account), domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }));
    const output = join(directory, 'output.json');
    await promisify(execFile)(process.execPath, ['scripts/benchmarks/run.mjs', join(directory, 'recipe.json'), 'manager', join(directory, 'state1.json'), output, join(directory, 'state2.json')], { env: process.env, timeout: 50000 });
    const raw = await readFile(output, 'utf8');
    const report = JSON.parse(raw);
    expect(report.accepted).toBe(true); expect(report.records).toHaveLength(12);
    for (const phase of ['cold', 'reload', 'warm-1', 'warm-2', 'warm-3', 'reconnect', 'isolated-session-change']) expect(report.records.some((record: { phase: string }) => record.phase === phase)).toBe(true);
    const cold = report.records.find((record: { phase: string }) => record.phase === 'cold');
    const next = report.records.find((record: { phase: string }) => record.phase === 'isolated-session-change');
    expect(cold.rowsDigest).not.toBe(next.rowsDigest);
    expect(raw).not.toContain('Fixture first'); expect(raw).not.toContain('Fixture second');
    expect(raw).not.toContain('$100'); expect(raw).not.toContain('fixture_account');
    expect(writes).toBe(0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
