import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROLES, validateRecipe, NetworkMeter, installReadOnlyGuard, measure } from './core.mjs';

const [recipeFile, role, stateFile, outputFile, nextStateFile] = process.argv.slice(2);
if (!recipeFile || !ROLES.includes(role) || !stateFile || !outputFile) {
  console.error('Usage: node scripts/benchmarks/run.mjs RECIPE ROLE PRIVATE_STORAGE_STATE OUTPUT [NEXT_PRIVATE_STORAGE_STATE]');
  process.exit(1);
}

let browser;
try {
  const recipe = validateRecipe(JSON.parse(await readFile(recipeFile, 'utf8')));
  const secret = process.env.TMS_BENCHMARK_DIGEST_KEY || randomBytes(32).toString('hex');
  const scenarios = recipe.scenarios.filter(scenario => scenario.roles.includes(role));
  if (!scenarios.length) throw new Error('No scenarios for selected role');
  const records = [];
  let violations;
  let context;
  let page;
  let meter;
  browser = await chromium.launch({ headless: true, executablePath: process.env.TMS_BENCHMARK_CHROMIUM });
  async function openSession(storageState) {
    violations = { http: 0, websocket: 0 };
    context = await browser.newContext({ storageState, serviceWorkers: 'block', timezoneId: 'America/Chicago', viewport: { width: 1440, height: 900 } });
    await installReadOnlyGuard(context, recipe, violations);
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    meter = new NetworkMeter(await context.newCDPSession(page));
    await meter.start();
  }
  async function verifyRole() {
    await page.locator(recipe.roleMarkers[role]).waitFor({ state: 'visible' });
  }
  const navigation = async scenario => {
    await page.goto(new URL(scenario.path, recipe.baseURL).href, { waitUntil: 'domcontentloaded' });
    await verifyRole();
  };
  // Fresh context per scenario: fresh JS heap/query cache, supplied auth retained.
  for (const scenario of scenarios) {
    await openSession(stateFile);
    records.push(await measure(page, meter, scenario, 'cold', secret, violations, () => navigation(scenario)));
    records.push(await measure(page, meter, scenario, 'reload', secret, violations, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' }); await verifyRole();
    }));
    await context.close();
  }
  await openSession(stateFile);
  await navigation(scenarios[0]);
  // Real SPA links, rather than goto, retain the app's in-memory caches.
  for (let round = 1; round <= 3; round++) {
    for (const scenario of scenarios) {
      records.push(await measure(page, meter, scenario, `warm-${round}`, secret, violations, async () => {
        if (new URL(page.url()).pathname !== new URL(scenario.path, recipe.baseURL).pathname) {
          await page.locator(scenario.warmLink ?? `a[href="${scenario.path}"]`).first().click();
        }
        await verifyRole();
      }));
    }
  }
  await context.setOffline(true);
  await page.waitForTimeout(1000);
  const first = scenarios[0];
  records.push(await measure(page, meter, first, 'reconnect', secret, violations, async () => {
    await context.setOffline(false);
    await navigation(first);
  }));
  await context.close();
  if (nextStateFile) {
    await openSession(nextStateFile);
    records.push(await measure(page, meter, first, 'isolated-session-change', secret, violations, () => navigation(first)));
    await context.close();
  }
  const parity = scenarios.map(scenario => {
    const samples = records.filter(record => record.scenario === scenario.id && record.phase !== 'isolated-session-change');
    return { scenario: scenario.id, consistent: samples.every(record => record.status === 'measured' && record.rowsDigest === samples[0].rowsDigest && record.totalsDigest === samples[0].totalsDigest) };
  });
  const report = {
    version: 1, harnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    applicationRevision: recipe.applicationRevision,
    capturedAt: new Date().toISOString(), role, datasetLabel: recipe.datasetLabel,
    timezone: 'America/Chicago', chromiumVersion: browser.version(), viewport: { width: 1440, height: 900 },
    cacheMode: 'HTTP cache disabled by write guard; warm means SPA cache reuse',
    digestScope: process.env.TMS_BENCHMARK_DIGEST_KEY ? 'private shared key' : 'this run only',
    sessionChange: nextStateFile ? 'isolated context only; in-app account switch still requires manual check' : 'not exercised',
    accepted: parity.every(result => result.consistent) && records.every(record => record.status === 'measured'), records, parity,
  };
  await mkdir(resolve(outputFile, '..'), { recursive: true });
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(`Saved ${records.length} redacted measurements; parity ${report.accepted ? 'passed' : 'requires review'}.`);
  if (!report.accepted) process.exitCode = 2;
} catch {
  console.error('Benchmark failed. Check private recipe, auth state, browser installation and access; no error detail exported.');
  process.exitCode = 1;
} finally { await browser?.close(); }
