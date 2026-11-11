import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import ts from 'typescript';
import { harness } from '../tests/helpers/analyticsBulkHarness.mjs';

// Compare a known reference without hitting live data or storing credentials.
const ref = process.argv[2];
if (!ref) throw new Error('Usage: node scripts/benchmarks/analytics-parity.mjs <baseline-commit>');
const baselineFiles = new Map();
const baselineSource = path => {
  if (!baselineFiles.has(path)) baselineFiles.set(path, execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' }));
  return baselineFiles.get(path);
};
let cases = 0;
for (const slug of ['get-all-locked-orders', 'get-all-unlocked-orders']) {
  for (const roles of [['admin'], ['supervisor'], ['supervisor', 'dispatch'], ['supervisor', 'manager']]) {
    for (const body of [
      { fields: 'analytics' }, { fields: 'full' }, { fields: 'analytics', offset: 1000 },
      { fields: 'analytics', bookedBy: 'Dispatcher', dispatcherDriverIds: ['d1'], bookedByCompanyId: 'c1', excludeBookedByCompanyId: 'c2' },
      { fields: 'analytics', countOnly: true }, { fields: 'analytics', limit: 1 },
    ]) {
      const previous = harness(slug, { roles, readSource: baselineSource });
      const candidate = harness(slug, { roles });
      assert.deepEqual(await candidate.run(body), await previous.run(body), `${slug}: response changed`);
      const queries = app => app.reads.map(query => JSON.stringify(query)).sort();
      assert.deepEqual(queries(candidate), queries(previous), `${slug}: database reads changed`);
      cases++;
    }
  }
}

const path = 'src/pages/Analytics.tsx';
const parse = source => ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const original = parse(baselineSource(path));
const updated = parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const printer = ts.createPrinter({ removeComments: true });
function initializer(source, name) {
  let found;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer;
    ts.forEachChild(node, walk);
  }
  walk(source); assert(found, `Missing calculation: ${name}`); return found;
}
const print = node => printer.printNode(ts.EmitHint.Expression, node, node.getSourceFile());
const calculations = [
  'filteredOrders', 'dispatcherAnalytics', 'ordersForTotals', 'totals', 'driverAnalyticsAllTime',
  'driverAnalytics', 'driverStats', 'driverGrossRankings', 'sortedDispatcherStatsForSalaries',
];
for (const name of calculations) assert.equal(print(initializer(updated, name)), print(initializer(original, name)), name);
const memo = initializer(updated, 'dispatcherStats');
assert.equal(memo.expression.getText(updated), 'useMemo');
assert.equal(print(memo.arguments[0].body), print(initializer(original, 'dispatcherStats')));
console.log(`PASS: ${cases} response/query comparisons and ${calculations.length + 1} unchanged calculation expressions against ${ref}.`);
